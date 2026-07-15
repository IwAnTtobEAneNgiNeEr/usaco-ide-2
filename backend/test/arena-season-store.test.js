"use strict";

// Tests for arena/seasonStore.js — real fs read/write against a throwaway tmp
// file (never data/arena-season.json), same convention as arena-rating-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const seasonStore = require("../src/arena/seasonStore");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-season-"));
  return path.join(dir, "arena-season.json");
}

test("load returns an empty skeleton (no current season) when no file exists yet", async () => {
  const file = await tmpFile();
  const state = await seasonStore.load(file);
  assert.equal(state.current, null);
  assert.deepEqual(state.history, []);
});

test("ensureCurrentSeason starts a season on first call", async () => {
  const file = await tmpFile();
  const now = Date.UTC(2026, 0, 15);
  const state = await seasonStore.ensureCurrentSeason(file, 1000, now);
  assert.equal(state.current.seasonId, "2026-01");
  assert.equal(state.current.ratingAtStart, 1000);
});

test("ensureCurrentSeason within the same month just updates the season-best, no rollover", async () => {
  const file = await tmpFile();
  await seasonStore.ensureCurrentSeason(file, 1000, Date.UTC(2026, 0, 15));
  const state = await seasonStore.ensureCurrentSeason(file, 1200, Date.UTC(2026, 0, 20));
  assert.equal(state.current.seasonId, "2026-01");
  assert.equal(state.current.seasonBestRating, 1200);
  assert.equal(state.history.length, 0);
});

test("ensureCurrentSeason across a month boundary rolls over and archives history", async () => {
  const file = await tmpFile();
  await seasonStore.ensureCurrentSeason(file, 1000, Date.UTC(2026, 0, 15));
  await seasonStore.ensureCurrentSeason(file, 1300, Date.UTC(2026, 0, 25));
  const state = await seasonStore.ensureCurrentSeason(file, 1250, Date.UTC(2026, 1, 2));

  assert.equal(state.current.seasonId, "2026-02");
  assert.equal(state.current.ratingAtStart, 1250);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].seasonId, "2026-01");
  assert.equal(state.history[0].bestRating, 1300);
});

test("ensureCurrentSeason persists correctly — reloading the file matches the last call's result", async () => {
  const file = await tmpFile();
  await seasonStore.ensureCurrentSeason(file, 900, Date.UTC(2026, 0, 1));
  const reloaded = await seasonStore.load(file);
  assert.equal(reloaded.current.ratingAtStart, 900);
});
