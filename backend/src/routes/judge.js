"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const settingsStore = require("../settingsStore");
const judgeService = require("../judgeService");
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

// POST /api/problems/:id/run  — compile + run once against input.txt / expected.txt
router.post("/:id/run", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const meta = await problemStore.readMeta(id);
  const fileMode = fileModeFor(meta);
  const code = await resolveCode(id, req.body);
  const input = await problemStore.getFile(id, "input");
  const expected = await problemStore.getFile(id, "expected");

  const result = await judgeService.compileAndRun({ code, settings: effectiveSettings(settings, meta), input, expected, fileMode });

  if (result.compilerMissing) {
    await problemStore.recordRun(id, { type: "run", verdict: "CE", error: "compiler missing" });
  } else if (!result.compileOk) {
    await problemStore.recordRun(id, { type: "run", verdict: "CE", timeMs: result.timeMs });
  } else {
    await problemStore.recordRun(id, {
      type: "run", verdict: result.verdict, timeMs: result.timeMs,
      snapshot: { code, stdout: result.stdout, stderr: result.stderr }
    });
  }
  res.json(result);
}));

// POST /api/problems/:id/judge — compile once + run against every test case
router.post("/:id/judge", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const meta = await problemStore.readMeta(id);
  const fileMode = fileModeFor(meta);
  const code = await resolveCode(id, req.body);
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
      message: "Chưa có test case nào. Thêm test ở tab Test Cases."
    });
  }

  const result = await judgeService.compileAndJudge({ code, settings: effectiveSettings(settings, meta), tests, fileMode });

  // Single-test runs are exploratory — don't pollute history / lastVerdict.
  if (!single) {
    if (result.compilerMissing) {
      await problemStore.recordRun(id, { type: "judge", verdict: "CE", total: result.summary.total, passed: 0, error: "compiler missing" });
    } else if (!result.compileOk) {
      await problemStore.recordRun(id, { type: "judge", verdict: "CE", total: result.summary.total, passed: 0, timeMs: result.compile.timeMs });
    } else {
      // Snapshot: store the first failing test's output (or the last) for the timeline.
      const focus = result.results.find((r) => r.status !== "AC") || result.results[result.results.length - 1];
      await problemStore.recordRun(id, {
        type: "judge",
        verdict: result.verdict,
        timeMs: result.summary.timeMs,
        passed: result.summary.passed,
        total: result.summary.total,
        snapshot: { code, stdout: focus ? focus.actual : "", stderr: focus ? focus.stderr : "" }
      });
    }
  }

  res.json(result);
}));

module.exports = router;
