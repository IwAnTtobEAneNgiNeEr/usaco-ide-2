"use strict";

// routes/arena-season.js — S11 "Mùa Giải". Mounted at /api/arena. Thin: reads
// the current rating (S3) and lets seasonStore lazily roll over/update.

const path = require("path");
const express = require("express");
const config = require("../config");
const ratingStore = require("../arena/ratingStore");
const seasonStore = require("../arena/seasonStore");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");
const SEASON_FILE = path.join(config.DATA_DIR, "arena-season.json");

router.get("/season", asyncHandler(async (req, res) => {
  const ratingState = await ratingStore.load(RATING_FILE);
  const state = await seasonStore.ensureCurrentSeason(SEASON_FILE, ratingState.rating, Date.now());
  res.json({ ok: true, current: state.current, history: state.history });
}));

module.exports = router;
