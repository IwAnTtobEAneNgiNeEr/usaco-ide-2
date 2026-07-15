"use strict";

// routes/arena-ghost.js — S8 "Bóng Ma". Mounted at /api/problems. Compares
// this problem's current sitting against the student's OWN past solve times
// on similar-difficulty problems — no new storage, reads recorder.js's
// existing session-log.jsonl files (same source Game Review reads).

const express = require("express");
const problemStore = require("../problemStore");
const { readProblemEvents } = require("../recorder");
const ghost = require("../arena/ghost");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

const RATING_BAND = 150; // "similar difficulty" — same band width rating.js's riskLabelFor uses for "standard"
const MAX_CANDIDATES = 20; // cap the fan-out of session-log reads

function cfRatingOf(meta) {
  const cf = meta.analysis && Number(meta.analysis.cfRating);
  return cf && cf > 0 ? cf : 0;
}

router.get("/:id/ghost", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const meta = await problemStore.readMeta(id);
  const targetRating = cfRatingOf(meta);

  // No rating estimate on the CURRENT problem → "similar difficulty" isn't a
  // meaningful question yet. Honest unavailable, not a guess.
  if (targetRating <= 0) {
    return res.json({ ok: true, available: false, sampleCount: 0 });
  }

  const summaries = await problemStore.listProblems();
  const candidates = summaries.filter((s) => s.id !== id && (s.status === "solved" || s.lastVerdict === "AC"));

  const withRating = [];
  for (const s of candidates) {
    if (withRating.length >= MAX_CANDIDATES * 3) break; // don't read every problem's meta on a huge workspace
    const m = await problemStore.readMeta(s.id);
    const r = cfRatingOf(m);
    if (r <= 0 || Math.abs(r - targetRating) > RATING_BAND) continue; // unrated candidates never count as "similar"
    withRating.push(s.id);
    if (withRating.length >= MAX_CANDIDATES) break;
  }

  const durations = [];
  for (const candidateId of withRating) {
    const events = await readProblemEvents(candidateId);
    const d = ghost.solveDurationMs(events);
    if (d != null) durations.push(d);
  }
  const baseline = ghost.buildGhostBaseline(durations);

  if (!baseline.available) {
    return res.json({ ok: true, available: false, sampleCount: baseline.sampleCount });
  }

  const currentEvents = await readProblemEvents(id);
  const elapsed = ghost.currentElapsedMs(currentEvents, Date.now());
  const compare = ghost.compareToGhost(elapsed, baseline);

  res.json({ ok: true, available: compare.available, sampleCount: baseline.sampleCount, baselineMedianMs: baseline.medianMs, currentElapsedMs: elapsed, ...compare });
}));

module.exports = router;
