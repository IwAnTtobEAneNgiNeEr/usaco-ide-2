"use strict";

// Tests for arena/bestiary.js (S5) — pure card mint/level logic. No fs.

const test = require("node:test");
const assert = require("node:assert/strict");
const bestiary = require("../src/arena/bestiary");
const { TAXONOMY } = require("../src/moment/diagnose");

test("SPECIES is the full taxonomy MINUS 'khac' — exactly 10 catchable species", () => {
  assert.equal(bestiary.SPECIES.length, TAXONOMY.length - 1);
  assert.ok(!bestiary.SPECIES.some((s) => s.tag === "khac"));
  assert.equal(bestiary.isSpecies("khac"), false);
  assert.equal(bestiary.isSpecies("bien-tran"), true);
  assert.equal(bestiary.isSpecies("not-a-real-tag"), false);
});

test("mintOrLevelUp rejects non-species tags instead of silently minting garbage", () => {
  assert.throws(() => bestiary.mintOrLevelUp(null, { tag: "khac", evidence: "e", seenAt: "t" }));
  assert.throws(() => bestiary.mintOrLevelUp(null, { tag: "made-up", evidence: "e", seenAt: "t" }));
});

test("first sighting mints a NEW card at level 1, count 1", () => {
  const { card, isNew, leveledUp } = bestiary.mintOrLevelUp(null, { tag: "off-by-one", evidence: "ev1", seenAt: "2026-01-01" });
  assert.equal(card.tag, "off-by-one");
  assert.equal(card.count, 1);
  assert.equal(card.level, 1);
  assert.equal(isNew, true);
  assert.equal(leveledUp, true); // 0 -> 1 counts as a level-up on first catch
  assert.deepEqual(card.evidence, ["ev1"]);
  assert.equal(card.firstCaughtAt, "2026-01-01");
});

test("repeat sightings accumulate count without re-flagging isNew", () => {
  let result = bestiary.mintOrLevelUp(null, { tag: "off-by-one", evidence: "ev1", seenAt: "d1" });
  result = bestiary.mintOrLevelUp(result.card, { tag: "off-by-one", evidence: "ev2", seenAt: "d2" });
  assert.equal(result.isNew, false);
  assert.equal(result.card.count, 2);
  assert.deepEqual(result.card.evidence, ["ev1", "ev2"]);
  assert.equal(result.card.lastCaughtAt, "d2");
  assert.equal(result.card.firstCaughtAt, "d1"); // never overwritten
});

test("level rises exactly at the documented thresholds (1,3,6,10), never skips levels going forward one sighting at a time", () => {
  let card = null;
  const levelsSeen = [];
  for (let i = 0; i < 12; i++) {
    const result = bestiary.mintOrLevelUp(card, { tag: "canh-bien", evidence: `e${i}`, seenAt: `d${i}` });
    card = result.card;
    levelsSeen.push(card.level);
  }
  // count: 1..12 -> levels: 1,1,2,2,2,3,3,3,3,4,4,4
  assert.deepEqual(levelsSeen, [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4]);
});

test("leveledUp is only true on the sighting that CROSSES a threshold", () => {
  let card = null;
  const flags = [];
  for (let i = 0; i < 4; i++) {
    const result = bestiary.mintOrLevelUp(card, { tag: "sai-cong-thuc", evidence: `e${i}`, seenAt: `d${i}` });
    card = result.card;
    flags.push(result.leveledUp);
  }
  // count 1 (lvl1, up), 2 (lvl1, no), 3 (lvl2, up), 4 (lvl2, no)
  assert.deepEqual(flags, [true, false, true, false]);
});

test("evidence list is capped at 5, keeping the most recent", () => {
  let card = null;
  for (let i = 0; i < 8; i++) {
    card = bestiary.mintOrLevelUp(card, { tag: "tran-mang", evidence: `e${i}`, seenAt: `d${i}` }).card;
  }
  assert.equal(card.evidence.length, 5);
  assert.deepEqual(card.evidence, ["e3", "e4", "e5", "e6", "e7"]);
});

test("collectionSummary: empty collection reports 0 caught, all species missing", () => {
  const s = bestiary.collectionSummary({});
  assert.equal(s.total, bestiary.SPECIES.length);
  assert.equal(s.caughtCount, 0);
  assert.equal(s.missing.length, s.total);
  assert.equal(s.complete, false);
});

test("collectionSummary: catching every species reports complete", () => {
  const cards = {};
  for (const s of bestiary.SPECIES) cards[s.tag] = bestiary.mintOrLevelUp(null, { tag: s.tag, evidence: "e", seenAt: "d" }).card;
  const summary = bestiary.collectionSummary(cards);
  assert.equal(summary.caughtCount, summary.total);
  assert.equal(summary.missing.length, 0);
  assert.equal(summary.complete, true);
});

test("collectionSummary ignores a zero-count entry as still-missing (defensive against a stray empty record)", () => {
  const cards = { "bien-tran": bestiary.emptyCard("bien-tran") }; // count 0
  const summary = bestiary.collectionSummary(cards);
  assert.equal(summary.caughtCount, 0);
  assert.ok(summary.missing.includes("bien-tran"));
});

// ---- dueForTraining — Specimen unification: cards age off the SAME
// [3,7,21,60] clock as reviewQueue.js's problem reviews (shared dueStatus). --

const MS_PER_DAY = 86400000;
const NOW = Date.parse("2026-07-07T12:00:00Z");
function daysAgo(n) { return new Date(NOW - n * MS_PER_DAY).toISOString(); }

test("dueForTraining: a freshly-caught, never-trained card is not due before 3 days", () => {
  const card = { ...bestiary.emptyCard("bien-tran"), count: 1, firstCaughtAt: daysAgo(1), lastTrainedAt: null, trainCount: 0 };
  assert.equal(bestiary.dueForTraining(card, NOW).due, false);
});

test("dueForTraining: due once 3 days have passed since firstCaughtAt with zero trains", () => {
  const card = { ...bestiary.emptyCard("bien-tran"), count: 1, firstCaughtAt: daysAgo(3), lastTrainedAt: null, trainCount: 0 };
  assert.equal(bestiary.dueForTraining(card, NOW).due, true);
});

test("dueForTraining: clock resets from lastTrainedAt, and the interval advances with trainCount", () => {
  const recentlyTrained = { ...bestiary.emptyCard("bien-tran"), count: 5, firstCaughtAt: daysAgo(100), lastTrainedAt: daysAgo(1), trainCount: 1 };
  assert.equal(bestiary.dueForTraining(recentlyTrained, NOW).due, false); // interval is now 7 days, only 1 has passed

  const overdue = { ...bestiary.emptyCard("bien-tran"), count: 5, firstCaughtAt: daysAgo(100), lastTrainedAt: daysAgo(8), trainCount: 1 };
  assert.equal(bestiary.dueForTraining(overdue, NOW).due, true);
});
