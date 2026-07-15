"use strict";

// Tests for the extracted spaced-repetition core (was inline in
// routes/stats.js's /review-queue handler — pulled out to a pure module so
// the new planner (Flagship 3) can reuse the exact same due-date logic
// instead of re-deriving it and risking drift). Behavior is byte-for-byte
// identical to the original inline version.

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeReviewQueue, REVIEW_INTERVALS, dueStatus } = require("../src/reviewQueue");

const MS_PER_DAY = 86400000;
const NOW = Date.parse("2026-07-05T12:00:00Z");

function daysAgo(n) {
  return new Date(NOW - n * MS_PER_DAY).toISOString();
}

function meta(overrides = {}) {
  return { id: "p1", title: "P1", topic: "", tags: [], reviewCount: 0, lastReviewedAt: "", history: [], ...overrides };
}

test("REVIEW_INTERVALS matches the documented [3,7,21,60] schedule", () => {
  assert.deepEqual(REVIEW_INTERVALS, [3, 7, 21, 60]);
});

test("a problem never ACed is not due for review", () => {
  const due = computeReviewQueue([meta({ history: [{ at: daysAgo(10), verdict: "WA" }] })], { now: NOW });
  assert.equal(due.length, 0);
});

test("a problem with no history at all is skipped, not crashed on", () => {
  const due = computeReviewQueue([meta({ history: [] })], { now: NOW });
  assert.equal(due.length, 0);
});

test("first AC less than 3 days ago is not yet due", () => {
  const due = computeReviewQueue([meta({ history: [{ at: daysAgo(1), verdict: "AC" }] })], { now: NOW });
  assert.equal(due.length, 0);
});

test("first AC 3+ days ago with reviewCount=0 is due at the first interval", () => {
  const due = computeReviewQueue([meta({ id: "p2", history: [{ at: daysAgo(3), verdict: "AC" }] })], { now: NOW });
  assert.equal(due.length, 1);
  assert.equal(due[0].id, "p2");
  assert.equal(due[0].nextIntervalDays, 3);
  assert.equal(due[0].reviewCount, 0);
});

test("reviewCount advances the interval to 7, then 21, then 60 (capped)", () => {
  const case7 = computeReviewQueue([meta({ id: "a", reviewCount: 1, history: [{ at: daysAgo(8), verdict: "AC" }] })], { now: NOW });
  assert.equal(case7[0].nextIntervalDays, 7);
  const case21 = computeReviewQueue([meta({ id: "b", reviewCount: 2, history: [{ at: daysAgo(22), verdict: "AC" }] })], { now: NOW });
  assert.equal(case21[0].nextIntervalDays, 21);
  const case60 = computeReviewQueue([meta({ id: "c", reviewCount: 9, history: [{ at: daysAgo(61), verdict: "AC" }] })], { now: NOW });
  assert.equal(case60[0].nextIntervalDays, 60); // capped, not 9th interval
});

test("lastReviewedAt resets the clock instead of firstAcAt when present", () => {
  const due = computeReviewQueue([meta({
    id: "p3", reviewCount: 1, lastReviewedAt: daysAgo(2),
    history: [{ at: daysAgo(200), verdict: "AC" }],
  })], { now: NOW });
  assert.equal(due.length, 0); // reviewed 2 days ago, interval is 7 — not due yet
});

test("waBeforeAc counts only WA runs chronologically before the first AC", () => {
  // Oldest → newest: WA, WA, AC (the FIRST AC — 2 WA before it), AC (a later
  // re-submit that must NOT add to waBeforeAc). Stored newest-first, like problemStore.
  const due = computeReviewQueue([meta({
    id: "p4",
    history: [
      { at: daysAgo(3), verdict: "AC" },  // later re-submit
      { at: daysAgo(4), verdict: "AC" },  // first AC
      { at: daysAgo(5), verdict: "WA" },
      { at: daysAgo(6), verdict: "WA" },
    ],
  })], { now: NOW });
  assert.equal(due[0].waBeforeAc, 2);
});

test("sorted hardest-first (waBeforeAc desc), ties broken by staleness desc", () => {
  const metas = [
    meta({ id: "easy", history: [{ at: daysAgo(10), verdict: "AC" }] }), // 0 WA
    meta({ id: "hard", history: [{ at: daysAgo(10), verdict: "AC" }, { at: daysAgo(11), verdict: "WA" }, { at: daysAgo(12), verdict: "WA" }] }),
    meta({ id: "medium", history: [{ at: daysAgo(30), verdict: "AC" }, { at: daysAgo(31), verdict: "WA" }] }),
  ];
  const due = computeReviewQueue(metas, { now: NOW });
  assert.deepEqual(due.map((d) => d.id), ["hard", "medium", "easy"]);
});

test("returns the full due list unsliced — capping to top-N is the caller's job", () => {
  const metas = Array.from({ length: 12 }, (_, i) => meta({ id: `p${i}`, history: [{ at: daysAgo(30), verdict: "AC" }] }));
  const due = computeReviewQueue(metas, { now: NOW });
  assert.equal(due.length, 12);
});

// ---- dueStatus — the shared interval engine extracted so cardStore.js's
// Flash Quiz training queue and computeReviewQueue both age off the SAME
// [3,7,21,60] clock instead of each re-deriving it (Specimen unification). --

test("dueStatus: not yet due before the first interval elapses", () => {
  const status = dueStatus({ lastEventAt: daysAgo(1), eventCount: 0, now: NOW });
  assert.equal(status.due, false);
  assert.equal(status.intervalDays, 3);
});

test("dueStatus: due once daysSince reaches the interval for the current eventCount", () => {
  const status = dueStatus({ lastEventAt: daysAgo(3), eventCount: 0, now: NOW });
  assert.equal(status.due, true);
  assert.equal(status.daysSince, 3);
});

test("dueStatus: eventCount advances the interval exactly like reviewCount does, capped at the last one", () => {
  assert.equal(dueStatus({ lastEventAt: daysAgo(7), eventCount: 1, now: NOW }).due, true);
  assert.equal(dueStatus({ lastEventAt: daysAgo(6), eventCount: 1, now: NOW }).due, false);
  assert.equal(dueStatus({ lastEventAt: daysAgo(60), eventCount: 9, now: NOW }).intervalDays, 60);
});

test("dueStatus: accepts an epoch-ms lastEventAt as well as an ISO string", () => {
  const status = dueStatus({ lastEventAt: NOW - 3 * MS_PER_DAY, eventCount: 0, now: NOW });
  assert.equal(status.due, true);
});
