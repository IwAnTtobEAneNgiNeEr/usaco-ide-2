"use strict";

const path = require("path");
const { DATA_DIR } = require("./config");
const fileStore = require("./fileStore");
const { TRACKS, canonicalTrackInput } = require("./trackContract");

const FEEDBACK_FILE = path.join(DATA_DIR, "recommendation-feedback.json");
const SIGNALS = Object.freeze(["too_easy", "too_hard", "not_relevant", "already_know", "reset"]);

function key(track, itemId) { return `${track}\u0000${itemId}`; }

async function readState() {
  const state = await fileStore.readJson(FEEDBACK_FILE, { version: 1, entries: [] });
  return state && state.version === 1 && Array.isArray(state.entries) ? state : { version: 1, entries: [] };
}

async function listFeedback(track) {
  const canonicalTrack = track ? canonicalTrackInput(track) : null;
  const state = await readState();
  return state.entries
    .filter((entry) => !canonicalTrack || entry.track === canonicalTrack)
    .slice()
    .sort((a, b) => a.track.localeCompare(b.track) || a.itemId.localeCompare(b.itemId));
}

async function setFeedback({ itemId, track, signal, now } = {}) {
  if (!Object.values(TRACKS).includes(track)) { const error = new Error("Feedback track must be competitive or algorithm-engineering."); error.status = 400; throw error; }
  const canonicalTrack = track;
  if (typeof itemId !== "string" || !itemId.trim() || itemId.length > 240) { const error = new Error("Feedback itemId is invalid."); error.status = 400; throw error; }
  if (!SIGNALS.includes(signal)) { const error = new Error(`Feedback signal must be one of: ${SIGNALS.join(", ")}.`); error.status = 400; throw error; }
  return fileStore.withLock("recommendation-feedback", async () => {
    const state = await readState();
    const entryKey = key(canonicalTrack, itemId);
    state.entries = state.entries.filter((entry) => key(entry.track, entry.itemId) !== entryKey);
    let feedback = null;
    if (signal !== "reset") {
      feedback = { itemId, track: canonicalTrack, signal, updatedAt: now || new Date().toISOString() };
      state.entries.push(feedback);
    }
    state.entries.sort((a, b) => a.track.localeCompare(b.track) || a.itemId.localeCompare(b.itemId));
    await fileStore.writeJson(FEEDBACK_FILE, state);
    return feedback;
  });
}

module.exports = { FEEDBACK_FILE, SIGNALS, listFeedback, setFeedback };
