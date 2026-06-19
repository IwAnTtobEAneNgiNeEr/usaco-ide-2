"use strict";

// judgeService.js — pure compile/run/judge helpers built on runCpp. No store or
// HTTP coupling, so any domain (problems, contests) can reuse them.

const os = require("os");
const path = require("path");
const fsp = require("fs/promises");
const runCpp = require("./runCpp");
// NOTE: peak-memory sampling (memSampler.js) is intentionally NOT wired into the
// run loop — on Windows it spawns a PowerShell monitor per run, which would slow
// judging and still miss sub-200ms programs. Until that's solved without a speed
// cost, the judge never produces an MLE verdict (see runner.js `known`).

const COMPILER_MISSING_MESSAGE =
  "Không tìm thấy g++. Hãy cài MinGW (hoặc g++) hoặc cấu hình đường dẫn compiler trong Settings.";

// How many tests run at once. Half the cores (capped) keeps single-threaded
// contest programs from fighting each other for CPU, so measured runtimes stay
// close to a quiet machine. USACO file mode shares one <name>.in/<name>.out in
// the binary's cwd, so it must stay sequential.
function judgeConcurrency(testCount, fileMode) {
  if (fileMode) return 1;
  const cores = (os.cpus() || []).length || 2;
  return Math.max(1, Math.min(4, Math.floor(cores / 2), testCount));
}

// Run fn over items with at most `limit` in flight; results keep item order.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---------------------------------------------------------------------------
// Special judge (SPJ). The checker is compiled once per judge (the binary cache
// in runCpp makes repeats free) and invoked per test with
//   argv = <input_file> <expected_file> <actual_file>
// exit 0 = Accepted, non-zero = Wrong Answer; anything it prints becomes the
// test's checkerMessage.
// ---------------------------------------------------------------------------

const CHECKER_TIME_MS = 10000;
const CHECKER_MSG_MAX = 2000;

async function runCheckerOnce({ binaryPath, workdir, idx, input, expected, actual }) {
  const inFile = path.join(workdir, `t${idx}.in`);
  const ansFile = path.join(workdir, `t${idx}.ans`);
  const outFile = path.join(workdir, `t${idx}.out`);
  await Promise.all([
    fsp.writeFile(inFile, input == null ? "" : String(input), "utf8"),
    fsp.writeFile(ansFile, expected == null ? "" : String(expected), "utf8"),
    fsp.writeFile(outFile, actual == null ? "" : String(actual), "utf8")
  ]);
  const r = await runCpp.runBinary({
    binaryPath, input: "", timeMs: CHECKER_TIME_MS, args: [inFile, ansFile, outFile]
  });
  // Drop runBinary's synthetic "Process exited with code N." — for a checker a
  // non-zero exit is the normal WA signal, not an error worth narrating.
  const stderr = (r.stderr || "").replace(/^Process exited with code \d+\.$/m, "").trim();
  const message = `${r.stdout || ""}${stderr ? (r.stdout ? "\n" : "") + stderr : ""}`
    .trim().slice(0, CHECKER_MSG_MAX);
  if (r.status === "TLE") return { ok: false, message: "checker timed out" };
  return { ok: r.status === "OK", message };
}

// Compile the checker source. Returns { ctx } on success (caller must clean up
// ctx.workdir) or { error } — a judge-shaped CE result naming checker.cpp.
async function prepareChecker(checker, settings, testCount) {
  const c = await runCpp.compileStandalone({ code: checker, settings });
  if (c.ok) return { ctx: { binaryPath: c.binaryPath, workdir: c.workdir } };
  await runCpp.cleanupWorkdir(c.workdir);
  return {
    error: {
      verdict: "CE", compileOk: false, checkerBroken: true,
      compile: { stderr: "checker.cpp: " + (c.stderr || "compile failed"), timeMs: c.timeMs },
      results: [], summary: { total: testCount, passed: 0, failed: testCount, timeMs: 0 }
    }
  };
}

// Compile `code` once and run it against `tests` (each { id, name, input, expected }).
// fileMode: { name } enables USACO-style file IO. checker: SPJ source (optional).
// shouldStop: polled between tests — when it turns true (client disconnected),
// remaining tests are skipped and the partial result is flagged `cancelled`.
// Returns the judge UI shape.
async function compileAndJudge({ code, settings, tests, fileMode, checker, shouldStop }) {
  const list = Array.isArray(tests) ? tests : [];
  const stop = typeof shouldStop === "function" ? shouldStop : () => false;
  const workdir = await runCpp.createWorkdir();
  let checkerCtx = null;
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

    if (checker && String(checker).trim()) {
      const prepared = await prepareChecker(checker, settings, list.length);
      if (prepared.error) return prepared.error;
      checkerCtx = prepared.ctx;
    }

    // Turn one raw run into the per-test result row (compare / SPJ included).
    const evaluate = async (test, idx, run) => {
      let status = run.status; // OK | TLE | RE
      let diff = null;
      let checkerMessage = null;
      if (run.status === "OK") {
        if (checkerCtx) {
          const c = await runCheckerOnce({ ...checkerCtx, idx, input: test.input, expected: test.expected, actual: run.stdout });
          status = c.ok ? "AC" : "WA";
          checkerMessage = c.message || null;
          // The line diff is advisory next to an SPJ (expected is just a reference).
          if (!c.ok) diff = runCpp.compareOutput(test.expected, run.stdout, "loose").diff;
        } else {
          const cmp = runCpp.compareOutput(test.expected, run.stdout, settings.compareMode, { epsilon: settings.epsilon });
          status = cmp.ok ? "AC" : "WA";
          diff = cmp.diff;
        }
      }
      return {
        testId: test.id, name: test.name, status,
        input: test.input, expected: test.expected, actual: run.stdout,
        stderr: run.stderr, timeMs: run.runtimeMs, diff, checkerMessage
      };
    };

    const judgeOne = async (test, idx) => {
      const run = await runCpp.runBinary({ binaryPath: compile.binaryPath, input: test.input, timeMs: settings.timeMs, fileMode });
      return evaluate(test, idx, run);
    };

    const concurrency = judgeConcurrency(list.length, fileMode);
    const results = await mapLimit(list, concurrency, async (test, idx) => {
      if (stop()) return null;
      return judgeOne(test, idx);
    });

    // Parallel runs share the CPU, so a borderline solution can pick up a
    // spurious TLE from scheduling noise. Re-run TLEs alone, serially, and
    // keep the verdict the quiet machine produces. Once one TLE is CONFIRMED
    // the overall verdict is settled — stop re-confirming, so a genuinely-slow
    // solution pays at most one extra time limit instead of one per test.
    if (concurrency > 1) {
      for (let i = 0; i < results.length; i += 1) {
        const r = results[i];
        if (!r || r.status !== "TLE" || stop()) continue;
        const run = await runCpp.runBinary({ binaryPath: compile.binaryPath, input: list[i].input, timeMs: settings.timeMs, fileMode });
        results[i] = await evaluate(list[i], i, run);
        if (results[i].status === "TLE") break;
      }
    }

    const done = results.filter(Boolean);
    const verdict = runCpp.overallVerdict(done.map((r) => r.status));
    const passed = done.filter((r) => r.status === "AC").length;
    let totalTime = 0;
    for (const r of done) totalTime += r.timeMs;
    return {
      verdict, compileOk: true, cancelled: stop() || undefined,
      compile: { stderr: compile.stderr, timeMs: compile.timeMs },
      results: done,
      summary: { total: done.length, passed, failed: done.length - passed, timeMs: totalTime }
    };
  } finally {
    await runCpp.cleanupWorkdir(workdir);
    if (checkerCtx) await runCpp.cleanupWorkdir(checkerCtx.workdir);
  }
}

// Single compile + run against one input (+ optional expected). Mirrors /run.
async function compileAndRun({ code, settings, input, expected, fileMode, checker }) {
  const hasExpected = String(expected || "").trim().length > 0;
  const workdir = await runCpp.createWorkdir();
  let checkerCtx = null;
  try {
    const compile = await runCpp.compileSource({ code, settings, workdir });
    if (compile.compilerMissing) {
      return { verdict: "CE", compileOk: false, compilerMissing: true, runtimeOk: false, stdout: "", stderr: COMPILER_MISSING_MESSAGE, timeMs: 0, diff: null, hasExpected };
    }
    if (!compile.ok) {
      return { verdict: "CE", compileOk: false, runtimeOk: false, stdout: "", stderr: compile.stderr, timeMs: compile.timeMs, diff: null, hasExpected };
    }

    if (checker && String(checker).trim() && hasExpected) {
      const prepared = await prepareChecker(checker, settings, 1);
      if (prepared.error) {
        return { verdict: "CE", compileOk: false, checkerBroken: true, runtimeOk: false, stdout: "", stderr: prepared.error.compile.stderr, timeMs: prepared.error.compile.timeMs, diff: null, hasExpected };
      }
      checkerCtx = prepared.ctx;
    }

    const run = await runCpp.runBinary({ binaryPath: compile.binaryPath, input, timeMs: settings.timeMs, fileMode });
    let verdict = run.status;
    let diff = null;
    let checkerMessage = null;
    if (run.status === "OK" && hasExpected) {
      if (checkerCtx) {
        const c = await runCheckerOnce({ ...checkerCtx, idx: 0, input, expected, actual: run.stdout });
        verdict = c.ok ? "AC" : "WA";
        checkerMessage = c.message || null;
        if (!c.ok) diff = runCpp.compareOutput(expected, run.stdout, "loose").diff;
      } else {
        const cmp = runCpp.compareOutput(expected, run.stdout, settings.compareMode, { epsilon: settings.epsilon });
        verdict = cmp.ok ? "AC" : "WA";
        diff = cmp.diff;
      }
    }
    return { verdict, compileOk: true, runtimeOk: run.status === "OK", stdout: run.stdout, stderr: run.stderr, timeMs: run.runtimeMs, diff, hasExpected, checkerMessage };
  } finally {
    await runCpp.cleanupWorkdir(workdir);
    if (checkerCtx) await runCpp.cleanupWorkdir(checkerCtx.workdir);
  }
}

module.exports = { compileAndJudge, compileAndRun, COMPILER_MISSING_MESSAGE, mapLimit, judgeConcurrency };
