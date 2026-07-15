"use strict";

// POST /api/problems/:id/autopsy — WA Autopsy (README-LOOPS.md task A2).
// Body: { input, studentOutput?, trigger? } — the failing test's input the
// client already has on screen from the last judge run. No SSE/cancel yet
// (P2 enrichment per README) — this is a single request/response, typically
// a few seconds to ~30s depending on how much the shrink loop needs to run.

const path = require("path");
const express = require("express");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const runCpp = require("../runCpp");
const ai = require("../ai");
const orchestrator = require("../autopsy/orchestrator");
const { recordProblemEvent } = require("../recorder");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

function fileModeFor(meta) {
  return meta && meta.usacoMode && meta.fileName ? { name: meta.fileName } : null;
}

router.post("/:id/autopsy", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const body = req.body || {};
  const input = typeof body.input === "string" ? body.input : "";
  const trigger = ["WA", "RE", "TLE"].includes(body.trigger) ? body.trigger : "WA";
  if (!input.trim()) {
    return res.status(400).json({ ok: false, error: "Thiếu input của test đang WA." });
  }

  const aiSettings = await settingsStore.getAiSettings();
  if (!aiSettings.apiKey) {
    return res.status(400).json({ ok: false, error: ai.NO_KEY_MESSAGE, code: "NO_KEY" });
  }

  const judgeSettings = await settingsStore.getSettings();
  const meta = await problemStore.readMeta(id);
  const fileMode = fileModeFor(meta);
  const statement = await problemStore.getFile(id, "statement");
  const code = await problemStore.getFile(id, "code");
  const limit = Math.min(Math.max(Number(judgeSettings.timeMs) || 2000, 500), 3000);

  const reference = await orchestrator.ensureReference({
    aiSettings, judgeSettings, statement, samples: ai.extractSamples(statement),
  });
  if (!reference.ok) {
    return res.status(502).json({ ok: false, reason: reference.reason, note: reference.note });
  }

  let studentBuilt;
  try {
    studentBuilt = await runCpp.compileStandalone({ code, settings: judgeSettings });
    if (studentBuilt.compilerMissing || !studentBuilt.ok) {
      return res.status(502).json({ ok: false, reason: "student-compile-failed", note: "Code của em không biên dịch được." });
    }

    const runStudent = (candidate) => runCpp.runBinary({ binaryPath: studentBuilt.binaryPath, input: candidate, timeMs: limit, fileMode });
    const runReference = (candidate) => reference.run(candidate);

    const result = await orchestrator.runAutopsy({ failingInput: input, runStudent, runReference });
    if (!result.ok) {
      return res.status(422).json({ ok: false, reason: result.reason, note: result.note });
    }

    const pack = orchestrator.buildEvidencePack({
      problemId: id,
      trigger,
      minimalInput: result.minimalInput,
      expectedOutput: result.expectedOutput,
      studentOutput: result.studentOutput,
      shrink: result.shrink,
      reference: { kind: "ai-brute", verifiedOnSamples: reference.trusted },
      studentCodeSnapshot: code,
    });

    const savedAt = Date.now();
    await fileStore.writeJson(path.join(fileStore.problemDir(id), "autopsy", `${savedAt}.json`), pack);
    recordProblemEvent(id, "autopsy", {
      trigger: pack.trigger,
      runs: pack.shrink.runs,
      toBytes: pack.shrink.toBytes,
      verifiedOnSamples: reference.trusted,
    });

    res.json({ ok: true, pack, referenceNote: reference.note });
  } finally {
    await reference.cleanup();
    if (studentBuilt) await runCpp.cleanupWorkdir(studentBuilt.workdir);
  }
}));

module.exports = router;
