"use strict";

// coreFillStore.js — persistence for the "Điền Lõi" deck. One global file
// (one player), file-path-as-explicit-argument convention (same reasoning as
// ratingStore.js/cardStore.js: tests point at a tmp path, the real route
// points at data/arena-corefill-deck.json).
//
// A drill's `before`/`after` (the scaffold) and `tests` (with REAL, execution-
// derived expected outputs — see coreFillOrchestrator.js) are the only fields
// persisted. The original `core` is deliberately NEVER stored here — once a
// drill has passed self-verification, judging a student's fill only needs
// the scaffold + trusted tests, never the "answer key" text itself.

const fileStore = require("../fileStore");

function emptyState() {
  return { version: 1, drills: [] };
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.drills)) return emptyState();
  return { version: 1, drills: raw.drills };
}

/** Persist a newly self-verified drill. Returns the drill with its assigned id. */
async function addDrill(file, drill) {
  return fileStore.withLock(`arena-corefill:${file}`, async () => {
    const state = await load(file);
    const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = { ...drill, id, createdAt: drill.createdAt || new Date().toISOString(), solvedAt: null };
    state.drills.push(entry);
    await fileStore.writeJson(file, state);
    return entry;
  });
}

async function getDrill(file, id) {
  const state = await load(file);
  return state.drills.find((d) => d.id === id) || null;
}

/** Recent titles across the whole deck — fed back into ai.generateCoreFillDrill
 *  as `avoidTitles` so a batch doesn't clone itself. */
async function recentTitles(file, limit = 15) {
  const state = await load(file);
  return state.drills
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((d) => d.title);
}

async function markSolved(file, id, now = new Date().toISOString()) {
  return fileStore.withLock(`arena-corefill:${file}`, async () => {
    const state = await load(file);
    const entry = state.drills.find((d) => d.id === id);
    if (!entry) return null;
    entry.solvedAt = now;
    await fileStore.writeJson(file, state);
    return entry;
  });
}

module.exports = { load, addDrill, getDrill, recentTitles, markSolved };
