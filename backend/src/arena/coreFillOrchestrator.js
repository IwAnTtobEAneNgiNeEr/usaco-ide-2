"use strict";

// coreFillOrchestrator.js — the non-pure edge for "Điền Lõi". Wires
// ai.generateCoreFillDrill (raw material) + arena/coreFill.js (pure marker
// split/assemble) + runCpp (real compile/run) into ONE verified drill that's
// safe to persist and serve. Never trusts the model's own arithmetic: every
// test's `expected` is derived by actually RUNNING the assembled reference
// program, exactly the same discipline verifyTests.js already uses for
// AI-proposed contest tests.
//
// A drill only reaches the store if:
//   1. fullCode's markers split structurally (exactly one start, one end,
//      start before end, non-empty core) — arena/coreFill.js's job;
//   2. the assembled (before+core+after) program actually COMPILES;
//   3. at least COREFILL.minTests sample inputs run cleanly (status "OK") on
//      it — those runs' stdout become the trusted `expected`.
// Any failure at any step discards that attempt and tries a FRESH generation
// (not a text-repair of the same broken code — regenerating is simpler and
// this runs offline, not on a student-facing latency budget).

const config = require("../config");
const ai = require("../ai");
const runCpp = require("../runCpp");
const coreFill = require("./coreFill");

const PER_RUN_MS = 3000;

async function deriveVerifiedTests({ assembledReference, sampleTests, judgeSettings }) {
  const built = await runCpp.compileStandalone({ code: assembledReference, settings: judgeSettings });
  try {
    if (built.compilerMissing) return { compilerMissing: true, tests: [] };
    if (!built.ok) return { compileFailed: true, tests: [] };

    const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
    const tests = [];
    for (const t of sampleTests) {
      const r = await runCpp.runBinary({ binaryPath: built.binaryPath, input: t.input, timeMs: limit });
      if (r.status !== "OK") continue; // reference itself can't handle this input — skip, don't fail the whole drill
      tests.push({ name: t.name, input: t.input, expected: String(r.stdout).replace(/\s+$/, "") });
    }
    return { tests };
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
}

/**
 * @returns a verified drill { title, topic, rating, statement, gapContract,
 *   before, after, tests } ready for arena/coreFillStore.js — never includes
 *   the original `core`.
 */
async function generateAndVerifyDrill({ aiSettings, judgeSettings, topic, minRating, maxRating, avoidTitles }) {
  const maxAttempts = config.COREFILL.maxGenerateAttempts;
  const reasons = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await ai.generateCoreFillDrill({ settings: aiSettings, topic, minRating, maxRating, avoidTitles });

    const split = coreFill.parseGaps(raw.fullCode);
    if (!split.ok) { reasons.push(`lần ${attempt}: split lỗi — ${split.reason}`); continue; }

    // Pair each parsed gap with the AI's task label by index (label optional —
    // a gap without one still works, the stub just says "viết đoạn lõi").
    const labelByIndex = new Map((raw.gaps || []).map((g) => [g.index, g.label]));
    const gaps = split.gaps.map((g) => ({ index: g.index, label: labelByIndex.get(g.index) || "" }));

    const assembledReference = coreFill.assembleParts(split.parts, split.gaps.map((g) => g.core));
    const { compilerMissing, compileFailed, tests } = await deriveVerifiedTests({
      assembledReference, sampleTests: raw.sampleTests, judgeSettings,
    });
    if (compilerMissing) {
      const e = new Error("g++ chưa sẵn sàng — không thể kiểm chứng Điền Lõi.");
      e.code = "NO_COMPILER";
      throw e;
    }
    if (compileFailed) { reasons.push(`lần ${attempt}: reference không biên dịch được`); continue; }
    if (tests.length < config.COREFILL.minTests) {
      reasons.push(`lần ${attempt}: chỉ ${tests.length}/${config.COREFILL.minTests} test chạy sạch`);
      continue;
    }

    // The persisted drill carries the pre-rendered SCAFFOLD (skeleton with
    // numbered TODO stubs), the gap labels, and the derived tests — never any
    // original core text. Legacy single-gap drills in old decks keep their
    // before/after shape; the route handles both.
    return {
      title: raw.title, topic: raw.topic, rating: raw.rating,
      statement: raw.statement,
      gapContract: raw.gapContract || gaps.map((g) => `[${g.index}] ${g.label}`).join(" · "),
      gaps,
      // `parts` (the fixed skeleton text around each gap) is what attempt-by-
      // filledCode reassembles against; the original cores are NOT in it.
      parts: split.parts,
      scaffold: coreFill.renderScaffoldParts(split.parts, gaps),
      tests,
    };
  }

  const e = new Error(`Không tạo được Điền Lõi hợp lệ sau ${maxAttempts} lần thử:\n• ${reasons.join("\n• ")}`);
  e.code = "COREFILL_VERIFY_FAILED";
  throw e;
}

module.exports = { generateAndVerifyDrill };
