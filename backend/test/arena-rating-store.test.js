"use strict";

// Tests for arena/ratingStore.js — real fs read/write against a throwaway tmp
// file (never the real data/arena-rating.json), same convention as
// student-model.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const ratingStore = require("../src/arena/ratingStore");
const rating = require("../src/arena/rating");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-rating-"));
  return path.join(dir, "arena-rating.json");
}

test("load returns a fresh v1 skeleton when no file exists yet", async () => {
  const file = await tmpFile();
  const state = await ratingStore.load(file);
  assert.equal(state.version, 1);
  assert.equal(state.rating, rating.DEFAULT_RATING);
  assert.equal(state.gamesPlayed, 0);
  assert.equal(state.seeded, false);
  assert.deepEqual(state.history, []);
});

test("ensureSeeded with an empty entries list marks seeded but leaves rating at default", async () => {
  const file = await tmpFile();
  const state = await ratingStore.ensureSeeded(file, []);
  assert.equal(state.seeded, true);
  assert.equal(state.rating, rating.DEFAULT_RATING);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].kind, "seed");
});

test("ensureSeeded is idempotent — a second call with different entries does NOT reseed", async () => {
  const file = await tmpFile();
  await ratingStore.ensureSeeded(file, []);
  const again = await ratingStore.ensureSeeded(file, [
    { problemRating: 2000, verdict: "AC", waBeforeAc: 0, at: "2026-01-01" },
  ]);
  assert.equal(again.rating, rating.DEFAULT_RATING, "already seeded — must not reseed from new entries");
  assert.equal(again.history.length, 1);
});

test("applyAndSave persists a real rating change and an evidence entry", async () => {
  const file = await tmpFile();
  const { state, entry } = await ratingStore.applyAndSave(file, {
    problemId: "sum-two", problemRating: 1300, verdict: "AC", waBeforeAc: 0, at: "2026-07-06T10:00:00.000Z",
  });
  assert.ok(entry.delta > 0);
  assert.equal(entry.ratingBefore, rating.DEFAULT_RATING);
  assert.equal(entry.ratingAfter, state.rating);
  assert.equal(entry.problemId, "sum-two");
  assert.equal(entry.refunded, false);

  const reloaded = await ratingStore.load(file);
  assert.equal(reloaded.rating, state.rating);
  assert.equal(reloaded.gamesPlayed, 1);
  assert.equal(reloaded.history[0].id, entry.id);
});

test("applyAndSave chains correctly across multiple calls (gamesPlayed accumulates, K decays)", async () => {
  const file = await tmpFile();
  let last;
  for (let i = 0; i < 5; i++) {
    last = await ratingStore.applyAndSave(file, { problemId: `p${i}`, problemRating: 1200, verdict: "AC", waBeforeAc: 0 });
  }
  const state = await ratingStore.load(file);
  assert.equal(state.gamesPlayed, 5);
  assert.equal(state.history.length, 5);
  assert.equal(state.rating, last.state.rating);
});

test("applyAndSave caps history at 300 entries, newest first", async () => {
  const file = await tmpFile();
  for (let i = 0; i < 305; i++) {
    await ratingStore.applyAndSave(file, { problemId: `p${i}`, problemRating: 1000, verdict: "AC", waBeforeAc: 0 });
  }
  const state = await ratingStore.load(file);
  assert.equal(state.history.length, 300);
  assert.equal(state.history[0].problemId, "p304"); // most recent kept
});

test("refund reverses a specific entry's delta exactly once, never twice", async () => {
  const file = await tmpFile();
  const { entry } = await ratingStore.applyAndSave(file, { problemId: "p1", problemRating: 1400, verdict: "AC", waBeforeAc: 0 });
  const ratingAfterWin = (await ratingStore.load(file)).rating;
  assert.equal(ratingAfterWin, rating.DEFAULT_RATING + entry.delta);

  const first = await ratingStore.refund(file, entry.id);
  assert.equal(first.ok, true);
  const afterRefund = await ratingStore.load(file);
  assert.equal(afterRefund.rating, rating.DEFAULT_RATING);
  assert.equal(afterRefund.history[0].refunded, true);
  assert.equal(afterRefund.gamesPlayed, 1, "gamesPlayed is NOT rewound — the attempt genuinely happened");

  const second = await ratingStore.refund(file, entry.id);
  assert.equal(second.ok, false, "refunding twice must be rejected");
});

test("refund on an unknown id is rejected cleanly", async () => {
  const file = await tmpFile();
  await ratingStore.applyAndSave(file, { problemId: "p1", problemRating: 1000, verdict: "AC", waBeforeAc: 0 });
  const result = await ratingStore.refund(file, "does-not-exist");
  assert.equal(result.ok, false);
});

test("two different files never contend or leak state into each other", async () => {
  const fileA = await tmpFile();
  const fileB = await tmpFile();
  await Promise.all([
    ratingStore.applyAndSave(fileA, { problemId: "a", problemRating: 1000, verdict: "AC", waBeforeAc: 0 }),
    ratingStore.applyAndSave(fileB, { problemId: "b", problemRating: 2000, verdict: "AC", waBeforeAc: 0 }),
  ]);
  const [a, b] = await Promise.all([ratingStore.load(fileA), ratingStore.load(fileB)]);
  assert.equal(a.history[0].problemId, "a");
  assert.equal(b.history[0].problemId, "b");
  assert.notEqual(a.rating, b.rating);
});
