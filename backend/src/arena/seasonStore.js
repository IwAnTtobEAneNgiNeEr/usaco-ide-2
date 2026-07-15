"use strict";

// seasonStore.js — persistence for S11 (Mùa Giải). File-path-as-explicit-
// argument convention (same as ratingStore.js/cardStore.js/weeklyStore.js).

const fileStore = require("../fileStore");
const season = require("./season");

function emptyState() {
  return { version: 1, current: null, history: [] };
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object") return emptyState();
  return { version: 1, current: raw.current || null, history: Array.isArray(raw.history) ? raw.history : [] };
}

/**
 * Idempotent per-call: rolls over into a fresh season if the calendar month
 * changed since `state.current` was last touched, otherwise just updates the
 * running season-best. Safe to call on every /api/arena/season hit.
 */
async function ensureCurrentSeason(file, rating, now = Date.now()) {
  return fileStore.withLock(`arena-season:${file}`, async () => {
    const state = await load(file);
    if (season.shouldRollover(state.current, now)) {
      const rolled = season.rollover(state, { now, rating });
      state.current = rolled.current;
      state.history = rolled.history;
    } else {
      state.current = season.noteRatingUpdate(state.current, rating, now);
    }
    await fileStore.writeJson(file, state);
    return state;
  });
}

module.exports = { load, ensureCurrentSeason };
