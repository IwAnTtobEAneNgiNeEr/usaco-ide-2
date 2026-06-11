"use strict";

// judgeService.js — pure compile/run/judge helpers built on runCpp. No store or
// HTTP coupling, so any domain (problems, contests) can reuse them. The existing
// problems judge route is intentionally left as-is; the contest route uses these.

const runCpp = require("./runCpp");
// NOTE: peak-memory sampling (memSampler.js) is intentionally NOT wired into the
// run loop — on Windows it spawns a PowerShell monitor per run, which would slow
// judging and still miss sub-200ms programs. Until that's solved without a speed
// cost, the judge never produces an MLE verdict (see runner.js `known`).

const COMPILER_MISSING_MESSAGE =
  "Không tìm thấy g++. Hãy cài MinGW (hoặc g++) hoặc cấu hình đường dẫn compiler trong Settings.";

// Compile `code` once and run it against `tests` (each { id, name, input, expected }).
// fileMode: { name } enables USACO-style file IO. Returns the judge UI shape.
async function compileAndJudge({ code, settings, tests, fileMode }) {
  const list = Array.isArray(tests) ? tests : [];
  const workdir = await runCpp.createWorkdir();
  try {
    const compile = await runCpp.compileSource({ code, settings, workdir });
    if (compile.compilerMissing) {
      return {
        verdict: "CE", compileOk: false, compilerMissing: true,
        compile: { stderr: COMPILER_MISSING_MESSAGE, timeMs: 0 },
        results: [], summary: { total: list.length, passed: 0, failed: list.length, timeMs: 0 }
      };
    }
    if (!compile.ok) {
      return {
        verdict: "CE", compileOk: false,
        compile: { stderr: compile.stderr, timeMs: compile.timeMs },
        results: [], summary: { total: list.length, passed: 0, failed: list.length, timeMs: 0 }
      };
    }

    const results = [];
    let totalTime = 0;
    for (const test of list) {
      const run = await runCpp.runBinary({ binaryPath: compile.binaryPath, input: test.input, timeMs: settings.timeMs, fileMode });
      totalTime += run.runtimeMs;

      let status = run.status; // OK | TLE | RE
      let diff = null;
      if (run.status === "OK") {
        const cmp = runCpp.compareOutput(test.expected, run.stdout, settings.compareMode, { epsilon: settings.epsilon });
        status = cmp.ok ? "AC" : "WA";
        diff = cmp.diff;
      }
      results.push({
        testId: test.id, name: test.name, status,
        input: test.input, expected: test.expected, actual: run.stdout,
        stderr: run.stderr, timeMs: run.runtimeMs, diff
      });
    }

    const verdict = runCpp.overallVerdict(results.map((r) => r.status));
    const passed = results.filter((r) => r.status === "AC").length;
    return {
      verdict, compileOk: true,
      compile: { stderr: compile.stderr, timeMs: compile.timeMs },
      results,
      summary: { total: results.length, passed, failed: results.length - passed, timeMs: totalTime }
    };
  } finally {
    await runCpp.cleanupWorkdir(workdir);
  }
}

// Single compile + run against one input (+ optional expected). Mirrors /run.
async function compileAndRun({ code, settings, input, expected, fileMode }) {
  const hasExpected = String(expected || "").trim().length > 0;
  const workdir = await runCpp.createWorkdir();
  try {
    const compile = await runCpp.compileSource({ code, settings, workdir });
    if (compile.compilerMissing) {
      return { verdict: "CE", compileOk: false, compilerMissing: true, runtimeOk: false, stdout: "", stderr: COMPILER_MISSING_MESSAGE, timeMs: 0, diff: null, hasExpected };
    }
    if (!compile.ok) {
      return { verdict: "CE", compileOk: false, runtimeOk: false, stdout: "", stderr: compile.stderr, timeMs: compile.timeMs, diff: null, hasExpected };
    }
    const run = await runCpp.runBinary({ binaryPath: compile.binaryPath, input, timeMs: settings.timeMs, fileMode });
    let verdict = run.status;
    let diff = null;
    if (run.status === "OK" && hasExpected) {
      const cmp = runCpp.compareOutput(expected, run.stdout, settings.compareMode, { epsilon: settings.epsilon });
      verdict = cmp.ok ? "AC" : "WA";
      diff = cmp.diff;
    }
    return { verdict, compileOk: true, runtimeOk: run.status === "OK", stdout: run.stdout, stderr: run.stderr, timeMs: run.runtimeMs, diff, hasExpected };
  } finally {
    await runCpp.cleanupWorkdir(workdir);
  }
}

module.exports = { compileAndJudge, compileAndRun, COMPILER_MISSING_MESSAGE };
