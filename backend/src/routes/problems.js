"use strict";

const { spawn, spawnSync } = require("child_process");
const express = require("express");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// GET /api/problems
router.get("/", asyncHandler(async (req, res) => {
  res.json({ problems: await problemStore.listProblems() });
}));

// POST /api/problems
router.post("/", asyncHandler(async (req, res) => {
  const meta = await problemStore.createProblem(req.body || {});
  res.status(201).json({ problem: meta });
}));

// GET /api/problems/:id
router.get("/:id", requireProblem, asyncHandler(async (req, res) => {
  res.json({ problem: await problemStore.readMeta(req.problemId) });
}));

// PUT /api/problems/:id
router.put("/:id", requireProblem, asyncHandler(async (req, res) => {
  res.json({ problem: await problemStore.updateProblem(req.problemId, req.body || {}) });
}));

// DELETE /api/problems/:id
router.delete("/:id", requireProblem, asyncHandler(async (req, res) => {
  await problemStore.deleteProblem(req.problemId);
  res.json({ ok: true });
}));

// POST /api/problems/:id/duplicate
router.post("/:id/duplicate", requireProblem, asyncHandler(async (req, res) => {
  res.status(201).json({ problem: await problemStore.duplicateProblem(req.problemId) });
}));

// POST /api/problems/:id/open-in-editor — launch VS Code on the problem folder.
// The file-per-problem layout means power users can edit in their real editor
// while still using this app's judge/AI. Override the command with USACO_EDITOR.
router.post("/:id/open-in-editor", requireProblem, asyncHandler(async (req, res) => {
  const dir = fileStore.problemDir(req.problemId);
  const editor = process.env.USACO_EDITOR || "code";

  // Resolve the editor on PATH first — on Windows `shell:true` launches cmd.exe
  // (which always exists), so a missing `code` would never surface as a spawn
  // error. `where`/`which` gives a reliable up-front answer.
  const probe = process.platform === "win32" ? "where" : "which";
  let available = false;
  try { available = spawnSync(probe, [editor], { stdio: "ignore", timeout: 4000 }).status === 0; } catch { available = false; }
  if (!available) {
    return res.status(400).json({
      ok: false,
      error: "Không tìm thấy VS Code. Cài VS Code rồi bật lệnh 'code' trong PATH (Command Palette → \"Shell Command: Install 'code' command in PATH\")."
    });
  }

  try {
    const child = spawn(editor, [dir], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
    child.unref();
  } catch (error) {
    return res.status(400).json({ ok: false, error: "Không mở được editor: " + error.message });
  }
  res.json({ ok: true, dir });
}));

module.exports = router;
