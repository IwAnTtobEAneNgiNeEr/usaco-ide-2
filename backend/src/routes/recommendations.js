"use strict";

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const ratingStore = require("../arena/ratingStore");
const smartContent = require("../smartContent");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

router.get("/entry", asyncHandler(async (req, res) => {
  const [problems, ratingState] = await Promise.all([problemStore.listProblems(), ratingStore.load(RATING_FILE)]);
  const requestedTarget = Number(req.query.targetRating);
  const historyTarget = ratingState && ratingState.gamesPlayed > 0 ? ratingState.rating : null;
  const targetRating = Number.isFinite(requestedTarget) && requestedTarget > 0 ? requestedTarget : historyTarget;
  const items = smartContent.recommendEntries(problems, {
    track: req.query.track,
    concept: req.query.concept,
    minRating: req.query.minRating,
    maxRating: req.query.maxRating,
    targetRating,
    liked: smartContent.csv(req.query.liked),
    dismissed: smartContent.csv(req.query.dismissed),
  });
  res.json({
    items,
    count: items.length,
    maxItems: 3,
    autoOpen: false,
    difficultyContext: targetRating == null ? null : { targetRating, source: Number.isFinite(requestedTarget) && requestedTarget > 0 ? "query" : "arena-history" },
    policy: { recentTopicIsWeakness: false, inventMastery: false, inventRating: false },
  });
}));

module.exports = router;
