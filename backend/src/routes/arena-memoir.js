"use strict";

// routes/arena-memoir.js — S10 "Hồi Ký Trận Đấu". Two thin reads:
//   GET /api/problems/:id/memoir — one problem's peak-end narrative
//   GET /api/arena/reel          — today's end-of-day summary reel
// Neither writes anything; both fold together data Game Review, the rating
// engine, and the bestiary already produce.

const path = require("path");
const express = require("express");
const config = require("../config");
const { readProblemEvents } = require("../recorder");
const { splitSessions, analyzeSession, buildNotes } = require("../gamereview/session-analyze");
const ratingStore = require("../arena/ratingStore");
const cardStore = require("../arena/cardStore");
const memoir = require("../arena/memoir");
const { asyncHandler, requireProblem } = require("./_util");

const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");

const problemsRouter = express.Router();
const arenaRouter = express.Router();

problemsRouter.get("/:id/memoir", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const events = await readProblemEvents(id);
  const sessions = splitSessions(events);
  const latest = sessions.length ? sessions[sessions.length - 1] : [];
  const analysis = analyzeSession(latest);
  const notes = buildNotes(analysis);

  const ratingState = await ratingStore.load(RATING_FILE);
  const ratingDelta = ratingState.history.find((e) => e.problemId === id && e.kind !== "seed") || null;

  const cardsState = await cardStore.load(CARDS_FILE);
  const cardsWon = memoir.cardsWonForProblem(cardsState.cards, id);

  res.json({ ok: true, ...memoir.buildMemoir({ analysis, notes, ratingDelta, cardsWon }) });
}));

function isToday(isoOrEpoch, now) {
  const d = new Date(isoOrEpoch);
  const n = new Date(now);
  return d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
}

arenaRouter.get("/reel", asyncHandler(async (req, res) => {
  const now = Date.now();
  const ratingState = await ratingStore.load(RATING_FILE);
  const cardsState = await cardStore.load(CARDS_FILE);

  // history is newest-first; reverse to chronological for buildSessionReel's
  // "first/last entry = start/end of day" contract.
  const todaysDeltas = ratingState.history.filter((e) => e.kind !== "seed" && isToday(e.at, now)).reverse();

  const entries = todaysDeltas.map((ratingDelta) => ({
    at: ratingDelta.at,
    ratingDelta,
    cardsWon: memoir.cardsWonForProblem(cardsState.cards, ratingDelta.problemId),
  }));

  res.json({ ok: true, ...memoir.buildSessionReel(entries) });
}));

module.exports = { problemsRouter, arenaRouter };
