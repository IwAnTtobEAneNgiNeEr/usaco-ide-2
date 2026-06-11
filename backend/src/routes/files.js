"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// Build a GET/PUT pair for a single text file kind (code/input/expected/notes).
function bindFileKind(kind) {
  router.get(`/:id/${kind}`, requireProblem, asyncHandler(async (req, res) => {
    res.json({ [kind]: await problemStore.getFile(req.problemId, kind) });
  }));
  router.put(`/:id/${kind}`, requireProblem, asyncHandler(async (req, res) => {
    const content = req.body && typeof req.body[kind] === "string" ? req.body[kind] : "";
    await problemStore.setFile(req.problemId, kind, content);
    res.json({ ok: true });
  }));
}

bindFileKind("code");
bindFileKind("input");
bindFileKind("expected");
bindFileKind("notes");
bindFileKind("statement");
bindFileKind("mistakes");

// ---- Test cases ----------------------------------------------------------

// GET /api/problems/:id/tests
router.get("/:id/tests", requireProblem, asyncHandler(async (req, res) => {
  res.json({ tests: await problemStore.listTests(req.problemId) });
}));

// POST /api/problems/:id/tests
router.post("/:id/tests", requireProblem, asyncHandler(async (req, res) => {
  const test = await problemStore.addTest(req.problemId, req.body || {});
  res.status(201).json({ test });
}));

// PUT /api/problems/:id/tests/:testId
router.put("/:id/tests/:testId", requireProblem, asyncHandler(async (req, res) => {
  const test = await problemStore.updateTest(req.problemId, req.params.testId, req.body || {});
  res.json({ test });
}));

// DELETE /api/problems/:id/tests/:testId
router.delete("/:id/tests/:testId", requireProblem, asyncHandler(async (req, res) => {
  await problemStore.deleteTest(req.problemId, req.params.testId);
  res.json({ ok: true });
}));

// GET /api/problems/:id/history — detailed run snapshots (code + stdout/stderr)
router.get("/:id/history", requireProblem, asyncHandler(async (req, res) => {
  res.json({ history: await problemStore.listHistory(req.problemId) });
}));

module.exports = router;
