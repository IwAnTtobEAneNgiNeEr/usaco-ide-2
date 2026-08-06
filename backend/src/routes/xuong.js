"use strict";

const express = require("express");
const store = require("../applicationProjectStore");
const seeds = require("../applicationSeedRegistry");
const { asyncHandler } = require("./_util");

const router = express.Router();

router.get("/seeds", (req, res) => res.json({ seeds: seeds.listSeeds() }));
router.post("/analyze", asyncHandler(async (req, res) => res.json({ session: await store.createAnalysisSession(req.body || {}) })));
router.post("/sessions/:id/select", asyncHandler(async (req, res) => {
  const selected = await store.selectPathway(req.params.id, req.body && req.body.pathwayId);
  res.json({ project: selected.project, reference: selected.reference });
}));

router.get("/projects", asyncHandler(async (req, res) => res.json({ projects: await store.listProjects() })));
router.get("/projects/:id/reference", asyncHandler(async (req, res) => {
  res.json({ reference: await store.readProjectReference(req.params.id) });
}));
router.get("/projects/:id", asyncHandler(async (req, res) => res.json({ project: await store.readProject(req.params.id) })));
router.put("/projects/:id/files/*", asyncHandler(async (req, res) => {
  res.json({ project: await store.saveProjectFile(req.params.id, req.params[0], req.body && req.body.source, req.body && req.body.expectedContentHash) });
}));
router.post("/projects/:id/run", asyncHandler(async (req, res) => {
  res.json(await store.runProjectScenario(req.params.id, req.body || {}));
}));
router.get("/projects/:id/runs/:runId/replay", asyncHandler(async (req, res) => {
  res.json(await store.replayProjectRun(req.params.id, req.params.runId, req.query.cursor));
}));
router.post("/projects/:id/checks", asyncHandler(async (req, res) => {
  res.json(await store.checkProjectRun(req.params.id, req.body && req.body.runId));
}));
router.post("/projects/:id/demo", asyncHandler(async (req, res) => res.json(await store.runProjectDemo(req.params.id))));
router.post("/projects/:id/verify", asyncHandler(async (req, res) => res.json(await store.verifyProject(req.params.id))));
router.post("/projects/:id/evolve", asyncHandler(async (req, res) => {
  res.json({ project: await store.evolveProject(req.params.id, req.body && req.body.request) });
}));

router.use((error, req, res, next) => {
  const status = error.status || 500;
  const fallback = status === 404 ? "PROJECT_NOT_FOUND" : status === 409 ? "STALE_SOURCE" : status === 422 ? "RUN_FAILED" : "INVALID_CONTRACT_PAYLOAD";
  res.status(status).json({ error: { code: error.code || fallback, message: error.message || "Lỗi Xưởng không xác định.", ...(error.details ? { details: error.details } : {}) } });
});

module.exports = router;
