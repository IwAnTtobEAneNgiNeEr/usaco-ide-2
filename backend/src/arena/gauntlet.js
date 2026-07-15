"use strict";

// gauntlet.js — "Đấu Trường" S1: the Gauntlet. After an AC, the system tries
// to BREAK the student's own code using a persisted generator + reference
// (see referenceStore.js) — this is the HUNT stage the WA Autopsy orchestrator
// explicitly deferred ("no hidden tests here, so there's nothing to fuzz for
// today" — README-LOOPS.md §2b). Once a student's code is trusted to AC on
// their own tests, hunting for a counterexample the AI's generator can find is
// exactly that deferred work, now built.
//
// Split into a PURE seed-search core (this file's `huntFailingSeed`, tested
// with fake runners exactly like autopsy/orchestrator.js's buildOracle) and a
// thin orchestration layer (`runPostAcGauntlet`) that is the non-pure edge:
// it compiles things, asks the AI when the vault is empty, and calls back into
// autopsy/orchestrator.js's `runAutopsy` to shrink a found counterexample —
// re-using the exact same shrink engine WA Autopsy already proved, rather than
// re-deriving a second one.

const runCpp = require("../runCpp");
const ai = require("../ai");
const referenceStore = require("./referenceStore");
const orchestrator = require("../autopsy/orchestrator");
const { statementHash } = require("../trustLayer");

const DEFAULT_BUDGET_MS = 8000;
const DEFAULT_MAX_SEEDS = 60;
const PER_RUN_MS = 2500;

// Sealed Gauntlet "phases" — a chronological, HONEST bucketing of the same
// seed loop below (no separate case generation, no fake drama): the first
// ~20% of seeds are labeled "boundary" (small/edge-shaped by construction —
// generators tend to produce their smallest, most degenerate cases early at
// low seed values), the middle ~50% "random", the last ~30% "adversarial".
// This lets a caller narrate real progress ("sống qua boundary, chết ở
// adversarial #50/60") without inventing anything the search isn't actually
// doing. Every maxSeeds >= 1 gets at least a "boundary" bucket.
function phaseForSeed(seed, maxSeeds) {
  const total = Math.max(1, Number(maxSeeds) || 1);
  const boundaryEnd = Math.max(1, Math.round(total * 0.2));
  const randomEnd = Math.max(boundaryEnd, Math.round(total * 0.7));
  if (seed <= boundaryEnd) return "boundary";
  if (seed <= randomEnd) return "random";
  return "adversarial";
}

// ---------------------------------------------------------------------------
// Pure core: given already-compiled runner closures, search seeds 1..maxSeeds
// for the first one where the student's program disagrees with the reference
// (or crashes/times out while the reference stays fine). Deterministic given
// deterministic runners; a real generator seeded by an integer argv is
// deterministic by construction (same convention as the Stress Lab).
//
// `onProgress`, if given, is called once per seed ACTUALLY attempted (never
// for seeds skipped by an early budget-out) with
// `{ seed, maxSeeds, phase, outcome }` where outcome is one of
// "skipped-bad-generator" | "skipped-bad-reference" | "survived-seed" | "found".
// Optional and side-effect-only — omitting it changes nothing about the
// search itself, so every pre-existing caller keeps working unmodified.
// ---------------------------------------------------------------------------
async function huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds = DEFAULT_MAX_SEEDS, budgetMs = DEFAULT_BUDGET_MS, compareMode = "loose", now = () => Date.now(), onProgress }) {
  const startedAt = now();
  let ran = 0;
  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    if (now() - startedAt >= budgetMs) return { found: false, ran, budgetHit: true };
    ran = seed;
    const phase = phaseForSeed(seed, maxSeeds);
    const report = (outcome) => { if (onProgress) onProgress({ seed, maxSeeds, phase, outcome }); };

    const gen = await runGenerator(seed);
    if (!gen || gen.status !== "OK") { report("skipped-bad-generator"); continue; } // a broken generator run just costs budget, never a false "survived"
    const input = gen.stdout;

    const [student, reference] = await Promise.all([runStudent(input), runReference(input)]);
    if (reference.status !== "OK") { report("skipped-bad-reference"); continue; } // untrustworthy candidate — reference itself couldn't answer it

    if (student.status !== "OK") {
      report("found");
      return { found: true, seed, phase, input, kind: student.status, expected: reference.stdout, got: student.stdout };
    }
    if (!runCpp.compareOutput(reference.stdout, student.stdout, compareMode).ok) {
      report("found");
      return { found: true, seed, phase, input, kind: "WA", expected: reference.stdout, got: student.stdout };
    }
    report("survived-seed");
  }
  return { found: false, ran };
}

// ---------------------------------------------------------------------------
// Vault-first reference/generator provisioning. Both mirror the exact trust
// discipline verifyTests.js/orchestrator.js already use (compile, cross-check
// against official samples) — the only difference is WHERE the result lives
// afterward: on disk, keyed to this statement, instead of nowhere.
// ---------------------------------------------------------------------------

/**
 * Returns { ok, trusted, samplesChecked, run, cleanup, source, fromVault } or
 * { ok:false, reason, note }. `run(input)` stays alive until `cleanup()`.
 */
async function ensureReference({ id, aiSettings, judgeSettings, statement, samples }) {
  const hash = statementHash(statement);
  const vaultMeta = await referenceStore.readMeta(id);
  const trust = referenceStore.evaluateTrust(vaultMeta, hash);

  if (trust.usable) {
    const code = await referenceStore.getReferenceCode(id);
    const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (!built.compilerMissing && built.ok) {
      const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
      return {
        ok: true,
        trusted: true,
        samplesChecked: vaultMeta.reference.samplesChecked,
        run: (input) => runCpp.runBinary({ binaryPath: built.binaryPath, input, timeMs: limit }),
        cleanup: () => runCpp.cleanupWorkdir(built.workdir),
        source: vaultMeta.reference.source,
        fromVault: true,
      };
    }
    await runCpp.cleanupWorkdir(built.workdir); // vault entry no longer compiles — fall through and regenerate
  }

  // Vault empty/stale/untrusted → generate fresh via the same path WA Autopsy
  // uses, then PERSIST the result so nobody pays this cost again.
  const fresh = await orchestrator.ensureReference({ aiSettings, judgeSettings, statement, samples });
  if (fresh.ok) {
    // orchestrator.ensureReference doesn't hand back the source text it compiled,
    // so ask once more for the exact same helper it already validated. This
    // costs one extra AI call the FIRST time a vault is populated, never again.
    try {
      const refCode = await ai.generateHelper({ settings: aiSettings, statement, kind: "brute" });
      await referenceStore.setReference(id, refCode, {
        source: "ai-brute", trusted: fresh.trusted, samplesChecked: fresh.samplesChecked, statementHash: hash,
      });
    } catch { /* persistence is best-effort — the fresh reference still works this run */ }
  }
  return { ...fresh, fromVault: false };
}

/**
 * Returns { ok, run, cleanup, source, fromVault } or { ok:false, reason, note }.
 * `run(seed)` returns runCpp.runBinary's result with argv=[String(seed)].
 */
async function ensureGenerator({ id, aiSettings, statement, mainCode, judgeSettings }) {
  const vaultMeta = await referenceStore.readMeta(id);
  if (vaultMeta.generator.present) {
    const code = await referenceStore.getGeneratorCode(id);
    const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (!built.compilerMissing && built.ok) {
      const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
      return {
        ok: true,
        run: (seed) => runCpp.runBinary({ binaryPath: built.binaryPath, input: "", timeMs: limit, args: [String(seed)] }),
        cleanup: () => runCpp.cleanupWorkdir(built.workdir),
        source: vaultMeta.generator.source,
        fromVault: true,
      };
    }
    await runCpp.cleanupWorkdir(built.workdir);
  }

  if (!aiSettings || !aiSettings.apiKey) {
    return { ok: false, reason: "no-key", note: "Chưa có API key — không thể tự viết generator." };
  }
  let genCode;
  try {
    genCode = await ai.generateHelper({ settings: aiSettings, statement, kind: "generator", mainCode });
  } catch (error) {
    return { ok: false, reason: "generate-failed", note: `Không sinh được generator: ${error.message}` };
  }
  const built = await runCpp.compileStandalone({ code: genCode, settings: judgeSettings });
  if (built.compilerMissing) { await runCpp.cleanupWorkdir(built.workdir); return { ok: false, reason: "no-compiler", note: "g++ chưa sẵn sàng." }; }
  if (!built.ok) { await runCpp.cleanupWorkdir(built.workdir); return { ok: false, reason: "compile-failed", note: "Generator do AI viết không biên dịch được." }; }

  await referenceStore.setGenerator(id, genCode, { source: "ai" }); // persist for next time — never regenerate again
  const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
  return {
    ok: true,
    run: (seed) => runCpp.runBinary({ binaryPath: built.binaryPath, input: "", timeMs: limit, args: [String(seed)] }),
    cleanup: () => runCpp.cleanupWorkdir(built.workdir),
    source: "ai",
    fromVault: false,
  };
}

// ---------------------------------------------------------------------------
// Full post-AC pipeline: provision (vault-first) → hunt → shrink-if-found.
// Never throws; every failure mode degrades to `{ ok:false, reason, note }` so
// a missing key/compiler/vault just silently skips the Gauntlet — it is a
// bonus stage, not a gate the student must pass to keep their AC.
// ---------------------------------------------------------------------------
async function runPostAcGauntlet({ id, aiSettings, judgeSettings, statement, code, samples, maxSeeds, budgetMs, compareMode = "loose", onProgress }) {
  let reference;
  let generator;
  let studentBuilt;
  try {
    reference = await ensureReference({ id, aiSettings, judgeSettings, statement, samples });
    if (!reference.ok) return { ok: false, reason: reference.reason, note: reference.note };
    if (!reference.trusted) return { ok: false, reason: "reference-untrusted", note: "Tham chiếu chưa khớp sample chính thức — Đấu Trường cần đối thủ đáng tin trước." };

    generator = await ensureGenerator({ id, aiSettings, statement, mainCode: code, judgeSettings });
    if (!generator.ok) return { ok: false, reason: generator.reason, note: generator.note };

    studentBuilt = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (studentBuilt.compilerMissing || !studentBuilt.ok) {
      return { ok: false, reason: "student-compile-failed", note: "Code hiện tại không biên dịch được — bỏ qua Gauntlet." };
    }
    const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
    const runStudent = (input) => runCpp.runBinary({ binaryPath: studentBuilt.binaryPath, input, timeMs: limit });

    // Provenance of what JUDGED the student this run — surfaced so the UI can
    // let them audit a counterexample instead of trusting an opaque AI verdict.
    // A student can never AC against a bogus attack they can't even inspect.
    const referenceInfo = {
      source: reference.source || null,
      samplesChecked: Number(reference.samplesChecked) || 0,
      fromVault: Boolean(reference.fromVault),
      generatorSource: generator.source || null,
    };

    const hunt = await huntFailingSeed({
      runGenerator: generator.run, runStudent, runReference: reference.run,
      maxSeeds: maxSeeds || DEFAULT_MAX_SEEDS, budgetMs: budgetMs || DEFAULT_BUDGET_MS, compareMode, onProgress,
    });

    if (!hunt.found) {
      await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: hunt.ran });
      return { ok: true, survived: true, ran: hunt.ran, budgetHit: Boolean(hunt.budgetHit), referenceInfo };
    }

    // Found a counterexample — shrink it with the SAME oracle/engine WA Autopsy
    // already proved, by delegating to runAutopsy (it re-verifies + shrinks).
    const shrunk = await orchestrator.runAutopsy({
      failingInput: hunt.input, runStudent, runReference: reference.run, compareMode,
    });
    await referenceStore.recordGauntletRun(id, { result: "broken", survivedRuns: hunt.seed - 1 });

    if (!shrunk.ok) {
      // Shrink couldn't re-confirm it (rare: a flaky generator/timing edge) —
      // still report the raw find so nothing is silently lost.
      return {
        ok: true, survived: false, seed: hunt.seed, ran: hunt.ran, phase: hunt.phase, kind: hunt.kind,
        minimalInput: hunt.input, expectedOutput: hunt.expected, studentOutput: hunt.got,
        shrink: null, referenceInfo,
      };
    }
    return {
      ok: true, survived: false, seed: hunt.seed, ran: hunt.ran, phase: hunt.phase, kind: hunt.kind,
      minimalInput: shrunk.minimalInput, expectedOutput: shrunk.expectedOutput, studentOutput: shrunk.studentOutput,
      shrink: shrunk.shrink, referenceInfo,
    };
  } finally {
    if (reference && reference.cleanup) await reference.cleanup();
    if (generator && generator.cleanup) await generator.cleanup();
    if (studentBuilt && !studentBuilt.compilerMissing) await runCpp.cleanupWorkdir(studentBuilt.workdir);
  }
}

module.exports = {
  DEFAULT_BUDGET_MS,
  DEFAULT_MAX_SEEDS,
  phaseForSeed,
  huntFailingSeed,
  ensureReference,
  ensureGenerator,
  runPostAcGauntlet,
};
