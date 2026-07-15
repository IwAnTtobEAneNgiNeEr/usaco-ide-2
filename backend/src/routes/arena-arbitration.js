"use strict";

// routes/arena-arbitration.js — S12: Phiên Tòa Test + Người Gác Cổng. Mounted
// at /api/problems. Both routes only ever FLAG or CORRECT with evidence —
// never silently delete a test (README-LOOPS.md §1.2: "chỉ gắn cờ, không tự xóa").

const express = require("express");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const runCpp = require("../runCpp");
const referenceStore = require("../arena/referenceStore");
const arbitration = require("../arena/arbitration");
const validatorEngine = require("../arena/validator");
const { statementHash, PROVENANCE } = require("../trustLayer");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();
const PER_RUN_MS = 3000;

async function findTest(id, testId) {
  const tests = await problemStore.listTests(id);
  return tests.find((t) => t.id === testId) || null;
}

// POST /api/problems/:id/tests/:testId/arbitrate  { code? }
router.post("/:id/tests/:testId/arbitrate", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const testId = req.params.testId;
  const test = await findTest(id, testId);
  if (!test) return res.status(404).json({ ok: false, error: "Không tìm thấy test." });
  if (test.provenance === PROVENANCE.OFFICIAL_SAMPLE) {
    return res.status(400).json({ ok: false, error: "Sample chính thức không bao giờ bị đưa ra xử." });
  }

  const statement = await problemStore.getFile(id, "statement");
  const vaultMeta = await referenceStore.readMeta(id);
  const trust = referenceStore.evaluateTrust(vaultMeta, statementHash(statement));

  const judgeSettings = await settingsStore.getSettings();
  const compareMode = judgeSettings.compareMode || "loose";
  const compare = (a, b) => runCpp.compareOutput(a, b, compareMode, { epsilon: judgeSettings.epsilon });

  if (!trust.usable) {
    const verdict = arbitration.judgeArbitration({ referenceTrusted: false, referenceResult: null, studentResult: null, expectedFromTest: test.expected, compare });
    return res.json({ ok: true, ...verdict, refundEligible: false, testUpdated: false });
  }

  const code = typeof (req.body || {}).code === "string" ? req.body.code : await problemStore.getFile(id, "code");
  const refCode = await referenceStore.getReferenceCode(id);

  let refBuilt;
  let studentBuilt;
  try {
    refBuilt = await runCpp.compileStandalone({ code: refCode, settings: judgeSettings });
    studentBuilt = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (refBuilt.compilerMissing || studentBuilt.compilerMissing) {
      return res.status(400).json({ ok: false, error: "g++ chưa sẵn sàng." });
    }
    if (!refBuilt.ok) {
      return res.json({ ok: true, verdict: arbitration.VERDICTS.UNVERIFIABLE, message: "Lời giải tham chiếu không biên dịch được lúc này.", refundEligible: false, testUpdated: false });
    }
    if (!studentBuilt.ok) {
      return res.json({ ok: true, verdict: arbitration.VERDICTS.UNVERIFIABLE, message: "Code hiện tại không biên dịch được — sửa lỗi biên dịch trước đã.", refundEligible: false, testUpdated: false });
    }

    const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), PER_RUN_MS);
    const [referenceResult, studentResult] = await Promise.all([
      runCpp.runBinary({ binaryPath: refBuilt.binaryPath, input: test.input, timeMs: limit }),
      runCpp.runBinary({ binaryPath: studentBuilt.binaryPath, input: test.input, timeMs: limit }),
    ]);

    const verdict = arbitration.judgeArbitration({ referenceTrusted: true, referenceResult, studentResult, expectedFromTest: test.expected, compare });

    let testUpdated = false;
    if (verdict.verdict === arbitration.VERDICTS.BAD_TEST) {
      try {
        await problemStore.updateTest(id, testId, {
          expected: verdict.correctedExpected,
          reason: `${test.reason ? test.reason + " · " : ""}Đã sửa bởi Phiên Tòa Test (khớp lời giải tham chiếu).`,
        });
        testUpdated = true;
      } catch { /* correction is best-effort — the verdict itself still stands */ }
    }

    res.json({ ok: true, verdict: verdict.verdict, message: verdict.message, refundEligible: verdict.verdict === arbitration.VERDICTS.BAD_TEST, testUpdated });
  } finally {
    if (refBuilt) await runCpp.cleanupWorkdir(refBuilt.workdir);
    if (studentBuilt) await runCpp.cleanupWorkdir(studentBuilt.workdir);
  }
}));

// POST /api/problems/:id/tests/:testId/validate — Người Gác Cổng (S12).
router.post("/:id/tests/:testId/validate", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const testId = req.params.testId;
  const test = await findTest(id, testId);
  if (!test) return res.status(404).json({ ok: false, error: "Không tìm thấy test." });

  const vaultMeta = await referenceStore.readMeta(id);
  if (!vaultMeta.validator.present) {
    return res.status(400).json({ ok: false, error: "Chưa có validator cho bài này." });
  }
  const validatorCode = await referenceStore.getValidatorCode(id);
  const judgeSettings = await settingsStore.getSettings();
  const result = await validatorEngine.checkInputAgainstValidator({ code: validatorCode, input: test.input, judgeSettings });

  if (!result.compiled) {
    return res.json({ ok: true, checked: false, reason: result.compilerMissing ? "no-compiler" : "validator-compile-failed" });
  }
  if (result.valid) {
    return res.json({ ok: true, checked: true, valid: true });
  }

  // Invalid input → FLAG only, never delete.
  try {
    await problemStore.updateTest(id, testId, {
      reason: `${test.reason ? test.reason + " · " : ""}⚠ Người Gác Cổng: input KHÔNG hợp lệ theo validator (${result.status}).`,
    });
  } catch { /* flagging is best-effort */ }
  res.json({ ok: true, checked: true, valid: false, flagged: true });
}));

module.exports = router;
