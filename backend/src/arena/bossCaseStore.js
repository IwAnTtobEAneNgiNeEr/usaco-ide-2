"use strict";

// bossCaseStore.js — persistence for "Đối Thủ v1" (Boss Case). One global
// file (one player), keyed by problemId → case list (arena/bossCase.js
// shape). Same file-path-as-explicit-argument convention as cardStore.js/
// ratingStore.js: tests point at a tmp path, the real route points at
// data/arena-boss-cases.json.

const fileStore = require("../fileStore");
const bossCase = require("./bossCase");

function emptyState() {
  return { version: 1, byProblem: {} };
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !raw.byProblem) return emptyState();
  return { version: 1, byProblem: raw.byProblem };
}

/** One Gauntlet failure against `problemId`. Returns { state, entry, justPromoted }. */
async function recordFailure(file, problemId, { minimalInput, kind, expected, got, now = new Date().toISOString() } = {}) {
  return fileStore.withLock(`arena-boss-cases:${file}`, async () => {
    const state = await load(file);
    const existing = state.byProblem[problemId] || [];
    const { cases, entry, justPromoted } = bossCase.recordFailure(existing, { minimalInput, kind, expected, got, now });
    state.byProblem[problemId] = cases;
    await fileStore.writeJson(file, state);
    return { state, entry, justPromoted };
  });
}

/** Raw case list for one problem — [] if never touched. */
async function listForProblem(file, problemId) {
  const state = await load(file);
  return state.byProblem[problemId] || [];
}

/** Every promoted (count >= PROMOTE_THRESHOLD) case across all problems, sorted count desc. */
async function listPromoted(file) {
  const state = await load(file);
  const out = [];
  for (const [problemId, cases] of Object.entries(state.byProblem)) {
    for (const c of cases) {
      if (c.promoted) out.push({ problemId, ...c });
    }
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

module.exports = { load, recordFailure, listForProblem, listPromoted };
