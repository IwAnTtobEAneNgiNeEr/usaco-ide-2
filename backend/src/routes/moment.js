"use strict";

// POST /api/problems/:id/moment-diagnose — the Khoảnh Khắc autopilot's AI
// stage (README-AUTOPILOT.md). Fired BY THE FRONTEND THE MOMENT a failing
// judge verdict lands — no user click. Streams the coach's diagnosis as SSE:
//
//   data: {"stage":"start","cached":false}
//   data: {"delta":"…"}                          (repeated — raw model text)
//   data: {"done":true,"diagnosis":{…}}          (authoritative parsed result)
//   on failure: data: {"error":"…","code":"…"}
//
// Body: { verdict, test: {testId,input,expected,actual,stderr}, code?, timeMs?, limitMs? }
// The failing test's I/O comes from the client — judge results already carry
// input/expected/actual, so no re-run is needed. `code` is the editor buffer
// (falls back to the saved file).
//
// Cost discipline: a sha1 of (code, testId, input, verdict) keys a small
// on-disk cache — re-judging unchanged code replays the diagnosis for free.
//
// Honesty discipline (README-LOOPS.md §1.2): the parsed diagnosis is a
// HYPOTHESIS and is labeled as such in the UI. Every accepted diagnosis is
// persisted as an evidence file, and only then does the Student Model get a
// recurringBugs entry pointing at it — the first real B2 writer.

const path = require("path");
const express = require("express");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const config = require("../config");
const ai = require("../ai");
const runCpp = require("../runCpp");
const orchestrator = require("../autopsy/orchestrator");
const { shrinkInput } = require("../autopsy/shrink");
const studentModel = require("../studentModel");
const cardStore = require("../arena/cardStore");
const { recordProblemEvent } = require("../recorder");
const { buildDiagnoseMessages, parseDiagnosis, cacheKey } = require("../moment/diagnose");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

const CACHE_MAX = 20; // per-problem: plenty for one debugging session
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json"); // S5 — Tàng Kinh Bug

// README-AUTOPILOT.md M4 — a large failing input buries the signal (both for
// the model's prompt budget and for the student staring at a wall of text).
// Shrink it BEFORE diagnosing, using the exact engine WA Autopsy already
// proved (backend/src/autopsy/shrink.js). The oracle differs by verdict:
//   WA  — a shrunk input has a DIFFERENT correct answer than the original, so
//         only a sample-verified reference solution can say what's "wrong"
//         (reuses orchestrator.ensureReference/runAutopsy verbatim).
//   RE/TLE — the student's OWN crash/timeout on the candidate IS the oracle;
//         no reference needed, so this path stays fast and free even without
//         an AI key for the reference (only the diagnosis step needs a key).
// Best-effort throughout: any failure here just leaves `test` untouched and
// diagnosis proceeds on the original (unshrunk) input — shrinking is a nice-
// to-have, never a blocker.
const SHRINK_INPUT_THRESHOLD = 400; // chars
const SHRINK_MAX_RUNS = 80;
const SHRINK_MAX_MS = 8000;

function fileModeFor(meta) {
  return meta && meta.usacoMode && meta.fileName ? { name: meta.fileName } : null;
}

async function autoShrinkIfLarge({ verdict, test, judgeSettings, aiSettings, meta, statement, code, sse }) {
  if (!test.input || test.input.length <= SHRINK_INPUT_THRESHOLD) return test;

  let studentBuilt;
  try {
    studentBuilt = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (!studentBuilt || studentBuilt.compilerMissing || !studentBuilt.ok) return test;

    const fileMode = fileModeFor(meta);
    const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), 3000);
    const runStudent = (candidate) => runCpp.runBinary({ binaryPath: studentBuilt.binaryPath, input: candidate, timeMs: limit, fileMode });

    if (verdict === "WA") {
      const reference = await orchestrator.ensureReference({
        aiSettings, judgeSettings, statement, samples: ai.extractSamples(statement),
      });
      if (!reference.ok) return test; // no trustworthy reference — degrade to diagnosing the original input
      try {
        const result = await orchestrator.runAutopsy({
          failingInput: test.input, runStudent, runReference: reference.run,
          maxShrinkRuns: SHRINK_MAX_RUNS, maxShrinkMs: SHRINK_MAX_MS,
        });
        if (!result.ok) return test;
        sse({
          stage: "shrunk", trustworthy: true,
          fromBytes: result.shrink.fromBytes, toBytes: result.shrink.toBytes, runs: result.shrink.runs, durationMs: result.shrink.durationMs,
          minimalInput: result.minimalInput, expectedOutput: result.expectedOutput, studentOutput: result.studentOutput,
        });
        return { ...test, input: result.minimalInput, expected: result.expectedOutput, actual: result.studentOutput };
      } finally {
        await reference.cleanup();
      }
    }

    // RE/TLE: does the SAME failure class still reproduce on this candidate?
    const isInteresting = async (candidate) => (await runStudent(candidate)).status === verdict;
    if (!(await isInteresting(test.input))) return test; // not reproducing right now — leave as-is
    const shrunk = await shrinkInput(test.input, isInteresting, { maxRuns: SHRINK_MAX_RUNS, maxMs: SHRINK_MAX_MS });
    if (shrunk.toBytes >= shrunk.fromBytes) return test; // no real improvement
    const fresh = await runStudent(shrunk.input);
    sse({
      stage: "shrunk", trustworthy: false,
      fromBytes: shrunk.fromBytes, toBytes: shrunk.toBytes, runs: shrunk.runs, durationMs: shrunk.durationMs,
      minimalInput: shrunk.input, studentOutput: fresh.stdout, stderr: fresh.stderr,
    });
    // `expected` is left untouched: it answered the ORIGINAL input, not this
    // smaller one, and RE/TLE diagnosis only needs "it still crashes/hangs",
    // not a correct-answer comparison — the frontend labels it accordingly.
    return { ...test, input: shrunk.input, actual: fresh.stdout, stderr: fresh.stderr };
  } catch {
    return test;
  } finally {
    if (studentBuilt && !studentBuilt.compilerMissing) await runCpp.cleanupWorkdir(studentBuilt.workdir);
  }
}

function momentDir(id) {
  return path.join(fileStore.problemDir(id), "moment");
}

async function readCache(id) {
  return (await fileStore.readJson(path.join(momentDir(id), "cache.json"), null)) || { entries: {} };
}

async function writeCache(id, cache) {
  const keys = Object.keys(cache.entries);
  if (keys.length > CACHE_MAX) {
    // Drop oldest by savedAt — a tiny map, sorting is fine.
    keys
      .sort((a, b) => (cache.entries[a].savedAt || 0) - (cache.entries[b].savedAt || 0))
      .slice(0, keys.length - CACHE_MAX)
      .forEach((k) => delete cache.entries[k]);
  }
  await fileStore.writeJson(path.join(momentDir(id), "cache.json"), cache);
}

/** Persist evidence + feed the Student Model. Fire-and-forget: the student's
 *  card must never wait on bookkeeping. */
function persistDiagnosis(id, { verdict, testId, key, diagnosis, cached }) {
  (async () => {
    const savedAt = Date.now();
    const evidenceRel = `moment/${savedAt}.json`;
    if (!cached) {
      await fileStore.writeJson(path.join(momentDir(id), `${savedAt}.json`), {
        version: 1, problemId: id, verdict, testId, key, diagnosis, savedAt,
      });
      if (diagnosis.ok && diagnosis.tag !== "khac") {
        await studentModel.noteRecurringBug(STUDENT_MODEL_FILE, {
          tag: diagnosis.tag,
          seenAt: new Date(savedAt).toISOString().slice(0, 10),
          evidence: `problems/${id}/${evidenceRel}`,
        });
        // Đấu Trường S5: the same successful diagnosis mints/levels a Bug Card —
        // same evidence pointer, same "khac excluded" rule as the line above.
        await cardStore.mint(CARDS_FILE, diagnosis.tag, {
          seenAt: new Date(savedAt).toISOString(),
          evidence: `problems/${id}/${evidenceRel}`,
        });
      }
    }
    recordProblemEvent(id, "moment", { verdict, tag: diagnosis.tag || "khac", cached: Boolean(cached) });
  })().catch(() => { /* bookkeeping must never break the stream */ });
}

router.post("/:id/moment-diagnose", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const body = req.body || {};
  const verdict = ["WA", "RE", "TLE"].includes(body.verdict) ? body.verdict : null;
  const test = body.test || {};
  if (!verdict) return res.status(400).json({ ok: false, error: "Verdict không hợp lệ cho chẩn đoán." });
  if (typeof test.input !== "string") return res.status(400).json({ ok: false, error: "Thiếu test đang fail." });

  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) {
    return res.status(400).json({ ok: false, error: ai.NO_KEY_MESSAGE, code: "NO_KEY" });
  }

  const code = typeof body.code === "string" && body.code.trim()
    ? body.code
    : await problemStore.getFile(id, "code");
  const statement = await problemStore.getFile(id, "statement");

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const sse = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ } };

  const key = cacheKey({ code, testId: test.testId, input: test.input, verdict });

  try {
    const cache = await readCache(id);
    const hit = cache.entries[key];
    if (hit && hit.diagnosis && hit.diagnosis.ok) {
      sse({ stage: "start", cached: true });
      sse({ done: true, diagnosis: hit.diagnosis, cached: true });
      persistDiagnosis(id, { verdict, testId: test.testId, key, diagnosis: hit.diagnosis, cached: true });
      return res.end();
    }

    sse({ stage: "start", cached: false });

    // The student closing the card (or re-judging) aborts the upstream call.
    const upstreamAbort = new AbortController();
    req.on("close", () => upstreamAbort.abort());

    const judgeSettings = await settingsStore.getSettings();
    const meta = await problemStore.readMeta(id);
    const diagTest = await autoShrinkIfLarge({
      verdict, test, judgeSettings, aiSettings: settings, meta, statement, code, sse,
    });

    const { messages, lineCount } = buildDiagnoseMessages({
      statement, code, verdict, test: diagTest, timeMs: body.timeMs, limitMs: body.limitMs,
    });

    let raw = "";
    try {
      raw = await ai.chat({
        settings,
        messages,
        maxTokens: 400,
        timeoutMs: 60000,
        stream: true,
        signal: upstreamAbort.signal,
        onDelta: (d) => sse({ delta: d }), // chat() returns the full text when done
      });
    } catch (error) {
      if (upstreamAbort.signal.aborted) return res.end();
      throw error;
    }

    const diagnosis = parseDiagnosis(raw, lineCount);
    if (diagnosis.ok) {
      cache.entries[key] = { diagnosis, savedAt: Date.now() };
      await writeCache(id, cache);
      persistDiagnosis(id, { verdict, testId: test.testId, key, diagnosis, cached: false });
    }
    sse({ done: true, diagnosis });
  } catch (error) {
    sse({ error: error.message || "Chẩn đoán thất bại.", code: error.code || "" });
  } finally {
    res.end();
  }
}));

module.exports = router;
