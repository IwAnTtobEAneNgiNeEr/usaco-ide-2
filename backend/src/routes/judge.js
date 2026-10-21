"use strict";
const express = require("express"), problemStore = require("../problemStore"), judgeService = require("../judgeService"), evidenceStore = require("../evidenceStore"), judgeState = require("../judgeState"), model = require("../verifiedArtifact");
const { LIMITS } = require("../config"), { onlyTestMiddleware } = require("../testPaths");
const { recordProblemEvent } = require("../recorder"), arenaTurn = require("../arena/turn");
const { asyncHandler, requireProblem } = require("./_util");
const router = express.Router();
function clientGone(res) { let gone = false; res.on("close", () => { if (!res.writableEnded) gone = true; }); return () => gone; }
async function saveSubmittedCode(id, body) {
  if (body && typeof body.code === "string") {
    if (Buffer.byteLength(body.code, "utf8") > LIMITS.maxCodeBytes) throw Object.assign(new Error("Source exceeds code size limit."), { status: 400 });
    await problemStore.setFile(id, "code", body.code);
  }
}
async function persist(id, context, result, { type, scope, startedAt }) {
  const runId = evidenceStore.createRunId(), rows = result.results || [];
  const focus = rows.find(r => r.status !== "AC") || rows[rows.length - 1] || context.tests[0];
  const record = { id: runId, at: new Date().toISOString(), startedAt, type, verdict: result.cancelled ? "CANCELLED" : result.compilerMissing || result.compileOk === false ? "CE" : result.verdict, timeMs: result.summary?.timeMs ?? result.timeMs ?? 0, total: result.summary?.total ?? null, passed: result.summary?.passed ?? null };
  const compile = result.compile || { stderr: result.compileOk === false ? result.stderr || "" : "", timeMs: result.compileOk === false ? result.timeMs || 0 : 0 };
  result.evidence = await evidenceStore.saveRunEvidence(id, { record, code: context.code, result: { ...result, compile }, fallbackTest: type === "run" ? { ...context.tests[0], actual: result.stdout, stderr: result.stderr, diff: result.diff, timeMs: result.timeMs } : focus, inputSnapshot: context.inputs, judgeFingerprint: context.judgeFingerprint, scope, cancelled: Boolean(result.cancelled) });
  // Immutable evidence is the durable source; metadata is only a compatibility index.
  if (scope !== "single" && !result.cancelled) await problemStore.recordRun(id, record);
  result.judgeFingerprint = context.judgeFingerprint; result.problemFingerprint = context.problemFingerprint; result.scope = scope;
  result.problemRevision = context.inputs.problemRevision;
  result.truth = await judgeState.contract(id);
  return record;
}
router.post("/:id/run", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId, startedAt = new Date().toISOString(); await saveSubmittedCode(id, req.body);
  const context = await judgeState.capture(id, { scope: "scratch" }), scratch = context.tests[0] || { input: "", expected: "" };
  const result = await judgeService.compileAndRun({ code: context.code, settings: context.settings, input: scratch.input, expected: scratch.expected, fileMode: context.fileMode, checker: context.checker });
  await persist(id, context, result, { type: "run", scope: "scratch", startedAt });
  result.completion = { created: false, verified: false, freshWin: false, ratedProgress: false, reason: "Run là bước khám phá và không tạo completion." };
  result.nextAction = model.nextAction({ operation: "run", verdict: result.verdict || "CE", evidence: result.evidence });
  recordProblemEvent(id, "run", { verdict: result.verdict || "CE" }); res.json(result);
}));
router.post("/:id/judge", onlyTestMiddleware, requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId, startedAt = new Date().toISOString(), shouldStop = clientGone(res); await saveSubmittedCode(id, req.body);
  const onlyTestId = req.body?.onlyTestId, single = Boolean(onlyTestId), context = await judgeState.capture(id, { onlyTestId });
  if (single && !context.tests.length) {
    const exists = (await problemStore.listTests(id)).some(t => t.id === onlyTestId);
    return res.status(exists ? 409 : 404).json({ error: exists ? "Candidate oracle requires explicit review before judging." : "Test case not found." });
  }
  if (!context.tests.length) return res.json({ verdict: "—", compileOk: null, compile: { stderr: "", timeMs: 0 }, results: [], summary: { total: 0, passed: 0, failed: 0, timeMs: 0 }, message: context.candidateCount ? "Chỉ có test AI candidate — hãy kiểm tra và xác nhận oracle trước khi Judge." : "Chưa có test case nào. Thêm test ở tab Test.", evidence: null, judgeFingerprint: context.judgeFingerprint, truth: await judgeState.contract(id, { context }), completion: { created: false, verified: false, freshWin: false, ratedProgress: false, reason: "Không có trusted checks để Judge." }, nextAction: { id: "add-test", state: "work", label: "Thêm hoặc review test", reason: "Chưa có trusted judge suite." } });
  const result = await judgeService.compileAndJudge({ code: context.code, settings: context.settings, tests: context.tests, fileMode: context.fileMode, checker: context.checker, shouldStop });
  await persist(id, context, result, { type: "judge", scope: single ? "single" : "full", startedAt });
  const currentAC = !single && !result.cancelled && result.verdict === "AC" && result.truth.derivedStatus === "verified" && result.truth.judgeFingerprint === context.judgeFingerprint;
  const priorAC = model.hasHistoricalAcceptance(context.meta), freshWin = currentAC && !priorAC;
  result.completion = { created: freshWin, verified: currentAC, freshWin, ratedProgress: false, reason: result.cancelled ? "Judge bị hủy nên không tạo completion." : single ? "Single-test Judge là exploratory và không tạo completion." : currentAC ? "Full Judge AC khớp chính xác judge inputs hiện tại." : "Attempt không xác nhận AC cho judge inputs hiện tại." };
  result.nextAction = single ? model.nextAction({ operation: "run", verdict: result.verdict || "CE", evidence: result.evidence }) : (await judgeState.contract(id, { intent: req.body?.intent })).nextAction;
  if (!single && !result.cancelled) {
    recordProblemEvent(id, "verdict", { verdict: result.verdict, timeMs: result.summary.timeMs || 0, passed: result.summary.passed || 0, total: result.summary.total || 0 });
    // Existing optional bookkeeping must not award stale/cancelled AC.
    if (result.verdict !== "AC" || currentAC) { try { result.arena = await arenaTurn.onJudgeVerdict({ id, verdict: result.verdict, meta: context.meta }); } catch { /* optional */ } result.completion.ratedProgress = Boolean(result.arena?.rating); }
  }
  res.json(result);
}));
module.exports = router;
