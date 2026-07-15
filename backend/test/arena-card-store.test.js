"use strict";

// Tests for arena/cardStore.js — real fs read/write against a throwaway tmp
// file (never data/arena-cards.json), same convention as
// arena-rating-store.test.js/student-model.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const cardStore = require("../src/arena/cardStore");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-cards-"));
  return path.join(dir, "arena-cards.json");
}

test("load returns an empty collection when no file exists yet", async () => {
  const file = await tmpFile();
  const state = await cardStore.load(file);
  assert.deepEqual(state.cards, {});
});

test("mint on a non-species tag is a documented no-op (never throws, never writes)", async () => {
  const file = await tmpFile();
  const result = await cardStore.mint(file, "khac", { evidence: "e", seenAt: "d" });
  assert.equal(result.minted, false);
  assert.deepEqual((await cardStore.load(file)).cards, {});
});

test("mint persists a real card and is readable back", async () => {
  const file = await tmpFile();
  const result = await cardStore.mint(file, "bien-tran", { evidence: "problems/x/moment/1.json", seenAt: "2026-07-06" });
  assert.equal(result.minted, true);
  assert.equal(result.isNew, true);
  assert.equal(result.card.count, 1);

  const reloaded = await cardStore.load(file);
  assert.equal(reloaded.cards["bien-tran"].count, 1);
  assert.deepEqual(reloaded.cards["bien-tran"].evidence, ["problems/x/moment/1.json"]);
});

test("mint accumulates across calls on the same file", async () => {
  const file = await tmpFile();
  await cardStore.mint(file, "off-by-one", { evidence: "e1", seenAt: "d1" });
  await cardStore.mint(file, "off-by-one", { evidence: "e2", seenAt: "d2" });
  const state = await cardStore.load(file);
  assert.equal(state.cards["off-by-one"].count, 2);
});

test("applyTraining fails cleanly on an uncaught species", async () => {
  const file = await tmpFile();
  const result = await cardStore.applyTraining(file, "bien-tran", { correct: true });
  assert.equal(result.trained, false);
});

// Each rep below lands on a DIFFERENT calendar day — real spaced practice,
// the same discipline Chân Phẩm's Ấn tier already requires (reviewCount>=3
// across the 21-day checkpoint, not 3 clicks in one sitting). Taming a card
// is deliberately capped at one counted rep per day (see applyTraining's
// header): without that gate, the Flash Quiz UI lets a student see the
// revealed correct tag, hit "Làm lại", and re-answer the SAME question —
// 3 correct answers in under a minute, tamed, never actually retained.
const DAY1 = "2026-07-01T00:00:00.000Z";
const DAY2 = "2026-07-02T00:00:00.000Z";
const DAY3 = "2026-07-03T00:00:00.000Z";
const DAY4 = "2026-07-04T00:00:00.000Z";

test("applyTraining: 3 correct answers on 3 separate days tames the card; tamedJustNow fires exactly once", async () => {
  const file = await tmpFile();
  await cardStore.mint(file, "bien-tran", { evidence: "e", seenAt: "d" });
  let r;
  r = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 });
  assert.equal(r.card.tamed, false);
  assert.equal(r.tamedJustNow, false);
  r = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY2 });
  assert.equal(r.card.tamed, false);
  r = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY3 });
  assert.equal(r.card.tamed, true);
  assert.equal(r.tamedJustNow, true);

  // A 4th correct answer (another new day) keeps it tamed but must not re-fire tamedJustNow.
  r = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY4 });
  assert.equal(r.card.tamed, true);
  assert.equal(r.tamedJustNow, false);
});

test("applyTraining: a wrong answer resets the streak and un-tames an already-tamed card ('escaped')", async () => {
  const file = await tmpFile();
  await cardStore.mint(file, "bien-tran", { evidence: "e", seenAt: "d" });
  await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 });
  await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY2 });
  await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY3 });
  assert.equal((await cardStore.load(file)).cards["bien-tran"].tamed, true);

  const r = await cardStore.applyTraining(file, "bien-tran", { correct: false, now: DAY4 });
  assert.equal(r.card.tamed, false);
  assert.equal(r.escaped, true);
  assert.equal(r.card.trainingStreak, 0);
});

test("applyTraining: a same-day repeat is a harmless no-op — no streak/tame/trainCount movement (anti-farm)", async () => {
  const file = await tmpFile();
  await cardStore.mint(file, "bien-tran", { evidence: "e", seenAt: "d" });
  const r1 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 });
  assert.equal(r1.trained, true);
  assert.equal(r1.card.trainingStreak, 1);

  // Same tag, same day, however many times, however "correct" — no movement.
  const r2 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 + "" });
  assert.equal(r2.trained, false);
  assert.equal(r2.reason, "already-trained-today");
  assert.equal(r2.card.trainingStreak, 1);

  const r3 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 });
  const r4 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY1 });
  assert.equal(r3.trained, false);
  assert.equal(r4.trained, false);
  assert.equal((await cardStore.load(file)).cards["bien-tran"].trainCount, 1, "still just the one real rep");

  // The NEXT calendar day, training resumes normally.
  const r5 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: DAY2 });
  assert.equal(r5.trained, true);
  assert.equal(r5.card.trainingStreak, 2);
});

test("applyTraining stamps lastTrainedAt and increments trainCount (Specimen unification's due-clock)", async () => {
  const file = await tmpFile();
  await cardStore.mint(file, "bien-tran", { evidence: "e", seenAt: "d" });
  const r1 = await cardStore.applyTraining(file, "bien-tran", { correct: true, now: "2026-07-01T00:00:00.000Z" });
  assert.equal(r1.card.trainCount, 1);
  assert.equal(r1.card.lastTrainedAt, "2026-07-01T00:00:00.000Z");

  const r2 = await cardStore.applyTraining(file, "bien-tran", { correct: false, now: "2026-07-02T00:00:00.000Z" });
  assert.equal(r2.card.trainCount, 2, "trainCount rises on every rep, correct or not");
  assert.equal(r2.card.lastTrainedAt, "2026-07-02T00:00:00.000Z");
});
