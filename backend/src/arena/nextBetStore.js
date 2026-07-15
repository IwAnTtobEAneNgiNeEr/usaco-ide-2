"use strict";

// nextBetStore.js — persistence for "Kèo 3 cửa"'s Mystery Bet door. One
// global file (one player), file-path-as-explicit-argument convention (same
// as cardStore.js/ratingStore.js). The store only remembers WHICH problem is
// currently committed and whether it's been opened — picking/redacting is
// arena/nextBet.js's job, never this file's.
//
// `openedAt` is the anti-farm gate: once a Mystery Bet has been opened
// (the student has actually looked at it), rerolling away from it is refused
// — otherwise "reroll until easy" would defeat the entire point of a kèo ẩn.

const fileStore = require("../fileStore");

function emptyState() {
  return { version: 1, mysteryPick: null, lastRerollAt: null };
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object") return emptyState();
  return { version: 1, mysteryPick: raw.mysteryPick || null, lastRerollAt: raw.lastRerollAt || null };
}

async function getPick(file) {
  return (await load(file)).mysteryPick;
}

/** Overwrite the committed pick with a fresh, unopened one. Does NOT touch
 *  lastRerollAt — only the reroll action spends that budget. */
async function commitPick(file, problemId, now = new Date().toISOString()) {
  return fileStore.withLock(`arena-next-bet:${file}`, async () => {
    const state = await load(file);
    state.mysteryPick = { problemId, committedAt: now, openedAt: null };
    await fileStore.writeJson(file, state);
    return state.mysteryPick;
  });
}

/** Idempotent — re-opening an already-opened pick never moves openedAt. */
async function openPick(file, now = new Date().toISOString()) {
  return fileStore.withLock(`arena-next-bet:${file}`, async () => {
    const state = await load(file);
    if (!state.mysteryPick) return null;
    if (!state.mysteryPick.openedAt) state.mysteryPick.openedAt = now;
    await fileStore.writeJson(file, state);
    return state.mysteryPick;
  });
}

async function clearPick(file) {
  return fileStore.withLock(`arena-next-bet:${file}`, async () => {
    const state = await load(file);
    state.mysteryPick = null;
    await fileStore.writeJson(file, state);
  });
}

/** Returns { ok:true, mysteryPick } or { ok:false, reason:"already-opened"|"cooldown", retryAfterMs? }. */
async function reroll(file, newProblemId, now = new Date().toISOString(), { cooldownMs = 86400000 } = {}) {
  return fileStore.withLock(`arena-next-bet:${file}`, async () => {
    const state = await load(file);
    if (state.mysteryPick && state.mysteryPick.openedAt) {
      return { ok: false, reason: "already-opened" };
    }
    if (state.lastRerollAt) {
      const elapsed = Date.parse(now) - Date.parse(state.lastRerollAt);
      if (elapsed < cooldownMs) return { ok: false, reason: "cooldown", retryAfterMs: cooldownMs - elapsed };
    }
    state.mysteryPick = { problemId: newProblemId, committedAt: now, openedAt: null };
    state.lastRerollAt = now;
    await fileStore.writeJson(file, state);
    return { ok: true, mysteryPick: state.mysteryPick };
  });
}

module.exports = { load, getPick, commitPick, openPick, clearPick, reroll };
