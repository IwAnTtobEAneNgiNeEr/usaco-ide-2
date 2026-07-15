"use strict";

// Tests for arena/season.js (S11) — pure season rollover logic. No fs.

const test = require("node:test");
const assert = require("node:assert/strict");
const season = require("../src/arena/season");

const JAN_15 = Date.UTC(2026, 0, 15);
const FEB_1 = Date.UTC(2026, 1, 1);
const FEB_20 = Date.UTC(2026, 1, 20);

test("currentSeasonId: one id per calendar month, UTC-based", () => {
  assert.equal(season.currentSeasonId(JAN_15), "2026-01");
  assert.equal(season.currentSeasonId(FEB_1), "2026-02");
  assert.equal(season.currentSeasonId(FEB_20), "2026-02");
});

test("shouldRollover: true when there is no current season yet", () => {
  assert.equal(season.shouldRollover(null, JAN_15), true);
});

test("shouldRollover: false within the same month, true once the month changes", () => {
  const current = season.emptySeason(JAN_15, 1000);
  assert.equal(season.shouldRollover(current, JAN_15 + 86400000), false);
  assert.equal(season.shouldRollover(current, FEB_1), true);
});

test("noteRatingUpdate: tracks the running season-best (only ever goes up)", () => {
  let current = season.emptySeason(JAN_15, 1000);
  current = season.noteRatingUpdate(current, 1050, JAN_15 + 1000);
  assert.equal(current.seasonBestRating, 1050);
  current = season.noteRatingUpdate(current, 1020, JAN_15 + 2000); // a dip afterward
  assert.equal(current.seasonBestRating, 1050, "best-of is a high-water mark, never lowered by a later dip");
});

test("noteRatingUpdate: silently starts a fresh season if called after the month already changed", () => {
  const current = season.emptySeason(JAN_15, 1000);
  const next = season.noteRatingUpdate(current, 1200, FEB_1);
  assert.equal(next.seasonId, "2026-02");
  assert.equal(next.ratingAtStart, 1200);
});

test("rollover: archives the outgoing season, rating carries over (never reset)", () => {
  let current = season.emptySeason(JAN_15, 1000);
  current = season.noteRatingUpdate(current, 1300, JAN_15 + 1000);
  const state = { current, history: [] };
  const rolled = season.rollover(state, { now: FEB_1, rating: 1250 });

  assert.equal(rolled.history.length, 1);
  assert.equal(rolled.history[0].seasonId, "2026-01");
  assert.equal(rolled.history[0].bestRating, 1300);
  assert.equal(rolled.history[0].ratingAtEnd, 1250);

  assert.equal(rolled.current.seasonId, "2026-02");
  assert.equal(rolled.current.ratingAtStart, 1250, "rating carries over unchanged into the new season");
  assert.equal(rolled.current.seasonBestRating, 1250);
});

test("rollover: with no prior season, nothing is archived — just starts fresh", () => {
  const rolled = season.rollover({ current: null, history: [] }, { now: JAN_15, rating: 1000 });
  assert.equal(rolled.history.length, 0);
  assert.equal(rolled.current.seasonId, "2026-01");
});

test("rollover: archived history accumulates across multiple months, newest first", () => {
  let state = { current: null, history: [] };
  let rolled = season.rollover(state, { now: JAN_15, rating: 1000 });
  rolled = season.rollover(rolled, { now: FEB_1, rating: 1100 });
  rolled = season.rollover(rolled, { now: Date.UTC(2026, 2, 1), rating: 1200 });
  assert.equal(rolled.history.length, 2);
  assert.equal(rolled.history[0].seasonId, "2026-02"); // most recently archived first
  assert.equal(rolled.history[1].seasonId, "2026-01");
});
