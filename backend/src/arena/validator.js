"use strict";

// validator.js — thin (compile+run) core of "Người Gác Cổng" (S12). Same
// discipline as verifyTests.js: compile once, run against an input, report
// exit-0-means-valid. This is the missing half of the trust chain — verifyTests
// already checks whether a test's OUTPUT is trustworthy; this checks whether
// its INPUT even respects the problem's own constraints.
//
// Not pure (compiles/runs a real binary) — same tier as verifyTests.js/
// autopsy/orchestrator.js's ensureReference, deliberately thin and isolated
// so the actual compile/run plumbing lives in exactly one place (runCpp.js).

const runCpp = require("../runCpp");

const PER_RUN_MS = 2000;

/**
 * @returns {{compiled:boolean, compilerMissing?:boolean, valid?:boolean, stderr?:string}}
 * `valid` is only meaningful when `compiled` is true. A validator that fails
 * to compile NEVER blocks anything — the caller degrades to "not checked".
 */
async function checkInputAgainstValidator({ code, input, judgeSettings }) {
  const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
  try {
    if (built.compilerMissing) return { compiled: false, compilerMissing: true };
    if (!built.ok) return { compiled: false, compilerMissing: false, stderr: built.stderr };
    const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
    const r = await runCpp.runBinary({ binaryPath: built.binaryPath, input, timeMs: limit });
    return { compiled: true, valid: r.status === "OK", status: r.status, stderr: r.stderr };
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
}

module.exports = { checkInputAgainstValidator };
