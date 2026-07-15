"use strict";

// routes/arena-boss.js — "Đối Thủ v1" (Boss Case) read surface. Writes happen
// as a side effect of the Gauntlet finding a RECURRING counterexample (see
// routes/arena-reference.js's POST .../gauntlet and .../gauntlet/stream) —
// these routes only read the roster back. Mounted at /api/problems
// (per-problem) and /api/arena (global, promoted-only roster).

const path = require("path");
const express = require("express");
const config = require("../config");
const bossCaseStore = require("../arena/bossCaseStore");
const { asyncHandler, requireProblem } = require("./_util");

const problemsRouter = express.Router();
const arenaRouter = express.Router();
const BOSS_FILE = path.join(config.DATA_DIR, "arena-boss-cases.json");

// GET /api/problems/:id/boss-cases — every case recorded for this problem,
// including not-yet-promoted ones (a near-miss the student can see building up).
problemsRouter.get("/:id/boss-cases", requireProblem, asyncHandler(async (req, res) => {
  const cases = await bossCaseStore.listForProblem(BOSS_FILE, req.problemId);
  res.json({ ok: true, cases });
}));

// GET /api/arena/boss-cases — the global roster of NAMED bosses (promoted,
// count >= arena/bossCase.js's PROMOTE_THRESHOLD), across every problem.
arenaRouter.get("/boss-cases", asyncHandler(async (req, res) => {
  const bosses = await bossCaseStore.listPromoted(BOSS_FILE);
  res.json({ ok: true, bosses });
}));

module.exports = { problemsRouter, arenaRouter };
