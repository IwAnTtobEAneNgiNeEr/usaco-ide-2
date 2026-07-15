"use strict";

// cardStore.js — persistence for the S5/S6 bestiary. One global file (one
// player), file-path-as-explicit-argument convention (same reasoning as
// ratingStore.js/studentModel.js: tests point at a tmp path, the real route
// points at data/arena-cards.json).

const fileStore = require("../fileStore");
const bestiary = require("./bestiary");

function emptyState() {
  return { version: 1, cards: {} }; // tag -> card (bestiary.js shape)
}

// UTC date-slice day key (same simple form as routes/stats.js's dayKey) —
// this is a server-side anti-farm gate, not a user-facing streak boundary, so
// it doesn't need progress.js's local-time nuance.
function dayKey(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !raw.cards) return emptyState();
  return { version: 1, cards: raw.cards };
}

/** One sighting of `tag`. Returns { state, card, isNew, leveledUp }. A non-
 *  species tag (e.g. "khac") is a silent no-op — never a thrown error reaching
 *  a fire-and-forget caller (mirrors recorder.js's own "never break the thing
 *  recording it" discipline), returning `{ minted: false }` instead. */
async function mint(file, tag, { evidence, seenAt } = {}) {
  if (!bestiary.isSpecies(tag)) return { minted: false };
  return fileStore.withLock(`arena-cards:${file}`, async () => {
    const state = await load(file);
    const { card, isNew, leveledUp } = bestiary.mintOrLevelUp(state.cards[tag], { tag, evidence, seenAt });
    state.cards[tag] = card;
    await fileStore.writeJson(file, state);
    return { minted: true, state, card, isNew, leveledUp };
  });
}

/** Card training (S6) — pure state change persisted the same way as a
 *  sighting. Also stamps lastTrainedAt/trainCount — Specimen unification's
 *  due-clock (bestiary.dueForTraining) reads these to know when a card is due
 *  again, the exact same [3,7,21,60] engine reviewQueue.js uses for problems.
 *
 *  Capped at ONE counted rep per tag per calendar day: the Flash Quiz UI lets
 *  a student see the correct answer, hit "Làm lại", and re-answer the SAME
 *  question within the same sitting — without this gate that's 3 correct
 *  answers in under a minute taming a card that was never actually retained.
 *  A same-day repeat still returns ok (the quiz itself keeps working) but
 *  `trained:false` — no streak/tame/escape movement, no trainCount bump. */
async function applyTraining(file, tag, { correct, tameThreshold = 3, now = new Date().toISOString() } = {}) {
  return fileStore.withLock(`arena-cards:${file}`, async () => {
    const state = await load(file);
    const card = state.cards[tag];
    if (!card) return { trained: false, reason: "not-caught-yet" };
    if (card.lastTrainedAt && dayKey(card.lastTrainedAt) === dayKey(now)) {
      return { trained: false, reason: "already-trained-today", card };
    }
    const streak = correct ? (card.trainingStreak || 0) + 1 : 0;
    const wasTamed = Boolean(card.tamed);
    const tamed = correct ? (wasTamed || streak >= tameThreshold) : false;
    const escaped = wasTamed && !tamed;
    state.cards[tag] = { ...card, trainingStreak: streak, tamed, trainCount: (card.trainCount || 0) + 1, lastTrainedAt: now };
    await fileStore.writeJson(file, state);
    return { trained: true, card: state.cards[tag], tamedJustNow: tamed && !wasTamed, escaped };
  });
}

module.exports = { load, mint, applyTraining };
