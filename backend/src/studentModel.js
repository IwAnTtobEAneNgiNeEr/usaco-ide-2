"use strict";

// studentModel.js — Student Model store (README-LOOPS.md §3.3, task B2).
//
// The evidence-backed hub every Loop-3/4 feature reads from: recurring bugs,
// solve pace per topic, habits. The one rule that matters more than any
// other: nothing gets written here without a `count` and `evidence` — no
// writer (Autopsy, Game Review, judge) may record a "fact" that isn't backed
// by something a human could go check. `mastery` is deliberately never
// populated by this module: it is owned by /api/stats/skills, and duplicating
// it here would give two sources of truth a chance to disagree.
//
// Atomic-write discipline matches fileStore.js (temp-then-rename via
// writeJson) and read-modify-write races are serialized per file path with
// fileStore's keyed lock, the same mechanism problemStore uses for meta.json.

const path = require("path");
const { withLock, ensureDir, readJson, writeJson } = require("./fileStore");

const EVIDENCE_CAP = 20; // most recent N — enough to see a pattern, not a hoarder
const PACE_SAMPLE_CAP = 50;

function emptyModel() {
  return { version: 1, recurringBugs: [], paceByTopic: [], mastery: [], habits: [] };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function load(file) {
  const data = await readJson(file, null);
  return data || emptyModel();
}

async function mutate(file, apply) {
  return withLock(`student-model:${file}`, async () => {
    const model = await load(file);
    apply(model);
    await ensureDir(path.dirname(file));
    await writeJson(file, model);
    return model;
  });
}

function pushEvidence(entry, evidence) {
  entry.evidence.push(evidence);
  if (entry.evidence.length > EVIDENCE_CAP) entry.evidence = entry.evidence.slice(-EVIDENCE_CAP);
}

/** Record one sighting of a recurring bug tag (e.g. "long-long-overflow"). */
async function noteRecurringBug(file, { tag, seenAt, evidence } = {}) {
  if (!tag) throw new Error("studentModel.noteRecurringBug: tag is required");
  if (!evidence) throw new Error("studentModel.noteRecurringBug: evidence is required");
  return mutate(file, (model) => {
    let entry = model.recurringBugs.find((b) => b.tag === tag);
    if (!entry) {
      entry = { tag, count: 0, lastSeen: null, evidence: [] };
      model.recurringBugs.push(entry);
    }
    entry.count += 1;
    if (seenAt && (!entry.lastSeen || seenAt > entry.lastSeen)) entry.lastSeen = seenAt;
    pushEvidence(entry, evidence);
  });
}

/** Record one solved-problem duration for a topic; recomputes the running median. */
async function noteSolveTime(file, { topic, minutes } = {}) {
  if (!topic) throw new Error("studentModel.noteSolveTime: topic is required");
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("studentModel.noteSolveTime: minutes must be a non-negative number");
  }
  return mutate(file, (model) => {
    let entry = model.paceByTopic.find((p) => p.topic === topic);
    if (!entry) {
      entry = { topic, samples: 0, medianSolveMin: 0, recentMinutes: [] };
      model.paceByTopic.push(entry);
    }
    entry.samples += 1;
    entry.recentMinutes.push(minutes);
    if (entry.recentMinutes.length > PACE_SAMPLE_CAP) {
      entry.recentMinutes = entry.recentMinutes.slice(-PACE_SAMPLE_CAP);
    }
    entry.medianSolveMin = median(entry.recentMinutes);
  });
}

/** Record one occurrence of a behavioral habit tag (e.g. "fix-before-reread"). */
async function noteHabit(file, { tag, evidence } = {}) {
  if (!tag) throw new Error("studentModel.noteHabit: tag is required");
  if (!evidence) throw new Error("studentModel.noteHabit: evidence is required");
  return mutate(file, (model) => {
    let entry = model.habits.find((h) => h.tag === tag);
    if (!entry) {
      entry = { tag, count: 0, evidence: [] };
      model.habits.push(entry);
    }
    entry.count += 1;
    pushEvidence(entry, evidence);
  });
}

module.exports = { load, noteRecurringBug, noteSolveTime, noteHabit };
