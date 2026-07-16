"use strict";

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const ratingStore = require("../arena/ratingStore");
const smartContent = require("../smartContent");
const catalogStore = require("../catalogStore");
const feedbackStore = require("../recommendationFeedbackStore");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

router.get("/entry", asyncHandler(async (req, res) => {
  const canonicalTrack = ["competitive", "algorithm-engineering"].includes(req.query.track) ? req.query.track : null;
  const [problems, ratingState, catalog, feedback] = await Promise.all([
    problemStore.listProblems(),
    ratingStore.load(RATING_FILE),
    canonicalTrack ? catalogStore.listCatalog() : Promise.resolve(null),
    canonicalTrack ? feedbackStore.listFeedback(canonicalTrack) : Promise.resolve([]),
  ]);
  const requestedTarget = Number(req.query.targetRating);
  const historyTarget = ratingState && ratingState.gamesPlayed > 0 ? ratingState.rating : null;
  const targetRating = Number.isFinite(requestedTarget) && requestedTarget > 0 ? requestedTarget : historyTarget;
  const recommendationOptions = {
    track: req.query.track,
    concept: req.query.concept,
    minRating: req.query.minRating,
    maxRating: req.query.maxRating,
    targetRating,
    liked: smartContent.csv(req.query.liked),
    dismissed: smartContent.csv(req.query.dismissed),
  };
  const items = canonicalTrack
    ? smartContent.recommendCatalogEntries(catalog, { ...recommendationOptions, feedback })
    : smartContent.recommendEntries(problems, recommendationOptions);
  res.json({
    items,
    count: items.length,
    maxItems: 3,
    autoOpen: false,
    difficultyContext: targetRating == null ? null : { targetRating, source: Number.isFinite(requestedTarget) && requestedTarget > 0 ? "query" : "arena-history" },
    policy: { recentTopicIsWeakness: false, inventMastery: false, inventRating: false },
  });
}));

router.put("/feedback/:itemId", asyncHandler(async (req, res) => {
  const track = req.body && req.body.track;
  const signal = req.body && req.body.signal;
  if (!["competitive", "algorithm-engineering"].includes(track)) return res.status(400).json({ error: "Feedback track must be competitive or algorithm-engineering." });
  const itemId = req.params.itemId;
  const item = (await catalogStore.listCatalog()).find((candidate) => String(candidate.id) === itemId);
  if (!item || item.track !== track) return res.status(404).json({ error: "Catalog item does not exist in the requested track." });
  res.json({ feedback: await feedbackStore.setFeedback({ itemId, track, signal }) });
}));

module.exports = router;
