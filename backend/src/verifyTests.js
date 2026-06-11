"use strict";

// verifyTests.js — turn AI-PROPOSED test inputs into TRUSTWORTHY expected outputs
// by compiling an AI-written reference solution and RUNNING it, instead of
// trusting the model's in-head arithmetic. The reference is first cross-checked
// against the statement's official samples; if it disagrees there, we do NOT
// trust its computed outputs. Degrades gracefully (tests returned unchanged)
// when g++ is missing, the reference won't compile, or the budget is exhausted.

const runCpp = require("./runCpp");
const ai = require("./ai");

const PER_TEST_MS = 3000;   // hard per-run cap for the (possibly slow) reference
const BUDGET_MS = 20000;    // overall wall-clock cap so a slow brute can't hang the request

// Mutates each test's `expected` / `expectedKnown` in place when the reference
// produces a trustworthy answer. Returns a summary used for the UI note.
async function verifyWithReference({ aiSettings, judgeSettings, statement, code, tests, samples }) {
  const list = Array.isArray(tests) ? tests : [];
  const result = { tests: list, referenceUsed: false, referenceTrusted: false, verifiedCount: 0, note: "" };
  if (list.length === 0) return result;

  // No compiler → cannot verify; keep the AI outputs as-is.
  const compiler = await runCpp.checkCompiler(judgeSettings);
  if (!compiler.available) {
    result.note = "g++ chưa sẵn sàng — giữ nguyên đáp án AI (chưa kiểm chứng).";
    return result;
  }

  // Ask the AI for a simple, obviously-correct reference solution (stdin→stdout).
  let refCode;
  try {
    refCode = await ai.generateHelper({ settings: aiSettings, statement, kind: "brute", mainCode: code });
  } catch (error) {
    result.note = "Không sinh được lời giải tham chiếu để kiểm chứng: " + error.message;
    return result;
  }

  const built = await runCpp.compileStandalone({ code: refCode, settings: judgeSettings });
  try {
    if (built.compilerMissing) { result.note = "g++ chưa sẵn sàng."; return result; }
    if (!built.ok) { result.note = "Lời giải tham chiếu không biên dịch được — giữ nguyên đáp án AI."; return result; }
    result.referenceUsed = true;

    const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), PER_TEST_MS);
    const run = (input) => runCpp.runBinary({ binaryPath: built.binaryPath, input, timeMs: limit });

    // 1) Cross-check the reference against the official samples before trusting it.
    const sampleList = (Array.isArray(samples) ? samples : []).filter((s) => s && s.output && String(s.output).trim());
    let trusted = true;
    let checked = 0;
    for (const s of sampleList) {
      const r = await run(s.input);
      if (r.status !== "OK" || !runCpp.compareOutput(s.output, r.stdout, "loose").ok) { trusted = false; break; }
      checked += 1;
    }
    result.referenceTrusted = trusted;
    result.samplesChecked = checked;

    if (!trusted && sampleList.length) {
      result.note = "⚠ Lời giải tham chiếu KHÔNG khớp sample chính thức — không ghi đè đáp án AI. Hãy kiểm tra thủ công.";
      return result;
    }

    // 2) Recompute expected for every test by running the reference on its input.
    const start = Date.now();
    for (const t of list) {
      if (Date.now() - start > BUDGET_MS) {
        t.warning = (t.warning ? t.warning + " · " : "") + "chưa kịp kiểm chứng (hết thời gian)";
        continue;
      }
      const r = await run(t.input);
      if (r.status === "OK") {
        t.expected = String(r.stdout).replace(/\s+$/, "");
        t.expectedKnown = true;
        t.verifiedBy = "reference";
        result.verifiedCount += 1;
      } else {
        // Reference TLE/RE on this input (e.g. a max case a brute can't handle) → keep AI value, flag it.
        t.expectedKnown = false;
        t.warning = (t.warning ? t.warning + " · " : "") + `tham chiếu ${r.status} — chưa kiểm chứng`;
      }
    }

    result.note = sampleList.length
      ? `🔬 Đã kiểm chứng ${result.verifiedCount}/${list.length} test bằng lời giải tham chiếu (khớp ${checked} sample).`
      : `🔬 Đã tính ${result.verifiedCount}/${list.length} test bằng lời giải tham chiếu (không có sample để đối chiếu — nên kiểm tra kỹ).`;
    return result;
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
}

module.exports = { verifyWithReference };
