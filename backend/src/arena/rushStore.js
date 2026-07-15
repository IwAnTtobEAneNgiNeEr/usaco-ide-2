"use strict";

// rushStore.js — persistence for "Sới Đập Lỗi" (Bug Rush). Two files, one
// global player, same file-path-as-explicit-argument convention as every
// other arena store (ratingStore.js, cardStore.js...):
//   - RUN_FILE: the single in-progress (or last-finished) run + high score.
//   - DECK_FILE: a queue of self-verified, NEVER-yet-served drills. Serving
//     one POPS it (single-use — arcade design: a squashed bug shouldn't come
//     back around in the same session or the next).

const fileStore = require("../fileStore");
const rush = require("./rush");

// ---- run state ---------------------------------------------------------------

function emptyRunState() {
  return { version: 1, run: rush.defaultRun(), highScore: 0, totalRunsPlayed: 0, bestRunAt: null };
}

async function loadRunState(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !raw.run) return emptyRunState();
  return { ...emptyRunState(), ...raw, run: { ...rush.defaultRun(), ...raw.run } };
}

async function saveRun(file, run) {
  return fileStore.withLock(`arena-rush-run:${file}`, async () => {
    const state = await loadRunState(file);
    state.run = run;
    // A run that just ended updates the high score / play count exactly once
    // — keyed off THIS run's own finishedAt, so a later save of the SAME
    // finished run (e.g. a duplicate request) never double-counts, but the
    // NEXT run finishing later (a different finishedAt) always does.
    if (run.state === "over" && run.finishedAt && state._lastFinishedAt !== run.finishedAt) {
      state.totalRunsPlayed += 1;
      if (run.score > state.highScore) { state.highScore = run.score; state.bestRunAt = run.finishedAt; }
      state._lastFinishedAt = run.finishedAt;
    }
    await fileStore.writeJson(file, state);
    return state;
  });
}

// ---- deck ----------------------------------------------------------------------

function emptyDeck() {
  return { version: 1, drills: [] };
}

async function loadDeck(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.drills)) return emptyDeck();
  return { version: 1, drills: raw.drills };
}

async function addDrill(file, drill) {
  return fileStore.withLock(`arena-rush-deck:${file}`, async () => {
    const state = await loadDeck(file);
    const id = `rush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = { ...drill, id, createdAt: drill.createdAt || new Date().toISOString() };
    state.drills.push(entry);
    await fileStore.writeJson(file, state);
    return entry;
  });
}

/** Pop the first unused drill matching `tag` if given, else the very first
 *  one. Single-use: removed from the deck the moment it's taken. */
async function takeDrill(file, { tag } = {}) {
  return fileStore.withLock(`arena-rush-deck:${file}`, async () => {
    const state = await loadDeck(file);
    if (!state.drills.length) return null;
    const idx = tag ? state.drills.findIndex((d) => d.tag === tag) : 0;
    if (idx < 0) return null;
    const [entry] = state.drills.splice(idx, 1);
    await fileStore.writeJson(file, state);
    return entry || null;
  });
}

async function deckSize(file) {
  const state = await loadDeck(file);
  return state.drills.length;
}

async function recentTitles(file, limit = 15) {
  const state = await loadDeck(file);
  return state.drills
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((d) => d.title);
}

module.exports = { loadRunState, saveRun, loadDeck, addDrill, takeDrill, deckSize, recentTitles };
