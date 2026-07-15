"use strict";

// weeklyStore.js — persistence for S9 Weekend Arena sessions. One global file
// (one player, potentially many past sessions), file-path-as-explicit-argument
// convention (same as ratingStore.js/cardStore.js).

const crypto = require("crypto");
const fileStore = require("../fileStore");

function emptyState() {
  return { version: 1, sessions: [] }; // newest last; small enough to keep them all
}

async function load(file) {
  const raw = await fileStore.readJson(file, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.sessions)) return emptyState();
  return raw;
}

async function mutate(file, apply) {
  return fileStore.withLock(`arena-weekly:${file}`, async () => {
    const state = await load(file);
    const result = apply(state);
    await fileStore.writeJson(file, state);
    return { state, result };
  });
}

function findSession(state, sessionId) {
  return state.sessions.find((s) => s.id === sessionId) || null;
}

/** Start a new session. `problemIds` must be non-empty; the caller (route) is
 *  responsible for confirming every id actually exists. */
async function createSession(file, { problemIds, durationMin, now }) {
  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    throw new Error("weeklyStore.createSession: problemIds must be a non-empty array");
  }
  const duration = Math.min(Math.max(Number(durationMin) || 0, 15), 300); // 15min..5h sanity bounds
  const session = {
    id: crypto.randomUUID(),
    problemIds: [...problemIds],
    startedAt: now,
    durationMin: duration,
    cutoffAt: now + duration * 60000,
    submissions: [],
    closedAt: null,
  };
  const { state } = await mutate(file, (s) => { s.sessions.push(session); });
  return findSession(state, session.id);
}

async function getSession(file, sessionId) {
  const state = await load(file);
  return findSession(state, sessionId);
}

/**
 * Record one submission — SERVER decides whether the cutoff has passed
 * (README-LOOPS.md §1.2 in spirit: the honesty of this event depends on the
 * clock, not on the client's word for it). Rejects instead of silently
 * dropping so a late submit gets an honest "trận đã kết thúc" instead of
 * looking accepted.
 */
async function submit(file, sessionId, { problemId, verdict, now }) {
  const { result } = await mutate(file, (state) => {
    const session = findSession(state, sessionId);
    if (!session) return { ok: false, reason: "not-found" };
    if (!session.problemIds.includes(problemId)) return { ok: false, reason: "not-in-session" };
    if (now >= session.cutoffAt || session.closedAt) return { ok: false, reason: "closed" };
    session.submissions.push({ problemId, verdict, at: now });
    return { ok: true, session };
  });
  return result;
}

async function closeSession(file, sessionId, now) {
  const { result } = await mutate(file, (state) => {
    const session = findSession(state, sessionId);
    if (!session) return { ok: false, reason: "not-found" };
    if (!session.closedAt) session.closedAt = Math.max(now, session.cutoffAt);
    return { ok: true, session };
  });
  return result;
}

module.exports = { createSession, getSession, submit, closeSession };
