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
bindFileKind("checker"); // special judge source (SPJ) — used when meta.usesChecker

// GET /api/problems/:id/workspace — everything the editor needs to open a
// problem in ONE round trip (meta + all single files + tests). The per-file
// GETs above stay for targeted refreshes.
router.get("/:id/workspace", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const [problem, code, input, expected, notes, statement, tests] = await Promise.all([
    problemStore.readMeta(id),
    problemStore.getFile(id, "code"),
    problemStore.getFile(id, "input"),
    problemStore.getFile(id, "expected"),
    problemStore.getFile(id, "notes"),
    problemStore.getFile(id, "statement"),
    problemStore.listTests(id)
  ]);
  res.json({ problem, code, input, expected, notes, statement, tests });
}));

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

// POST /api/problems/:id/tests/bulk — add many tests in one write (the .in/.out
// folder import). Oversized/over-limit items are skipped, not fatal.
router.post("/:id/tests/bulk", requireProblem, asyncHandler(async (req, res) => {
  const items = req.body && Array.isArray(req.body.tests) ? req.body.tests : [];
  if (!items.length) return res.status(400).json({ error: "No tests in payload." });
  const { added, skipped } = await problemStore.addTests(req.problemId, items);
  res.status(201).json({ added, skipped });
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
