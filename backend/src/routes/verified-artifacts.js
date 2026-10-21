"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const evidenceStore = require("../evidenceStore");
const verifiedArtifact = require("../verifiedArtifact");
const bfsTrace = require("../bfsTrace");
const dijkstraTrace = require("../dijkstraTrace");
const prefixSumTrace = require("../prefixSumTrace");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// GET /api/problems/:id/verified-artifact — additive read model for Agent B.
router.get("/:id/verified-artifact", requireProblem, asyncHandler(async (req, res) => {
  const intent = req.query.intent === "derive-module" ? "derive-module" : "competitive";
  res.json({ artifact: await require("../judgeState").contract(req.problemId, { intent }) });
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

module.exports = router;
