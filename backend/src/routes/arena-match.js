"use strict";

// routes/arena-match.js — S2 (match state) + the rating-confirm handshake S3
// needs. Mounted under /api/problems.

const express = require("express");
const problemStore = require("../problemStore");
const arenaTurn = require("../arena/turn");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

// GET /api/problems/:id/match — live status + "would an AC right now be rated".
router.get("/:id/match", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await arenaTurn.getMatchStatus(req.problemId)) });
}));

// POST /api/problems/:id/match/surrender — nhân từ escape hatch; costs a small
// rated loss ONLY if the match was rated-eligible right now, never more.
router.post("/:id/match/surrender", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await arenaTurn.surrenderMatch(req.problemId, { now: Date.now() })) });
}));

// POST /api/problems/:id/match/adjourn — hoãn trận; zero rating impact, ever.
router.post("/:id/match/adjourn", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await arenaTurn.adjournMatch(req.problemId, { now: Date.now() })) });
}));

// POST /api/problems/:id/rating-confirm — the one-click "yes, this rating
// estimate is fine" a student does on the statement's rank chip. Requires an
// AI cfRating estimate to already exist — you cannot confirm a number that
// isn't there.
router.post("/:id/rating-confirm", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const meta = await problemStore.readMeta(id);
  const cf = meta.analysis && Number(meta.analysis.cfRating);
  if (!cf || cf <= 0) {
    return res.status(400).json({ ok: false, error: "Chưa có ước lượng rating để xác nhận — hãy phân tích đề trước." });
  }
  const updated = await problemStore.updateProblem(id, { analysis: { ...meta.analysis, ratingConfirmed: true } });
  res.json({ ok: true, analysis: updated.analysis });
}));

module.exports = router;
