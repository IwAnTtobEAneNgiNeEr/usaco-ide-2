"use strict";

const express = require("express");
const problemStore = require("../problemStore");
const settingsStore = require("../settingsStore");
const { asyncHandler } = require("./_util");

const router = express.Router();

// Map the old tracker's status/difficulty/source enums onto the new lean ones.
function mapStatus(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("solved") || v.includes("done") || v.includes("ac")) return "solved";
  if (v.includes("review")) return "review";
  if (v.includes("progress") || v.includes("learning")) return "learning";
  return "learning";
}

function pickLatestAttempt(attempts, problemId) {
  const mine = (attempts || []).filter((a) => a && a.problemId === problemId);
  if (mine.length === 0) return null;
  // Prefer the most recent by createdAt/updatedAt/at if present, else last in array.
  mine.sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || a.at || 0) || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || b.at || 0) || 0;
    return ta - tb;
  });
  return mine[mine.length - 1];
}

// POST /api/import — migrate a DSA Evolution Tracker JSON export into the workspace.
router.post("/", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const judgeData = body.judgeData || body || {};
  const problems = Array.isArray(judgeData.problems) ? judgeData.problems : [];
  const attempts = Array.isArray(judgeData.attempts) ? judgeData.attempts : [];
  const testCases = Array.isArray(judgeData.testCases) ? judgeData.testCases : [];

  if (problems.length === 0) {
    return res.status(400).json({
      error: "Không tìm thấy judgeData.problems trong file. File có đúng là export từ DSA Tracker không?"
    });
  }

  const imported = [];
  const errors = [];
  const template = await settingsStore.getCodeTemplate();

  for (const p of problems) {
    try {
      if (!p || typeof p !== "object") continue;
      const oldId = p.id;
      const attempt = pickLatestAttempt(attempts, oldId);
      const code = (attempt && typeof attempt.code === "string" && attempt.code.trim()) ? attempt.code : template;

      const tests = testCases
        .filter((t) => t && t.problemId === oldId)
        .map((t) => ({ input: String(t.input || ""), expected: String(t.expectedOutput || t.expected || "") }));

      const meta = await problemStore.createProblem({
        title: p.title || p.name || "Imported problem",
        source: typeof p.source === "string" ? p.source : "",
        topic: typeof p.topic === "string" ? p.topic : "",
        difficulty: typeof p.difficulty === "string" ? p.difficulty.toLowerCase() : "unrated",
        status: mapStatus(p.status),
        lastVerdict: attempt && attempt.verdict ? String(attempt.verdict).toUpperCase() : null,
        code,
        tests
      });
      imported.push({ from: oldId, to: meta.id, title: meta.title, tests: tests.length });
    } catch (error) {
      errors.push({ id: p && p.id, error: error.message });
    }
  }

  res.json({
    ok: true,
    importedCount: imported.length,
    imported,
    errors,
    message: `Đã import ${imported.length} bài vào USACO IDE 2.0.`
  });
}));

module.exports = router;
