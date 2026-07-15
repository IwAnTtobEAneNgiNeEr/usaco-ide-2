"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const settingsStore = require("../settingsStore");
const judgeService = require("../judgeService");
const evidenceStore = require("../evidenceStore");
const verifiedArtifact = require("../verifiedArtifact");
const { recordProblemEvent } = require("../recorder");
const arenaTurn = require("../arena/turn");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// USACO file IO mode: when enabled + a file name is set, the program reads/writes
// <name>.in / <name>.out instead of stdin/stdout.
function fileModeFor(meta) {
  return meta && meta.usacoMode && meta.fileName ? { name: meta.fileName } : null;
}

// A per-problem time limit (meta.timeLimitMs) overrides the global Settings TLE,
// so a 1s Codeforces problem and a 4s one judge correctly side by side.
function effectiveSettings(settings, meta) {
  if (meta && Number(meta.timeLimitMs) > 0) return { ...settings, timeMs: Number(meta.timeLimitMs) };
  return settings;
}

// If the editor sent fresh code, persist it before judging so disk == editor.
async function resolveCode(id, body) {
  if (body && typeof body.code === "string") {
    await problemStore.setFile(id, "code", body.code);
    return body.code;
  }
  return problemStore.getFile(id, "code");
}

// SPJ source when the problem opts in (getFile falls back to the starter checker).
async function resolveChecker(id, meta) {
  return meta && meta.usesChecker ? problemStore.getFile(id, "checker") : null;
}

// True once the client has gone away (closed tab / pressed Stop) — lets the
// judge skip the remaining tests instead of burning CPU on a dead request.
function clientGone(res) {
  let gone = false;
  res.on("close", () => { if (!res.writableEnded) gone = true; });
  return () => gone;
}

// POST /api/problems/:id/run  — compile + run once against input.txt / expected.txt
router.post("/:id/run", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const meta = await problemStore.readMeta(id);
  const fileMode = fileModeFor(meta);
  const code = await resolveCode(id, req.body);
  const checker = await resolveChecker(id, meta);
  const input = await problemStore.getFile(id, "input");
  const expected = await problemStore.getFile(id, "expected");

  const result = await judgeService.compileAndRun({ code, settings: effectiveSettings(settings, meta), input, expected, fileMode, checker });
  const runId = evidenceStore.createRunId();
  let record;

  if (result.compilerMissing) {
    record = await problemStore.recordRun(id, { id: runId, type: "run", verdict: "CE", error: "compiler missing" });
  } else if (!result.compileOk) {
    record = await problemStore.recordRun(id, { id: runId, type: "run", verdict: "CE", timeMs: result.timeMs });
  } else {
    record = await problemStore.recordRun(id, {
      id: runId, type: "run", verdict: result.verdict, timeMs: result.timeMs,
      snapshot: { code, stdout: result.stdout, stderr: result.stderr }
    });
  }
  result.evidence = await evidenceStore.saveRunEvidence(id, {
    record,
    code,
    result,
    fallbackTest: {
      id: "main", name: "Scratch (Input/Expected)", input, expected,
      actual: result.stdout, stderr: result.stderr, diff: result.diff, timeMs: result.timeMs,
    },
  });
  result.completion = {
    created: false,
    verified: false,
    freshWin: false,
    ratedProgress: false,
    reason: "Run là bước khám phá và không tạo completion.",
  };
  result.nextAction = verifiedArtifact.nextAction({
    operation: "run",
    verdict: result.verdict || (result.compileOk === false ? "CE" : "OK"),
    evidence: result.evidence,
  });
  // Fire-and-forget: Game Review's "tested by hand before submitting" signal
  // (README-LOOPS.md §3.2/Flagship-2) is built from this "run" event stream.
  recordProblemEvent(id, "run", { verdict: result.verdict || (result.compileOk === false ? "CE" : "") });
  res.json(result);
}));

// POST /api/problems/:id/judge — compile once + run against every test case
router.post("/:id/judge", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const meta = await problemStore.readMeta(id);
  const hadPriorAcceptance = verifiedArtifact.hasHistoricalAcceptance(meta);
  const fileMode = fileModeFor(meta);
  const code = await resolveCode(id, req.body);
  const checker = await resolveChecker(id, meta);
  const shouldStop = clientGone(res);
  let tests = await problemStore.listTests(id);

  // Optionally judge a single test case (used by the "Run" button on each card).
  const single = !!(req.body && req.body.onlyTestId);
  if (single) {
    tests = tests.filter((t) => t.id === req.body.onlyTestId);
    if (tests.length === 0) {
      return res.status(404).json({ error: "Test case not found." });
    }
  }

  // Fall back to the scratch input/expected as an implicit single test.
  if (tests.length === 0) {
    const input = await problemStore.getFile(id, "input");
    const expected = await problemStore.getFile(id, "expected");
    if (input.trim() || expected.trim()) {
      tests.push({ id: "main", name: "Scratch (Input/Expected)", input, expected });
    }
  }

  if (tests.length === 0) {
    return res.json({
      verdict: "—",
      compileOk: null,
      compile: { stderr: "", timeMs: 0 },
      results: [],
      summary: { total: 0, passed: 0, failed: 0, timeMs: 0 },
      message: "Chưa có test case nào. Thêm test ở tab Test Cases.",
      evidence: null,
      completion: { created: false, verified: false, freshWin: false, ratedProgress: false, reason: "Không có checks để Judge." },
      nextAction: { id: "add-test", state: "work", label: "Thêm test", reason: "Artifact cần ít nhất một check trước khi Verify." }
    });
  }

  const result = await judgeService.compileAndJudge({ code, settings: effectiveSettings(settings, meta), tests, fileMode, checker, shouldStop });

  // Single-test runs are exploratory, and a cancelled judge is a partial one —
  // neither should pollute history / lastVerdict.
  if (!single && !result.cancelled) {
    const runId = evidenceStore.createRunId();
    let record;
    if (result.compilerMissing) {
      record = await problemStore.recordRun(id, { id: runId, type: "judge", verdict: "CE", total: result.summary.total, passed: 0, error: "compiler missing" });
    } else if (!result.compileOk) {
      record = await problemStore.recordRun(id, { id: runId, type: "judge", verdict: "CE", total: result.summary.total, passed: 0, timeMs: result.compile.timeMs });
    } else {
      // Snapshot: store the first failing test's output (or the last) for the timeline.
      const focus = result.results.find((r) => r.status !== "AC") || result.results[result.results.length - 1];
      record = await problemStore.recordRun(id, {
        id: runId, type: "judge",
        verdict: result.verdict,
        timeMs: result.summary.timeMs,
        passed: result.summary.passed,
        total: result.summary.total,
        snapshot: { code, stdout: focus ? focus.actual : "", stderr: focus ? focus.stderr : "" }
      });
    }
    const judgeVerdict = result.compilerMissing || !result.compileOk ? "CE" : result.verdict;
    const focus = result.results.find((r) => r.status !== "AC") || result.results[result.results.length - 1] || tests[0];
    result.evidence = await evidenceStore.saveRunEvidence(id, { record, code, result, fallbackTest: focus });
    const freshWin = judgeVerdict === "AC" && !hadPriorAcceptance;
    result.completion = {
      created: freshWin,
      verified: judgeVerdict === "AC",
      freshWin,
      ratedProgress: false,
      reason: judgeVerdict === "AC"
        ? freshWin ? "Full Judge AC mới cho artifact chưa từng AC." : "Full Judge AC hiện tại; AC cũ không được tính lại là fresh win."
        : `Full Judge ${judgeVerdict} chưa tạo completion.`,
    };
    result.nextAction = verifiedArtifact.nextAction({
      operation: "judge",
      verdict: judgeVerdict,
      intent: req.body && req.body.intent === "derive-module" ? "derive-module" : "competitive",
      evidence: result.evidence,
    });
    // Fire-and-forget: Game Review's timeline (README-LOOPS.md §3.2) is built
    // from this stream of verdicts. Never awaited — must not add latency here.
    recordProblemEvent(id, "verdict", {
      verdict: judgeVerdict,
      timeMs: result.summary.timeMs || 0,
      passed: result.summary.passed || 0,
      total: result.summary.total || 0
    });
    // Đấu Trường (Arena) S2/S3: transition the match + apply rating if this
    // verdict just closed a RATED attempt. Awaited (unlike the recorder line
    // above) because the response below carries the result for a caller that
    // wants it — but any failure here must never cost the student their real
    // judge verdict, so it's fully isolated in try/catch.
    // `meta` here was read at the top of this route, BEFORE recordRun above
    // persisted this verdict's lastVerdict/history — arenaTurn needs that
    // pre-verdict snapshot to correctly judge "was this problem already
    // solved before THIS attempt" (see arena/turn.js computeEligibility).
    try {
      result.arena = await arenaTurn.onJudgeVerdict({ id, verdict: judgeVerdict, meta });
    } catch { /* Arena bookkeeping is best-effort — the judge result itself is already final */ }
    result.completion.ratedProgress = Boolean(result.arena && result.arena.rating);
  } else {
    const exploratoryVerdict = result.compilerMissing || !result.compileOk ? "CE" : result.verdict;
    result.evidence = null;
    result.completion = {
      created: false, verified: false, freshWin: false, ratedProgress: false,
      reason: result.cancelled ? "Judge bị hủy nên không tạo completion." : "Single-test Judge là exploratory và không tạo completion.",
    };
    result.nextAction = verifiedArtifact.nextAction({ operation: "run", verdict: exploratoryVerdict });
  }

  res.json(result);
}));

module.exports = router;
