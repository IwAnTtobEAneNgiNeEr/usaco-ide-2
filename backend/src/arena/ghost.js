"use strict";

// ghost.js — pure core of "Bóng Ma" (S8). The safest possible opponent: not a
// stranger's leaderboard entry, but the student's OWN past pace on problems of
// similar difficulty. Everything here reads the SAME recorder event timeline
// Game Review already reads (backend/src/recorder.js, gamereview/session-
// analyze.js) — no new storage, no invented signal.
//
// Pure: no fs, no Date.now() (caller passes `now`) — every input is an
// already-loaded event array.

const { splitSessions } = require("../gamereview/session-analyze");

const MIN_SAMPLES = 3; // fewer than this and a "median" is just noise — say so, don't fake it

/** First event timestamp -> the first AC verdict's timestamp, or null if this
 *  problem's timeline never reached an AC. */
function solveDurationMs(events) {
  const sorted = [...(events || [])].sort((a, b) => a.t - b.t);
  if (!sorted.length) return null;
  const acEvent = sorted.find((e) => e.type === "verdict" && e.data && e.data.verdict === "AC");
  if (!acEvent) return null;
  return acEvent.t - sorted[0].t;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Fold a list of past (similar-difficulty) solve durations into a baseline.
 *  Honest about insufficient data — never invents a median from 1-2 samples. */
function buildGhostBaseline(pastDurationsMs) {
  const list = (Array.isArray(pastDurationsMs) ? pastDurationsMs : []).filter((n) => Number.isFinite(n) && n > 0);
  if (list.length < MIN_SAMPLES) return { available: false, sampleCount: list.length, medianMs: null };
  return { available: true, sampleCount: list.length, medianMs: median(list) };
}

/** Elapsed time in the CURRENT sitting on this problem — reuses Game Review's
 *  own session-splitting so "today's session" means the same thing everywhere
 *  in this app. Returns null if there's no live/ongoing session to compare. */
function currentElapsedMs(events, now) {
  const sessions = splitSessions(events || []);
  if (!sessions.length) return null;
  const last = sessions[sessions.length - 1];
  if (!last.length) return null;
  return Math.max(0, now - last[0].t);
}

/** ratio > 1 means faster than the ghost (less time spent than the baseline median). */
function compareToGhost(currentMs, baseline) {
  if (!baseline || !baseline.available || !Number.isFinite(currentMs) || currentMs <= 0) {
    return { available: false };
  }
  const ratio = baseline.medianMs / currentMs;
  return { available: true, ratio: Number(ratio.toFixed(2)), faster: ratio > 1 };
}

module.exports = { MIN_SAMPLES, solveDurationMs, buildGhostBaseline, currentElapsedMs, compareToGhost };
