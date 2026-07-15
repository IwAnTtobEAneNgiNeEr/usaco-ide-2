"use strict";

// Tests for arena/rating.js (S3/S4) — pure Elo math. No fs, no fixtures beyond
// plain numbers, same convention as session-analyze.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const rating = require("../src/arena/rating");

test("expectedScore: equal ratings → 0.5", () => {
  assert.ok(Math.abs(rating.expectedScore(1000, 1000) - 0.5) < 1e-9);
});

test("expectedScore: much stronger opponent → expected win chance near 0", () => {
  assert.ok(rating.expectedScore(1000, 2000) < 0.05);
});

test("performanceScore: clean AC (no WA) is a full win", () => {
  assert.equal(rating.performanceScore({ verdict: "AC", waBeforeAc: 0 }), 1);
});

test("performanceScore: comeback AC decays but floors at 0.7, never lower", () => {
  assert.ok(rating.performanceScore({ verdict: "AC", waBeforeAc: 2 }) < 1);
  assert.equal(rating.performanceScore({ verdict: "AC", waBeforeAc: 100 }), rating.PERFORMANCE_FLOOR);
});

test("performanceScore: surrender is always 0, regardless of waBeforeAc", () => {
  assert.equal(rating.performanceScore({ verdict: "surrender", waBeforeAc: 0 }), 0);
  assert.equal(rating.performanceScore({ verdict: "surrender", waBeforeAc: 5 }), 0);
});

test("bandAfter: starts wide, narrows monotonically, floors at BAND_MIN", () => {
  assert.equal(rating.bandAfter(0), rating.BAND_START);
  const mid = rating.bandAfter(Math.floor(rating.PROVISIONAL_GAMES / 2));
  assert.ok(mid < rating.BAND_START && mid > rating.BAND_MIN);
  assert.equal(rating.bandAfter(rating.PROVISIONAL_GAMES), rating.BAND_MIN);
  assert.equal(rating.bandAfter(rating.PROVISIONAL_GAMES * 5), rating.BAND_MIN); // never narrower than the floor
});

test("kFactorFor: provisional K is bigger than established K, switches exactly at the threshold", () => {
  assert.ok(rating.kFactorFor(0) > rating.kFactorFor(rating.PROVISIONAL_GAMES));
  assert.equal(rating.kFactorFor(rating.PROVISIONAL_GAMES - 1), rating.kFactorFor(0));
  assert.equal(rating.kFactorFor(rating.PROVISIONAL_GAMES), rating.kFactorFor(rating.PROVISIONAL_GAMES + 100));
});

test("applyResult: beating a much harder problem cleanly gains rating", () => {
  const r = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 1400, verdict: "AC", waBeforeAc: 0 });
  assert.ok(r.delta > 0);
  assert.equal(r.ratingAfter, r.ratingBefore + r.delta);
  assert.equal(r.gamesPlayed, 1);
});

test("applyResult: winning a much easier problem gains little (expected score already near 1)", () => {
  const hard = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 1400, verdict: "AC", waBeforeAc: 0 });
  const easy = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 600, verdict: "AC", waBeforeAc: 0 });
  assert.ok(easy.delta < hard.delta);
});

test("applyResult: surrendering a rated match ALWAYS loses rating (expected score is always > 0)", () => {
  const r = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 1000, verdict: "surrender" });
  assert.ok(r.delta < 0);
});

test("applyResult: rating never goes negative", () => {
  const r = rating.applyResult({ rating: 5, gamesPlayed: 0, problemRating: 3000, verdict: "surrender" });
  assert.ok(r.ratingAfter >= 0);
});

test("applyResult: a comeback AC (waBeforeAc>0) is worth strictly less than a clean AC against the same opponent", () => {
  const clean = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 1200, verdict: "AC", waBeforeAc: 0 });
  const comeback = rating.applyResult({ rating: 1000, gamesPlayed: 0, problemRating: 1200, verdict: "AC", waBeforeAc: 4 });
  assert.ok(comeback.delta <= clean.delta);
});

test("seedFromHistory: empty history → default rating, zero games, wide band", () => {
  const seeded = rating.seedFromHistory([]);
  assert.equal(seeded.rating, rating.DEFAULT_RATING);
  assert.equal(seeded.gamesPlayed, 0);
  assert.equal(seeded.band, rating.BAND_START);
});

test("seedFromHistory: folds chronologically, matches manual applyResult chaining", () => {
  const entries = [
    { problemRating: 1200, verdict: "AC", waBeforeAc: 0, at: "2026-01-01" },
    { problemRating: 1400, verdict: "AC", waBeforeAc: 2, at: "2026-01-02" },
    { problemRating: 1000, verdict: "surrender", waBeforeAc: 0, at: "2026-01-03" },
  ];
  const seeded = rating.seedFromHistory(entries);

  let r = rating.DEFAULT_RATING, g = 0;
  for (const e of entries) {
    const step = rating.applyResult({ rating: r, gamesPlayed: g, problemRating: e.problemRating, verdict: e.verdict, waBeforeAc: e.waBeforeAc });
    r = step.ratingAfter; g = step.gamesPlayed;
  }
  assert.equal(seeded.rating, r);
  assert.equal(seeded.gamesPlayed, g);
  assert.equal(seeded.log.length, 3);
});

test("stakesPreview: win is a gain, lose is a loss, for the same candidate problem", () => {
  const s = rating.stakesPreview({ rating: 1000, gamesPlayed: 10, problemRating: 1100 });
  assert.ok(s.win > 0);
  assert.ok(s.lose < 0);
  assert.ok(s.expected > 0 && s.expected < 1);
});

test("riskLabelFor: classifies safe/standard/upset by the gap to the player's rating", () => {
  assert.equal(rating.riskLabelFor(1000, 850), "safe");
  assert.equal(rating.riskLabelFor(1000, 1000), "standard");
  assert.equal(rating.riskLabelFor(1000, 1150), "upset");
});

test("tierOf / nextTierGap: monotone thresholds, gap shrinks as rating approaches the next tier", () => {
  assert.equal(rating.tierOf(0).id, "newbie");
  assert.equal(rating.tierOf(1200).id, "pupil");
  assert.equal(rating.tierOf(9999).id, "legendary");
  const gapFar = rating.nextTierGap(1000);
  const gapNear = rating.nextTierGap(1190);
  assert.ok(gapNear < gapFar);
  assert.equal(rating.nextTierGap(999999), 0); // already top tier
});
