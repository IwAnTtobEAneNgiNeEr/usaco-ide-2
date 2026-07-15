"use strict";

// rushOrchestrator.js — the non-pure edge for "Sới Đập Lỗi" (Bug Rush). Wires
// ai.generateRushDrill (raw material) + real g++ into ONE verified drill
// that's safe to persist and serve. Never trusts the model's claim that its
// bug is real: buggyCode and fixedCode are BOTH compiled, then run on every
// proposed input — only inputs where they actually disagree (or buggyCode
// crashes/times out while fixedCode doesn't) become part of the drill. A
// drill with fewer than RUSH.minVerifiedTests such inputs is discarded and a
// fresh one generated — same discipline as arena/coreFillOrchestrator.js.
//
// fixedCode itself is NEVER returned or persisted — only its EXECUTION
// results (the derived `expected` per test) survive past this function.

const config = require("../config");
const ai = require("../ai");
const runCpp = require("../runCpp");

const PER_RUN_MS = 3000;

async function deriveVerifiedTests({ buggyBinaryPath, fixedBinaryPath, testInputs, judgeSettings }) {
  const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
  const tests = [];
  for (const input of testInputs) {
    const fixedRun = await runCpp.runBinary({ binaryPath: fixedBinaryPath, input, timeMs: limit });
    if (fixedRun.status !== "OK") continue; // the "fix" itself can't handle this input cleanly — useless as a test
    const buggyRun = await runCpp.runBinary({ binaryPath: buggyBinaryPath, input, timeMs: limit });
    const diverges = buggyRun.status !== "OK" || String(buggyRun.stdout).trim() !== String(fixedRun.stdout).trim();
    if (!diverges) continue; // this input doesn't actually expose the bug
    tests.push({ input, expected: String(fixedRun.stdout).trim() });
  }
  return tests;
}

/**
 * @returns a verified drill { title, tag, buggyCode, bugSummary, difficultyLabel,
 *   tests } ready for arena/rushStore.js — never includes fixedCode.
 */
async function generateAndVerifyDrill({ aiSettings, judgeSettings, tag, difficultyLabel, avoidTitles }) {
  const maxAttempts = config.RUSH.maxGenerateAttempts;
  const reasons = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await ai.generateRushDrill({ settings: aiSettings, tag, difficultyLabel, avoidTitles });

    const buggyBuilt = await runCpp.compileStandalone({ code: raw.buggyCode, settings: judgeSettings });
    if (buggyBuilt.compilerMissing) {
      await runCpp.cleanupWorkdir(buggyBuilt.workdir);
      const e = new Error("g++ chưa sẵn sàng — không thể kiểm chứng Rush drill.");
      e.code = "NO_COMPILER";
      throw e;
    }
    if (!buggyBuilt.ok) {
      await runCpp.cleanupWorkdir(buggyBuilt.workdir);
      reasons.push(`lần ${attempt}: buggyCode không biên dịch được (phải biên dịch sạch 100%)`);
      continue;
    }

    const fixedBuilt = await runCpp.compileStandalone({ code: raw.fixedCode, settings: judgeSettings });
    if (!fixedBuilt.ok) {
      await runCpp.cleanupWorkdir(buggyBuilt.workdir);
      await runCpp.cleanupWorkdir(fixedBuilt.workdir);
      reasons.push(`lần ${attempt}: fixedCode không biên dịch được`);
      continue;
    }

    let tests;
    try {
      tests = await deriveVerifiedTests({
        buggyBinaryPath: buggyBuilt.binaryPath, fixedBinaryPath: fixedBuilt.binaryPath,
        testInputs: raw.testInputs, judgeSettings,
      });
    } finally {
      await runCpp.cleanupWorkdir(buggyBuilt.workdir);
      await runCpp.cleanupWorkdir(fixedBuilt.workdir);
    }

    if (tests.length < config.RUSH.minVerifiedTests) {
      reasons.push(`lần ${attempt}: chỉ ${tests.length}/${config.RUSH.minVerifiedTests} test thực sự lộ ra bug`);
      continue;
    }

    return {
      title: raw.title, tag: raw.tag, buggyCode: raw.buggyCode,
      bugSummary: raw.bugSummary,
      hint1: raw.hint1 || "", hint2: raw.hint2 || "",
      difficultyLabel: difficultyLabel || "medium", tests,
    };
  }

  const e = new Error(`Không tạo được Rush drill hợp lệ sau ${maxAttempts} lần thử:\n• ${reasons.join("\n• ")}`);
  e.code = "RUSH_VERIFY_FAILED";
  throw e;
}

module.exports = { generateAndVerifyDrill };
