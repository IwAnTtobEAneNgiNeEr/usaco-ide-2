"use strict";

// GET /api/problems/:id/game-review — Bảng Tổng Kết Ván Đấu (README-LOOPS.md
// task C3). Reads this problem's recorded event timeline, analyzes the most
// recent session, and returns the score + notes. Pure computation over data
// that's already on disk — no AI, no compiler, so this is cheap and instant.

const express = require("express");
const { readProblemEvents } = require("../recorder");
const { splitSessions, analyzeSession, buildNotes } = require("../gamereview/session-analyze");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

router.get("/:id/game-review", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const events = await readProblemEvents(id);
  const sessions = splitSessions(events);
  const latest = sessions.length ? sessions[sessions.length - 1] : [];
  const analysis = analyzeSession(latest);
  res.json({
    ok: true,
    sessionCount: sessions.length,
    analysis,
    notes: buildNotes(analysis),
  });
}));

module.exports = router;
