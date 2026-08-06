"use strict";

// telemetryStore.js — append-only event log for the NCKH research metrics
// (docs/NCKH.md §5: A/B/C/D). One anonymous participant id per install
// (data/participant.json), one JSON line per event (data/events.jsonl).
// Owner-as-first-participant: the same id accumulates from day one, so the
// owner's own usage while building the app is itself research data.

const crypto = require("crypto");
const path = require("path");
const fsp = require("fs/promises");
const fileStore = require("./fileStore");
const { DATA_DIR } = require("./config");

const PARTICIPANT_FILE = path.join(DATA_DIR, "participant.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

let participantCache = null;

async function getOrCreateParticipant() {
  if (participantCache) return participantCache;
  const existing = await fileStore.readJson(PARTICIPANT_FILE, null);
  if (existing && existing.id) {
    participantCache = existing;
    return existing;
  }
  const created = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await fileStore.writeJson(PARTICIPANT_FILE, created);
  participantCache = created;
  return created;
}

// Serialize appends through the same keyed lock fileStore uses for
// read-modify-write JSON, so two near-simultaneous events never interleave
// their lines mid-write.
async function appendEvent({ event, sessionId, payload }) {
  const participant = await getOrCreateParticipant();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    participantId: participant.id,
    sessionId: sessionId || null,
    event,
    payload: payload || {}
  });
  await fileStore.withLock("events.jsonl", async () => {
    await fileStore.ensureDir(DATA_DIR);
    await fsp.appendFile(EVENTS_FILE, line + "\n", "utf8");
  });
}

module.exports = { getOrCreateParticipant, appendEvent, PARTICIPANT_FILE, EVENTS_FILE };
