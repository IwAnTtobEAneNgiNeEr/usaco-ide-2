"use strict";

// Tests for arena/match.js (S2) — the pure Rated/Friendly/Adjourned/Surrender
// state machine. Pure fixtures only, no fs — same convention as planner.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const match = require("../src/arena/match");

const FULL_ELIGIBILITY = { sample: true, reference: true, problemRatingConfirmed: true, neverSolvedBefore: true };
const PARTIAL_ELIGIBILITY = { sample: true, reference: false, problemRatingConfirmed: true, neverSolvedBefore: true };

test("defaultMatch/normalize: a brand-new problem has state 'none'", () => {
  assert.equal(match.defaultMatch().state, "none");
  assert.equal(match.normalize(null).state, "none");
  assert.equal(match.normalize({ state: "not-a-real-state" }).state, "none");
});

test("isRatedEligible requires ALL four conditions — no partial credit", () => {
  assert.equal(match.isRatedEligible(FULL_ELIGIBILITY), true);
  assert.equal(match.isRatedEligible(PARTIAL_ELIGIBILITY), false);
  assert.equal(match.isRatedEligible(null), false);
  assert.equal(match.isRatedEligible({ sample: true, reference: true, problemRatingConfirmed: false, neverSolvedBefore: true }), false);
  assert.equal(match.isRatedEligible({ sample: true, reference: true, problemRatingConfirmed: true, neverSolvedBefore: false }), false);
});

// ---- wasEverSolved -----------------------------------------------------------

test("wasEverSolved: a never-touched problem is false on every signal", () => {
  assert.equal(match.wasEverSolved({}), false);
  assert.equal(match.wasEverSolved({ match: null, lastVerdict: null, status: "learning", history: [] }), false);
});

test("wasEverSolved: a closed-ac match struct alone is enough", () => {
  assert.equal(match.wasEverSolved({ match: { state: "closed", outcome: "ac" } }), true);
});

test("wasEverSolved: a closed-ac match struct RESET back to open (re-engage) does NOT un-solve it if history remembers", () => {
  // history is durable — even once the match struct is wiped by a fresh
  // ensureOpen cycle, a real past AC must still gate future rated attempts.
  assert.equal(match.wasEverSolved({ match: { state: "open" }, history: [{ verdict: "AC", at: "2026-01-01T00:00:00.000Z" }] }), true);
});

test("wasEverSolved: legacy lastVerdict/status fields alone are enough (pre-Arena data)", () => {
  assert.equal(match.wasEverSolved({ lastVerdict: "AC" }), true);
  assert.equal(match.wasEverSolved({ status: "solved" }), true);
});

test("wasEverSolved: a live (not yet closed) match is NOT solved", () => {
  assert.equal(match.wasEverSolved({ match: { state: "open" } }), false);
  assert.equal(match.wasEverSolved({ match: { state: "surrendered", outcome: "surrender" } }), false);
});

test("ensureOpen: 'none' opens fresh with openedAt set", () => {
  const opened = match.ensureOpen(match.defaultMatch(), { now: 1000 });
  assert.equal(opened.state, "open");
  assert.equal(opened.openedAt, 1000);
  assert.equal(opened.waCount, 0);
});

test("ensureOpen: already-open stays open, keeps its counters", () => {
  const m = { ...match.defaultMatch(), state: "open", openedAt: 5, waCount: 3 };
  const opened = match.ensureOpen(m, { now: 999 });
  assert.equal(opened.state, "open");
  assert.equal(opened.openedAt, 5); // unchanged — still the same attempt
  assert.equal(opened.waCount, 3);
});

test("ensureOpen: adjourned resumes to open, keeps counters", () => {
  const m = { ...match.defaultMatch(), state: "adjourned", openedAt: 5, waCount: 2, adjournedAt: 50 };
  const opened = match.ensureOpen(m, { now: 999 });
  assert.equal(opened.state, "open");
  assert.equal(opened.waCount, 2);
});

test("ensureOpen: closed/surrendered starts a FRESH attempt cycle (counters reset)", () => {
  const closed = { ...match.defaultMatch(), state: "closed", waCount: 7, outcome: "ac", rated: true };
  const opened = match.ensureOpen(closed, { now: 42 });
  assert.equal(opened.state, "open");
  assert.equal(opened.waCount, 0);
  assert.equal(opened.outcome, null);
  assert.equal(opened.openedAt, 42);
});

test("onVerdict: WA/RE/TLE never close the match, just increment waCount", () => {
  let m = match.defaultMatch();
  for (const v of ["WA", "RE", "TLE"]) {
    const r = match.onVerdict(m, { verdict: v, now: 1, eligibility: FULL_ELIGIBILITY });
    assert.equal(r.event, "fail");
    assert.equal(r.match.state, "open");
    m = r.match;
  }
  assert.equal(m.waCount, 3);
});

test("onVerdict: CE is ignored — not a real attempt, no state change beyond auto-open", () => {
  const r = match.onVerdict(match.defaultMatch(), { verdict: "CE", now: 1, eligibility: FULL_ELIGIBILITY });
  assert.equal(r.event, "ignored");
  assert.equal(r.match.waCount, 0);
});

test("onVerdict: AC with full eligibility closes RATED", () => {
  const r = match.onVerdict(match.defaultMatch(), { verdict: "AC", now: 100, eligibility: FULL_ELIGIBILITY });
  assert.equal(r.event, "closed-ac");
  assert.equal(r.match.state, "closed");
  assert.equal(r.match.outcome, "ac");
  assert.equal(r.match.rated, true);
  assert.equal(r.match.closedAt, 100);
});

test("onVerdict: AC without a trusted reference closes FRIENDLY, not rated", () => {
  const r = match.onVerdict(match.defaultMatch(), { verdict: "AC", now: 100, eligibility: PARTIAL_ELIGIBILITY });
  assert.equal(r.event, "closed-ac");
  assert.equal(r.match.rated, false);
});

test("onVerdict: AC after some WA carries the pre-AC waCount into the closed match (waBeforeAc)", () => {
  let m = match.defaultMatch();
  m = match.onVerdict(m, { verdict: "WA", now: 1, eligibility: FULL_ELIGIBILITY }).match;
  m = match.onVerdict(m, { verdict: "WA", now: 2, eligibility: FULL_ELIGIBILITY }).match;
  const r = match.onVerdict(m, { verdict: "AC", now: 3, eligibility: FULL_ELIGIBILITY });
  assert.equal(r.match.waCount, 2);
});

test("onVerdict: eligibility fixed mid-match (suite repaired) makes THIS AC rated", () => {
  let m = match.onVerdict(match.defaultMatch(), { verdict: "WA", now: 1, eligibility: PARTIAL_ELIGIBILITY }).match;
  const r = match.onVerdict(m, { verdict: "AC", now: 2, eligibility: FULL_ELIGIBILITY });
  assert.equal(r.match.rated, true, "eligibility is evaluated at the WINNING submit, not at open");
});

test("adjourn: only valid while open; costs nothing", () => {
  const opened = match.ensureOpen(match.defaultMatch(), { now: 1 });
  const adjourned = match.adjourn(opened, { now: 50 });
  assert.equal(adjourned.state, "adjourned");
  assert.equal(adjourned.adjournedAt, 50);
  assert.equal(adjourned.rated, null); // untouched — no verdict happened

  // Adjourning something not open is a no-op.
  const noop = match.adjourn(match.defaultMatch(), { now: 999 });
  assert.equal(noop.state, "none");
});

test("surrender: valid mid-fight, rated loss ONLY if eligible right now", () => {
  const opened = match.ensureOpen(match.defaultMatch(), { now: 1 });
  const surrendered = match.surrender(opened, { now: 50, eligibility: FULL_ELIGIBILITY });
  assert.equal(surrendered.state, "surrendered");
  assert.equal(surrendered.outcome, "surrender");
  assert.equal(surrendered.rated, true);
  assert.equal(surrendered.surrenderedAt, 50);
});

test("surrender: a friendly (ineligible) match surrenders for free (rated:false)", () => {
  const opened = match.ensureOpen(match.defaultMatch(), { now: 1 });
  const surrendered = match.surrender(opened, { now: 50, eligibility: PARTIAL_ELIGIBILITY });
  assert.equal(surrendered.rated, false);
});

test("surrender: no-op when there is nothing live (never played, or already closed)", () => {
  assert.equal(match.surrender(match.defaultMatch(), { now: 1, eligibility: FULL_ELIGIBILITY }).state, "none");
  const closed = { ...match.defaultMatch(), state: "closed" };
  assert.equal(match.surrender(closed, { now: 1, eligibility: FULL_ELIGIBILITY }).state, "closed");
});

test("surrender: an adjourned match can still be surrendered", () => {
  const adjourned = match.adjourn(match.ensureOpen(match.defaultMatch(), { now: 1 }), { now: 5 });
  const surrendered = match.surrender(adjourned, { now: 10, eligibility: FULL_ELIGIBILITY });
  assert.equal(surrendered.state, "surrendered");
});
