"use strict";

const TRACKS = Object.freeze({
  COMPETITIVE: "competitive",
  ALGORITHM_ENGINEERING: "algorithm-engineering",
});

const ACTIVITY_KINDS = Object.freeze({
  COMPETITIVE_PROBLEM: "competitive-problem",
  ALGORITHM_MODULE: "algorithm-module",
  APPLIED_SIMULATION: "applied-simulation",
});

const TRACK_ALIASES = Object.freeze({
  competitive: TRACKS.COMPETITIVE,
  compete: TRACKS.COMPETITIVE,
  practice: TRACKS.COMPETITIVE,
  "competitive-programming": TRACKS.COMPETITIVE,
  "algorithm-engineering": TRACKS.ALGORITHM_ENGINEERING,
  build: TRACKS.ALGORITHM_ENGINEERING,
  applied: TRACKS.ALGORITHM_ENGINEERING,
  "verified-artifact": TRACKS.ALGORITHM_ENGINEERING,
});

const ACTIVITY_ALIASES = Object.freeze({
  problem: ACTIVITY_KINDS.COMPETITIVE_PROBLEM,
  exercise: ACTIVITY_KINDS.ALGORITHM_MODULE,
  module: ACTIVITY_KINDS.ALGORITHM_MODULE,
  task: ACTIVITY_KINDS.ALGORITHM_MODULE,
  "implementation-task": ACTIVITY_KINDS.ALGORITHM_MODULE,
  simulation: ACTIVITY_KINDS.APPLIED_SIMULATION,
});

function key(value) {
  return String(value == null ? "" : value).trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function normalizeActivityKind(value) {
  const normalized = key(value);
  if (Object.values(ACTIVITY_KINDS).includes(normalized)) return normalized;
  return ACTIVITY_ALIASES[normalized] || ACTIVITY_KINDS.COMPETITIVE_PROBLEM;
}

function normalizeTrack(value, activityKind) {
  const alias = TRACK_ALIASES[key(value)];
  if (alias) return alias;
  const kind = normalizeActivityKind(activityKind);
  return kind === ACTIVITY_KINDS.COMPETITIVE_PROBLEM
    ? TRACKS.COMPETITIVE
    : TRACKS.ALGORITHM_ENGINEERING;
}

function normalizeCatalogItem(item = {}) {
  const activityKind = normalizeActivityKind(item.activityKind);
  return { ...item, activityKind, track: normalizeTrack(item.track, activityKind) };
}

function isTrack(value) {
  return Object.values(TRACKS).includes(normalizeTrack(value));
}

module.exports = {
  TRACKS,
  ACTIVITY_KINDS,
  TRACK_ALIASES,
  normalizeActivityKind,
  normalizeTrack,
  normalizeCatalogItem,
  isTrack,
};
