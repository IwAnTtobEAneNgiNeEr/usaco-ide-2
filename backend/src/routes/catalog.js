"use strict";

const express = require("express");
const catalogStore = require("../catalogStore");
const smartContent = require("../smartContent");
const { canonicalTrackInput } = require("../trackContract");
const { asyncHandler } = require("./_util");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  const items = await catalogStore.listCatalog();
  res.json({
    items,
    count: items.length,
    tracks: ["competitive", "algorithm-engineering"],
    activityKinds: ["competitive-problem", "algorithm-module", "applied-simulation"],
  });
}));

router.get("/search", asyncHandler(async (req, res) => {
  const filters = {
    q: req.query.q,
    track: canonicalTrackInput(req.query.track) || req.query.track,
    activityKind: req.query.activityKind,
    concept: req.query.concept,
    provider: req.query.provider,
    collection: req.query.collection,
    status: req.query.status,
    minRating: req.query.minRating,
    maxRating: req.query.maxRating,
  };
  const results = smartContent.searchProblems(await catalogStore.listCatalog(), filters);
  res.json({ results, count: results.length, filters });
}));

module.exports = router;
