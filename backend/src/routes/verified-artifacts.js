"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const evidenceStore = require("../evidenceStore");
const verifiedArtifact = require("../verifiedArtifact");
const bfsTrace = require("../bfsTrace");
const dijkstraTrace = require("../dijkstraTrace");
const prefixSumTrace = require("../prefixSumTrace");
const derivedArtifactStore = require("../derivedArtifactStore");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// GET /api/problems/:id/verified-artifact — additive read model for Agent B.
router.get("/:id/verified-artifact", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const [meta, detailedHistory, currentCode] = await Promise.all([
    problemStore.readMeta(id),
    problemStore.listHistory(id),
    problemStore.getFile(id, "code"),
  ]);
  const latestJudge = verifiedArtifact.judgeHistory(meta.history)[0] || null;
  const evidence = latestJudge ? await evidenceStore.referenceForHistoryEntry(id, latestJudge) : null;
  const intent = req.query.intent === "derive-module" ? "derive-module" : "competitive";
  res.json({
    artifact: verifiedArtifact.buildContract({
      meta,
      history: meta.history,
      detailedHistory,
      currentCode,
      evidence,
      intent,
    }),
  });
}));

// GET /api/problems/:id/evidence/:evidenceId — immutable run/test/snapshot link.
router.get("/:id/evidence/:evidenceId", requireProblem, asyncHandler(async (req, res) => {
  const evidence = await evidenceStore.readEvidence(req.problemId, req.params.evidenceId);
  if (!evidence) return res.status(404).json({ error: "Evidence không tồn tại." });
  res.json({ evidence });
}));

// POST /api/problems/:id/analysis/bfs-trace — only consumes stored evidence;
// callers cannot substitute unrelated code/input and still claim linkage.
router.post("/:id/analysis/bfs-trace", requireProblem, asyncHandler(async (req, res) => {
  const evidenceId = req.body && req.body.evidenceId;
  if (!evidenceId) return res.status(400).json({ error: "Thiếu evidenceId của run cần phân tích." });
  const evidence = await evidenceStore.readEvidence(req.problemId, evidenceId);
  if (!evidence) return res.status(404).json({ error: "Evidence không tồn tại." });

  const analysis = bfsTrace.traceGridBfs({
    code: evidence.codeSnapshot && evidence.codeSnapshot.code,
    input: evidence.test && evidence.test.input,
    verdict: evidence.run && evidence.run.verdict,
  });
  analysis.evidence = evidenceStore.toReference(evidence);
  res.json({ analysis });
}));

async function evidenceBoundAnalysis(req, res, analyze) {
  const evidenceId = req.body && req.body.evidenceId;
  if (!evidenceId) return res.status(400).json({ error: "Missing evidenceId for the run to analyze." });
  const evidence = await evidenceStore.readEvidence(req.problemId, evidenceId);
  if (!evidence) return res.status(404).json({ error: "Evidence does not exist." });
  const analysis = analyze({
    code: evidence.codeSnapshot && evidence.codeSnapshot.code,
    input: evidence.test && evidence.test.input,
    verdict: evidence.run && evidence.run.verdict,
  });
  analysis.evidence = evidenceStore.toReference(evidence);
  return res.json({ analysis });
}

router.post("/:id/analysis/dijkstra-trace", requireProblem, asyncHandler(async (req, res) => {
  return evidenceBoundAnalysis(req, res, dijkstraTrace.traceDijkstra);
}));

router.post("/:id/analysis/prefix-sum-trace", requireProblem, asyncHandler(async (req, res) => {
  return evidenceBoundAnalysis(req, res, prefixSumTrace.tracePrefixSum);
}));

router.get("/:id/derived", requireProblem, asyncHandler(async (req, res) => {
  res.json({ artifacts: await derivedArtifactStore.listArtifacts(req.problemId) });
}));

router.post("/:id/derived/grid-pathfinder", requireProblem, asyncHandler(async (req, res) => {
  const evidenceId = req.body && req.body.evidenceId;
  if (!evidenceId) return res.status(400).json({ error: "Thiếu AC evidenceId để tạo derived artifact." });
  const artifact = await derivedArtifactStore.createGridPathfinder(req.problemId, evidenceId);
  res.status(201).json({ artifact });
}));

router.post("/:id/derived/weighted-graph-router", requireProblem, asyncHandler(async (req, res) => {
  const evidenceId = req.body && req.body.evidenceId;
  if (!evidenceId) return res.status(400).json({ error: "Missing AC evidenceId for WeightedGraphRouter." });
  const artifact = await derivedArtifactStore.createWeightedGraphRouter(req.problemId, evidenceId);
  res.status(201).json({ artifact });
}));

router.post("/:id/derived/range-sum-module", requireProblem, asyncHandler(async (req, res) => {
  const evidenceId = req.body && req.body.evidenceId;
  if (!evidenceId) return res.status(400).json({ error: "Missing AC evidenceId for RangeSum." });
  const artifact = await derivedArtifactStore.createRangeSumModule(req.problemId, evidenceId);
  res.status(201).json({ artifact });
}));

router.get("/:id/derived/:artifactId", requireProblem, asyncHandler(async (req, res) => {
  const artifact = await derivedArtifactStore.getArtifact(req.problemId, req.params.artifactId);
  if (!artifact) return res.status(404).json({ error: "Derived artifact không tồn tại." });
  res.json({ artifact });
}));

router.get("/:id/derived/:artifactId/source", requireProblem, asyncHandler(async (req, res) => {
  res.json(await derivedArtifactStore.readSource(req.problemId, req.params.artifactId));
}));

router.put("/:id/derived/:artifactId/source", requireProblem, asyncHandler(async (req, res) => {
  const source = req.body && (req.body.source != null ? req.body.source : req.body.content);
  res.json({ artifact: await derivedArtifactStore.saveSource(req.problemId, req.params.artifactId, source) });
}));

router.post("/:id/derived/:artifactId/verify", requireProblem, asyncHandler(async (req, res) => {
  const suite = req.body && req.body.suite || "baseline";
  res.json(await derivedArtifactStore.verifyArtifact(req.problemId, req.params.artifactId, suite));
}));

router.post("/:id/derived/:artifactId/requirement-changes/:changeId/activate", requireProblem, asyncHandler(async (req, res) => {
  const artifact = await derivedArtifactStore.activateRequirementChange(
    req.problemId,
    req.params.artifactId,
    req.params.changeId
  );
  res.json({ artifact });
}));

module.exports = router;
