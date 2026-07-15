"use strict";

// routes/arena-rating.js — S3 (identity) + S4 (stakes preview). Mounted at
// /api/arena — there is exactly one player, so this is NOT under /problems/:id.
//
// Honesty note for whoever reads this next: `ensureSeeded` genuinely has
// nothing to seed from on a fresh install of this system. Being RATED
// requires a trusted reference (arena/referenceStore.js) + a confirmed
// problem rating — concepts that didn't exist before this build, so no past
// history entry can honestly be reconstructed as "was rated at the time".
// Seeding therefore settles at the DEFAULT_RATING with 0 games (never fabricated
// confidence) and the rating only starts moving once real RATED matches are
// played going forward. The seeding machinery (rating.seedFromHistory /
// ratingStore.ensureSeeded) stays real and tested for when that data exists.

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const ratingStore = require("../arena/ratingStore");
const rating = require("../arena/rating");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

function withTierInfo(state) {
  const tier = rating.tierOf(state.rating);
  return {
    ...state,
    tier: { id: tier.id, name: tier.name },
    nextTierGap: rating.nextTierGap(state.rating),
  };
}

// GET /api/arena/rating
router.get("/rating", asyncHandler(async (req, res) => {
  await ratingStore.ensureSeeded(RATING_FILE, []); // see file header — a documented no-op today, forward-compatible
  const state = await ratingStore.load(RATING_FILE);
  res.json({ ok: true, ...withTierInfo(state) });
}));

// GET /api/arena/rating/stakes?problemId=X — "+N/−M" preview for a candidate problem.
router.get("/rating/stakes", asyncHandler(async (req, res) => {
  const problemId = String(req.query.problemId || "");
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const meta = await problemStore.readMeta(problemId);
  const cf = meta.analysis && Number(meta.analysis.cfRating);
  const problemRating = cf && cf > 0 ? cf : rating.DEFAULT_RATING;
  const state = await ratingStore.load(RATING_FILE);
  const stakes = rating.stakesPreview({ rating: state.rating, gamesPlayed: state.gamesPlayed, problemRating });
  res.json({ ok: true, problemId, problemRating, ...stakes, risk: rating.riskLabelFor(state.rating, problemRating) });
}));

// POST /api/arena/rating/refund  { historyEntryId } — S12 arbitration hook:
// reverses exactly one past delta when a test is ruled "bad" (never double-applies).
router.post("/rating/refund", asyncHandler(async (req, res) => {
  const historyEntryId = String((req.body || {}).historyEntryId || "");
  if (!historyEntryId) return res.status(400).json({ ok: false, error: "Thiếu historyEntryId." });
  const result = await ratingStore.refund(RATING_FILE, historyEntryId);
  if (!result.ok) return res.status(400).json({ ok: false, error: "Không tìm thấy trận đó, hoặc đã hoàn điểm rồi." });
  res.json({ ok: true, ...result });
}));

module.exports = router;
