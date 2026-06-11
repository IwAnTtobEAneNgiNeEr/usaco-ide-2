"use strict";

// progress.js — GET /api/progress : the progression snapshot (XP, level,
// streak, daily quests, skill mastery, 7-day activity) that powers the
// Journey home screen. All values are derived on the fly by src/progress.js
// from existing problem metadata — nothing is stored.

const express = require("express");
const problemStore = require("../problemStore");
const { computeProgress } = require("../progress");
const { asyncHandler } = require("./_util");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems(); // sorted updatedAt desc
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
  const snapshot = computeProgress(metas);

  // "Tiếp tục" card: the most recently touched problem.
  const last = summaries[0] || null;
  const continueProblem = last
    ? { id: last.id, title: last.title, topic: last.topic, difficulty: last.difficulty, lastVerdict: last.lastVerdict, status: last.status }
    : null;

  res.json({ ok: true, ...snapshot, continueProblem });
}));

module.exports = router;
