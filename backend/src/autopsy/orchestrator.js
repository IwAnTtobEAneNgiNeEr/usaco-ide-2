"use strict";

// orchestrator.js — WA Autopsy state machine (README-LOOPS.md task A1).
//
//   ENSURE_REFERENCE  (compile an AI "brute" solution, verify it against the
//                      official samples before trusting it — mirrors the
//                      trust discipline in verifyTests.js, but keeps the
//                      compiled binary alive for many runs instead of just
//                      recomputing a fixed test list)
//        -> SHRINK      (delta-debug the ALREADY-FAILING input the student
//                       just got WA/RE on down to a minimal certificate)
//        -> PACK        (Evidence Pack v1)
//
// No HUNT stage in v1: this app's judge is local and file-based (no hidden
// tests), so a concrete failing input is always in hand the moment a verdict
// comes back — there is nothing to fuzz for. Generating NEW inputs to widen
// coverage beyond the student's own tests is real future work (reuse the lab
// Stress Tester as the generator), tracked in README-LOOPS.md as P2
// enrichment, not reinvented here.
//
// buildOracle/runAutopsy/buildEvidencePack take runStudent/runReference as
// injected functions — (input) => {status, stdout} — so the state machine is
// fully unit-testable without a compiler. ensureReference is the one function
// that actually shells out (via runCpp) and calls the AI (via ai.js); it is
// the thin, deliberately-not-pure edge of this module.

const runCpp = require("../runCpp");
const ai = require("../ai");
const { shrinkInput } = require("./shrink");

const PER_TEST_MS = 3000; // hard per-run cap for the (possibly slow) reference

/**
 * Compile an AI-written brute-force reference and cross-check it against the
 * problem's official samples before trusting anything it computes. Returns a
 * `run(input)` closure the caller can call as many times as shrinking needs,
 * plus a `cleanup()` to release the compiled workdir when done.
 */
async function ensureReference({ aiSettings, judgeSettings, statement, samples }) {
  const compiler = await runCpp.checkCompiler(judgeSettings);
  if (!compiler.available) {
    return { ok: false, reason: "no-compiler", note: "g++ chưa sẵn sàng — không thể tạo lời giải tham chiếu." };
  }

  let refCode;
  try {
    refCode = await ai.generateHelper({ settings: aiSettings, statement, kind: "brute" });
  } catch (error) {
    return { ok: false, reason: "generate-failed", note: `Không sinh được lời giải tham chiếu: ${error.message}` };
  }

  const built = await runCpp.compileStandalone({ code: refCode, settings: judgeSettings });
  if (built.compilerMissing || !built.ok) {
    await runCpp.cleanupWorkdir(built.workdir);
    return { ok: false, reason: "compile-failed", note: "Lời giải tham chiếu không biên dịch được." };
  }

  const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_TEST_MS);
  const run = (input) => runCpp.runBinary({ binaryPath: built.binaryPath, input, timeMs: limit });

  const sampleList = (Array.isArray(samples) ? samples : []).filter((s) => s && s.output && String(s.output).trim());
  let trusted = sampleList.length > 0;
  let checked = 0;
  for (const s of sampleList) {
    const r = await run(s.input);
    if (r.status !== "OK" || !runCpp.compareOutput(s.output, r.stdout, "loose").ok) {
      trusted = false;
      break;
    }
    checked += 1;
  }

  return {
    ok: true,
    trusted,
    samplesChecked: checked,
    run,
    cleanup: () => runCpp.cleanupWorkdir(built.workdir),
    note: trusted
      ? `🔬 Lời giải tham chiếu khớp ${checked} sample chính thức.`
      : sampleList.length
        ? "⚠ Lời giải tham chiếu KHÔNG khớp sample chính thức — chưa kiểm chứng."
        : "Không có sample để đối chiếu — lời giải tham chiếu chưa kiểm chứng.",
  };
}

/**
 * "Interesting" for the shrink engine: the reference must still run cleanly
 * (an untrustworthy candidate — reference RE/TLE — proves nothing about the
 * student's bug), AND the student's behavior must diverge from it (wrong
 * output, or a crash/timeout the reference doesn't share).
 */
function buildOracle({ runStudent, runReference, compareMode = "loose" }) {
  return async function isInteresting(candidateInput) {
    const [studentResult, referenceResult] = await Promise.all([
      runStudent(candidateInput),
      runReference(candidateInput),
    ]);
    if (referenceResult.status !== "OK") return false;
    if (studentResult.status !== "OK") return true;
    return !runCpp.compareOutput(referenceResult.stdout, studentResult.stdout, compareMode).ok;
  };
}

/**
 * Core pipeline: verify the original failing input actually reproduces the
 * bug (against THIS reference), then shrink it down. Returns the pieces
 * `buildEvidencePack` needs — it does not write anything to disk itself.
 */
async function runAutopsy({
  failingInput,
  runStudent,
  runReference,
  maxShrinkRuns = 300,
  maxShrinkMs = 30000,
  compareMode = "loose",
}) {
  const isInteresting = buildOracle({ runStudent, runReference, compareMode });

  if (!(await isInteresting(failingInput))) {
    return {
      ok: false,
      reason: "not-reproducible",
      note: "Không tái hiện được lỗi với lời giải tham chiếu — có thể TLE/RE tạm thời, hoặc tham chiếu chưa đáng tin.",
    };
  }

  const shrinkResult = await shrinkInput(failingInput, isInteresting, { maxRuns: maxShrinkRuns, maxMs: maxShrinkMs });
  const [studentRun, referenceRun] = await Promise.all([
    runStudent(shrinkResult.input),
    runReference(shrinkResult.input),
  ]);

  return {
    ok: true,
    minimalInput: shrinkResult.input,
    expectedOutput: referenceRun.stdout,
    studentOutput: studentRun.stdout,
    studentStatus: studentRun.status,
    shrink: {
      runs: shrinkResult.runs,
      fromBytes: shrinkResult.fromBytes,
      toBytes: shrinkResult.toBytes,
      durationMs: shrinkResult.durationMs,
    },
  };
}

/** Pure formatter: assembles the Evidence Pack v1 shape (README-LOOPS.md §3.1). */
function buildEvidencePack({
  problemId,
  trigger,
  minimalInput,
  expectedOutput,
  studentOutput,
  shrink,
  reference,
  generator,
  studentCodeSnapshot,
}) {
  return {
    version: 1,
    problemId,
    trigger,
    minimalInput,
    expectedOutput,
    studentOutput,
    shrink,
    reference,
    // v1 has no HUNT/fuzz stage — the input is the student's own existing
    // test, honestly labeled as such rather than implying AI generation.
    generator: generator || { kind: "existing-test", seed: null },
    studentCodeSnapshot,
    diagnosis: null,
  };
}

module.exports = { ensureReference, buildOracle, runAutopsy, buildEvidencePack };
