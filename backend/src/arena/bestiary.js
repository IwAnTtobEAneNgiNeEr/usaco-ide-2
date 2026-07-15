"use strict";

// bestiary.js — pure core of "Tàng Kinh Bug" (S5). The reframe at the heart of
// the Đấu Trường: a WA the student can't yet explain is a loss, but a WA the
// system successfully DIAGNOSES is loot — a card for the exact species of bug
// that just bit them, evidence-backed (points at the same moment/<ts>.json the
// Khoảnh Khắc autopilot already writes, README-AUTOPILOT.md §3).
//
// Species = the moment/diagnose.js taxonomy MINUS "khac". "khac" is the
// catch-all/uncertain bucket — every other call site in this codebase already
// treats it as non-diagnostic (planner.js's quiz seeding, moment.js's
// Student Model write both explicitly skip tag==="khac"); a bestiary entry for
// "anything else" would not be a real, nameable species, so it stays excluded
// here for the same reason. That leaves exactly 10 catchable species — a
// finite, completable collection (README-LOOPS.md §1.2: taxonomy is a CLOSED list).
//
// Pure: no fs, no Date.now() (caller passes `seenAt`) — a card is just a
// small state machine over (count, level, evidence).

const { TAXONOMY, tagLabel } = require("../moment/diagnose");
const { dueStatus } = require("../reviewQueue");

const SPECIES = TAXONOMY.filter((t) => t.tag !== "khac");
const SPECIES_TAGS = new Set(SPECIES.map((s) => s.tag));

const EVIDENCE_CAP = 5;

// Level thresholds read as "count sightings needed to reach this level".
const LEVELS = [
  { level: 1, min: 1, name: "Mới bắt" },
  { level: 2, min: 3, name: "Quen mặt" },
  { level: 3, min: 6, name: "Thuộc bài" },
  { level: 4, min: 10, name: "Khắc tinh" },
];

function isSpecies(tag) {
  return SPECIES_TAGS.has(tag);
}

function levelForCount(count) {
  let level = 0;
  for (const l of LEVELS) if (count >= l.min) level = l.level;
  return level;
}

function levelName(level) {
  const hit = LEVELS.find((l) => l.level === level);
  return hit ? hit.name : "Chưa bắt";
}

function emptyCard(tag) {
  return { tag, label: tagLabel(tag), count: 0, level: 0, levelName: levelName(0), firstCaughtAt: null, lastCaughtAt: null, evidence: [], tamed: false };
}

/**
 * One sighting of a species. Returns { card, isNew, leveledUp } — `isNew` is
 * true exactly once, on first capture (the moment worth celebrating loudest).
 * Unknown/non-species tags (including "khac") are rejected — call sites must
 * check `isSpecies` first; this never silently mints a fake entry.
 */
function mintOrLevelUp(existingCard, { tag, evidence, seenAt }) {
  if (!isSpecies(tag)) {
    throw new Error(`bestiary: "${tag}" is not a catchable species (khac is excluded by design)`);
  }
  const base = existingCard && existingCard.tag === tag ? existingCard : emptyCard(tag);
  const count = base.count + 1;
  const level = levelForCount(count);
  const evidenceList = [...(Array.isArray(base.evidence) ? base.evidence : []), evidence].filter(Boolean).slice(-EVIDENCE_CAP);
  const card = {
    ...base,
    tag, label: tagLabel(tag), count, level, levelName: levelName(level),
    firstCaughtAt: base.firstCaughtAt || seenAt || null,
    lastCaughtAt: seenAt || base.lastCaughtAt || null,
    evidence: evidenceList,
  };
  return { card, isNew: base.count === 0, leveledUp: level > (base.level || 0) };
}

/** How much of the finite bestiary has been caught — the completionism hook. */
function collectionSummary(cards) {
  const map = cards && typeof cards === "object" ? cards : {};
  const caught = SPECIES.filter((s) => map[s.tag] && map[s.tag].count > 0);
  const missing = SPECIES.filter((s) => !map[s.tag] || !map[s.tag].count).map((s) => s.tag);
  return { total: SPECIES.length, caughtCount: caught.length, missing, complete: caught.length === SPECIES.length };
}

/**
 * Specimen unification: a caught card ages off the SAME [3,7,21,60] clock as
 * reviewQueue.js's problem reviews (shared reviewQueue.dueStatus — one due-
 * date engine, not two that can drift). Clock starts at firstCaughtAt and
 * resets on every training rep (cardStore.applyTraining stamps lastTrainedAt).
 */
function dueForTraining(card, now = Date.now()) {
  const lastEventAt = card.lastTrainedAt || card.firstCaughtAt;
  return dueStatus({ lastEventAt, eventCount: card.trainCount, now });
}

module.exports = { SPECIES, isSpecies, levelForCount, levelName, emptyCard, mintOrLevelUp, collectionSummary, dueForTraining };
