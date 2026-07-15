"use strict";

// ratingStore.js — persistence for the S3 Elo engine. One global file (there
// is one player), same file-path-as-explicit-argument convention as
// studentModel.js (every function takes `file`; production callers pass
// config.DATA_DIR/arena-rating.json, tests pass a throwaway tmp path) —
// this is what makes studentModel.test.js able to test real read/write
// behavior without ever touching the actual data/ directory, and this store
// needs the exact same property.

const fileStore = require("../fileStore");
const rating = require("./rating");

const HISTORY_CAP = 300;

function emptyState() {
  return {
    version: 1,
    rating: rating.DEFAULT_RATING,
    gamesPlayed: 0,
    band: rating.BAND_START,
    seeded: false,
    seededAt: null,
    history: [], // newest first: {id, at, problemId, problemRating, verdict, waBeforeAc, delta, ratingBefore, ratingAfter, refunded}
  };
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object") return emptyState();
  return { ...emptyState(), ...raw, history: Array.isArray(raw.history) ? raw.history : [] };
}

/** Read-modify-write under a lock keyed to this exact file (so two different
 *  callers pointed at two different files — e.g. two tests — never contend). */
async function mutate(file, apply) {
  return fileStore.withLock(`arena-rating:${file}`, async () => {
    const state = await load(file);
    const result = await apply(state);
    await fileStore.writeJson(file, state);
    return { state, result };
  });
}

/**
 * Seed the rating from past (already rated-eligible) matches — ONCE, ever.
 * Safe to call on every app boot / route hit: a no-op after the first success.
 * `entries` is built by the CALLER (a route reading problemStore) — this
 * store only folds numbers, it never reaches into problemStore itself.
 */
async function ensureSeeded(file, entries) {
  const { state } = await mutate(file, (s) => {
    if (s.seeded) return;
    const seeded = rating.seedFromHistory(entries);
    s.rating = seeded.rating;
    s.gamesPlayed = seeded.gamesPlayed;
    s.band = seeded.band;
    s.seeded = true;
    s.seededAt = new Date().toISOString();
    s.history.unshift({
      id: `seed-${Date.now()}`, at: s.seededAt, kind: "seed",
      note: `Ước lượng từ ${seeded.gamesPlayed} trận trước đó.`, ratingAfter: seeded.rating,
    });
  });
  return state;
}

/** Apply one rated result and append its history entry. Returns { state, entry }. */
async function applyAndSave(file, { problemId, problemRating, verdict, waBeforeAc, at }) {
  const { state } = await mutate(file, (s) => {
    const step = rating.applyResult({ rating: s.rating, gamesPlayed: s.gamesPlayed, problemRating, verdict, waBeforeAc });
    s.rating = step.ratingAfter;
    s.gamesPlayed = step.gamesPlayed;
    s.band = step.band;
    s.history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: at || new Date().toISOString(),
      problemId, problemRating, verdict, waBeforeAc: waBeforeAc || 0,
      delta: step.delta, ratingBefore: step.ratingBefore, ratingAfter: step.ratingAfter,
      refunded: false,
    });
    if (s.history.length > HISTORY_CAP) s.history = s.history.slice(0, HISTORY_CAP);
  });
  return { state, entry: state.history[0] };
}

/**
 * Reverse a specific history entry's delta exactly once (S12 arbitration
 * "hoàn điểm" when a test is ruled bad). gamesPlayed/band are NOT rewound —
 * a real attempt genuinely happened; only the point value it cost is undone.
 */
async function refund(file, historyEntryId) {
  const { result } = await mutate(file, (s) => {
    const entry = s.history.find((e) => e.id === historyEntryId);
    if (!entry || entry.refunded || entry.kind === "seed") return { ok: false, reason: "not-found-or-already-refunded" };
    entry.refunded = true;
    s.rating = Math.max(0, s.rating - entry.delta);
    return { ok: true, reversedDelta: -entry.delta, ratingAfter: s.rating };
  });
  return result;
}

module.exports = { load, ensureSeeded, applyAndSave, refund };
