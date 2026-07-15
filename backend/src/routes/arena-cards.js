"use strict";

// routes/arena-cards.js — Tàng Kinh Bug (S5) + Luyện thẻ (S6). Mounted at
// /api/arena. Minting itself happens as a side effect of a successful moment
// diagnosis (see routes/moment.js's persistDiagnosis) — these routes are for
// READING the collection and for the Flash Quiz "luyện thẻ" write-back loop.

const path = require("path");
const express = require("express");
const config = require("../config");
const cardStore = require("../arena/cardStore");
const bestiary = require("../arena/bestiary");
const studentModel = require("../studentModel");
const { asyncHandler } = require("./_util");

const router = express.Router();
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");

// GET /api/arena/cards — the whole collection + completion summary.
router.get("/cards", asyncHandler(async (req, res) => {
  const state = await cardStore.load(CARDS_FILE);
  res.json({ ok: true, species: bestiary.SPECIES, cards: state.cards, summary: bestiary.collectionSummary(state.cards) });
}));

// GET /api/arena/cards/:tag — a single species (uncaught → a zeroed placeholder card).
router.get("/cards/:tag", asyncHandler(async (req, res) => {
  const tag = req.params.tag;
  if (!bestiary.isSpecies(tag)) return res.status(404).json({ ok: false, error: "Không phải một loài hợp lệ." });
  const state = await cardStore.load(CARDS_FILE);
  res.json({ ok: true, card: state.cards[tag] || bestiary.emptyCard(tag) });
}));

// POST /api/arena/cards/:tag/train  { correct: boolean } — Flash Quiz v2 (S6):
// a training rep on a caught card. Writes back to the Student Model (closing
// the open item in README-AUTOPILOT.md §5: "quiz result chưa ghi ngược") via
// the existing generic noteHabit — no new studentModel.js fields needed.
router.post("/cards/:tag/train", asyncHandler(async (req, res) => {
  const tag = req.params.tag;
  if (!bestiary.isSpecies(tag)) return res.status(404).json({ ok: false, error: "Không phải một loài hợp lệ." });
  const correct = Boolean((req.body || {}).correct);

  const result = await cardStore.applyTraining(CARDS_FILE, tag, { correct });
  if (!result.trained) {
    return res.status(400).json({ ok: false, error: "Chưa bắt được loài này — không thể luyện." });
  }
  try {
    await studentModel.noteHabit(STUDENT_MODEL_FILE, {
      tag: `quiz-${tag}-${correct ? "correct" : "incorrect"}`,
      evidence: "arena-cards.json",
    });
  } catch { /* write-back is best-effort — the card's own state already updated */ }

  res.json({ ok: true, card: result.card, tamedJustNow: result.tamedJustNow, escaped: result.escaped });
}));

module.exports = router;
