"use strict";

// Tests for arena/weekly.js (S9) — pure ICPC-style cutoff/standing math.

const test = require("node:test");
const assert = require("node:assert/strict");
const weekly = require("../src/arena/weekly");

test("computeCutoffStatus: open before cutoff, closed at/after it", () => {
  const session = { cutoffAt: 10000, closedAt: null };
  assert.equal(weekly.computeCutoffStatus(session, 5000).open, true);
  assert.equal(weekly.computeCutoffStatus(session, 10000).open, false);
  assert.equal(weekly.computeCutoffStatus(session, 15000).closed, true);
});

test("computeCutoffStatus: a session force-closed before cutoff reports closed regardless of time", () => {
  const session = { cutoffAt: 10000, closedAt: 3000 };
  assert.equal(weekly.computeCutoffStatus(session, 1000).open, false);
});

test("computeCutoffStatus: remainingMs never goes negative", () => {
  const session = { cutoffAt: 1000, closedAt: null };
  assert.equal(weekly.computeCutoffStatus(session, 5000).remainingMs, 0);
});

test("computeStanding: unsolved problem contributes zero penalty and isn't counted solved", () => {
  const standing = weekly.computeStanding({ problemIds: ["p1"], submissions: [{ problemId: "p1", verdict: "WA", at: 1000 }], startedAt: 0 });
  assert.equal(standing.solvedCount, 0);
  assert.equal(standing.penaltyMin, 0);
  assert.equal(standing.perProblem.p1.solved, false);
  assert.equal(standing.perProblem.p1.wrongCount, 1);
});

test("computeStanding: clean first-try AC costs only the solve-time minutes", () => {
  const standing = weekly.computeStanding({
    problemIds: ["p1"], submissions: [{ problemId: "p1", verdict: "AC", at: 5 * 60000 }], startedAt: 0,
  });
  assert.equal(standing.solvedCount, 1);
  assert.equal(standing.penaltyMin, 5);
  assert.equal(standing.perProblem.p1.wrongCount, 0);
});

test("computeStanding: each WA before the AC adds the standard ICPC penalty", () => {
  const standing = weekly.computeStanding({
    problemIds: ["p1"],
    submissions: [
      { problemId: "p1", verdict: "WA", at: 1 * 60000 },
      { problemId: "p1", verdict: "WA", at: 2 * 60000 },
      { problemId: "p1", verdict: "AC", at: 10 * 60000 },
    ],
    startedAt: 0,
  });
  assert.equal(standing.perProblem.p1.wrongCount, 2);
  assert.equal(standing.penaltyMin, 10 + 2 * weekly.PENALTY_PER_WRONG_MIN);
});

test("computeStanding: a submission AFTER the AC never re-counts (only submissions up to the first AC matter)", () => {
  const standing = weekly.computeStanding({
    problemIds: ["p1"],
    submissions: [
      { problemId: "p1", verdict: "AC", at: 5 * 60000 },
      { problemId: "p1", verdict: "WA", at: 8 * 60000 }, // re-submit after already solved — ignored
    ],
    startedAt: 0,
  });
  assert.equal(standing.perProblem.p1.wrongCount, 0);
  assert.equal(standing.penaltyMin, 5);
});

test("computeStanding: multi-problem totals sum correctly, unsubmitted problems included as unsolved", () => {
  const standing = weekly.computeStanding({
    problemIds: ["a", "b", "c"],
    submissions: [
      { problemId: "a", verdict: "AC", at: 2 * 60000 },
      { problemId: "b", verdict: "WA", at: 1 * 60000 },
      { problemId: "b", verdict: "AC", at: 4 * 60000 },
      // "c" never submitted
    ],
    startedAt: 0,
  });
  assert.equal(standing.solvedCount, 2);
  assert.equal(standing.penaltyMin, 2 + (4 + weekly.PENALTY_PER_WRONG_MIN));
  assert.equal(standing.perProblem.c.solved, false);
});
