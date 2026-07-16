"use strict";

const express = require("express");
const store = require("../standaloneModuleStore");
const { asyncHandler } = require("./_util");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  res.json({ modules: await store.listModules() });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  res.json({ artifact: await store.getModule(req.params.id) });
}));

router.post("/:id/open", asyncHandler(async (req, res) => {
  res.json({ artifact: await store.materialize(req.params.id) });
}));

router.get("/:id/source", asyncHandler(async (req, res) => {
  res.json(await store.readSource(req.params.id));
}));

router.put("/:id/source", express.json({ limit: "256kb" }), asyncHandler(async (req, res) => {
  res.json({ artifact: await store.saveSource(req.params.id, req.body && req.body.source) });
}));

router.get("/:id/history", asyncHandler(async (req, res) => {
  const artifact = await store.getModule(req.params.id);
  res.json({ artifactId: req.params.id, runs: artifact.runs });
}));

router.post("/:id/verify", asyncHandler(async (req, res) => {
  res.json(await store.verifyModule(req.params.id, req.body && req.body.suite));
}));

router.post("/:id/requirement-changes/:changeId/activate", asyncHandler(async (req, res) => {
  res.json({ artifact: await store.activateRequirementChange(req.params.id, req.params.changeId) });
}));

router.post("/weighted-graph-router/simulate", express.json({ limit: "64kb" }), asyncHandler(async (req, res) => {
  res.json(await store.simulateRoute(req.body && req.body.input));
}));

module.exports = router;
