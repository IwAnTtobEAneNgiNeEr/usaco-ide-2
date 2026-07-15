"use strict";

// routes/arena-roadmap.js — S7 "Đường lên Silver". Mounted at /api/arena.
// Thin: gathers already-computed skill mastery (skills.js) + the current
// rating snapshot (ratingStore.js) and hands them to the pure roadmap.js.

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const { computeSkillMap } = require("../skills");
const ratingStore = require("../arena/ratingStore");
const roadmap = require("../arena/roadmap");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

router.get("/roadmap", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const metas = (await Promise.allSettled(summaries.map((s) => problemStore.readMeta(s.id))))
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const { clusters } = computeSkillMap(metas);
  const ratingState = await ratingStore.load(RATING_FILE);

  res.json({ ok: true, ...roadmap.computeRoadmap(clusters, ratingState) });
}));

module.exports = router;
