"use strict";

// Tests for arena/ghost.js (S8) — pure pace-comparison math over recorder-
// shaped event fixtures. No fs.

const test = require("node:test");
const assert = require("node:assert/strict");
const ghost = require("../src/arena/ghost");

function ev(t, type, data) { return { t, type, data }; }

test("solveDurationMs: start-to-AC gap on a clean timeline", () => {
  const events = [
    ev(1000, "open-statement", {}),
    ev(2000, "run", { verdict: "WA" }),
    ev(2500, "verdict", { verdict: "WA" }),
    ev(4000, "verdict", { verdict: "AC" }),
  ];
  assert.equal(ghost.solveDurationMs(events), 4000 - 1000);
});

test("solveDurationMs: never AC'd → null, not a fake number", () => {
  const events = [ev(1000, "open-statement", {}), ev(2000, "verdict", { verdict: "WA" })];
  assert.equal(ghost.solveDurationMs(events), null);
});

test("solveDurationMs: empty timeline → null", () => {
  assert.equal(ghost.solveDurationMs([]), null);
});

test("solveDurationMs: stops at the FIRST AC even if events are unsorted", () => {
  const events = [
    ev(5000, "verdict", { verdict: "AC" }),
    ev(1000, "open-statement", {}),
    ev(3000, "verdict", { verdict: "AC" }), // a second AC (e.g. re-solve) — must not be picked
  ];
  assert.equal(ghost.solveDurationMs(events), 3000 - 1000);
});

test("buildGhostBaseline: fewer than MIN_SAMPLES is honestly reported as unavailable", () => {
  const b = ghost.buildGhostBaseline([1000, 2000]);
  assert.equal(b.available, false);
  assert.equal(b.medianMs, null);
  assert.equal(b.sampleCount, 2);
});

test("buildGhostBaseline: enough samples → a real median, ignoring non-finite junk", () => {
  const b = ghost.buildGhostBaseline([1000, 2000, 3000, NaN, -5, 0]);
  assert.equal(b.available, true);
  assert.equal(b.sampleCount, 3);
  assert.equal(b.medianMs, 2000);
});

test("currentElapsedMs: measures from the start of the LATEST session, not the whole history", () => {
  const events = [
    ev(0, "open-statement", {}),
    ev(1000, "verdict", { verdict: "WA" }),
    // a big idle gap here splits into a new session
    ev(1000 + 3 * 60 * 60 * 1000, "open-statement", {}),
  ];
  const now = 1000 + 3 * 60 * 60 * 1000 + 5000;
  assert.equal(ghost.currentElapsedMs(events, now), 5000);
});

test("currentElapsedMs: empty timeline → null", () => {
  assert.equal(ghost.currentElapsedMs([], Date.now()), null);
});

test("compareToGhost: faster than the ghost when elapsed < median", () => {
  const baseline = ghost.buildGhostBaseline([10000, 10000, 10000]);
  const c = ghost.compareToGhost(5000, baseline);
  assert.equal(c.available, true);
  assert.equal(c.faster, true);
  assert.equal(c.ratio, 2);
});

test("compareToGhost: slower than the ghost when elapsed > median", () => {
  const baseline = ghost.buildGhostBaseline([1000, 1000, 1000]);
  const c = ghost.compareToGhost(4000, baseline);
  assert.equal(c.faster, false);
  assert.equal(c.ratio, 0.25);
});

test("compareToGhost: unavailable baseline or bad elapsed never fabricates a ratio", () => {
  assert.equal(ghost.compareToGhost(5000, { available: false }).available, false);
  const baseline = ghost.buildGhostBaseline([1000, 1000, 1000]);
  assert.equal(ghost.compareToGhost(0, baseline).available, false);
  assert.equal(ghost.compareToGhost(null, baseline).available, false);
});
