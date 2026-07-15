"use strict";

// Tests for arena/upgrade.js — pure "Nâng Kèo RATED 1-click" eligibility logic.
// No fs.

const test = require("node:test");
const assert = require("node:assert/strict");
const upgrade = require("../src/arena/upgrade");

function meta(overrides = {}) {
  return { lastVerdict: null, status: "learning", analysis: null, ...overrides };
}

test("an unsolved problem can never promote a reference (nothing solved to promote)", () => {
  const e = upgrade.evaluateCandidate({ meta: meta({ analysis: { cfRating: 1300, ratingConfirmed: false } }), hasSample: true, vaultUsable: false });
  assert.equal(e.solved, false);
  assert.equal(e.canPromoteReference, false);
  // canConfirmRating is orthogonal to "solved" — confirming an AI rating
  // estimate is legitimate even mid-attempt (matches /rating-confirm's own
  // rule, which never checks solved) — so this candidate is still actionable.
  assert.equal(e.actionable, true);
});

test("solved + sample + no vault → canPromoteReference, not yet fully ready", () => {
  const e = upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC" }), hasSample: true, vaultUsable: false });
  assert.equal(e.canPromoteReference, true);
  assert.equal(e.fullyRatedReady, false);
  assert.equal(e.actionable, true);
});

test("solved but no sample → cannot promote (nothing to verify against)", () => {
  const e = upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC" }), hasSample: false, vaultUsable: false });
  assert.equal(e.canPromoteReference, false);
});

test("solved + sample + vault already usable → nothing left to promote", () => {
  const e = upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC" }), hasSample: true, vaultUsable: true });
  assert.equal(e.canPromoteReference, false);
});

test("a cfRating estimate that isn't confirmed yet is always actionable, even with a usable vault", () => {
  const e = upgrade.evaluateCandidate({
    meta: meta({ lastVerdict: "AC", analysis: { cfRating: 1400, ratingConfirmed: false } }),
    hasSample: true, vaultUsable: true,
  });
  assert.equal(e.canPromoteReference, false);
  assert.equal(e.canConfirmRating, true);
  assert.equal(e.actionable, true);
});

test("fullyRatedReady requires ALL FOUR conditions at once", () => {
  const full = { lastVerdict: "AC", analysis: { cfRating: 1200, ratingConfirmed: true } };
  assert.equal(upgrade.evaluateCandidate({ meta: meta(full), hasSample: true, vaultUsable: true }).fullyRatedReady, true);
  assert.equal(upgrade.evaluateCandidate({ meta: meta(full), hasSample: false, vaultUsable: true }).fullyRatedReady, false);
  assert.equal(upgrade.evaluateCandidate({ meta: meta(full), hasSample: true, vaultUsable: false }).fullyRatedReady, false);
});

test("a fully-ready candidate is not actionable — nothing left for 1-click to do", () => {
  const e = upgrade.evaluateCandidate({
    meta: meta({ lastVerdict: "AC", analysis: { cfRating: 1200, ratingConfirmed: true } }),
    hasSample: true, vaultUsable: true,
  });
  assert.equal(e.actionable, false);
});

test("status:'solved' counts as solved just like lastVerdict:'AC'", () => {
  const e = upgrade.evaluateCandidate({ meta: meta({ status: "solved" }), hasSample: true, vaultUsable: false });
  assert.equal(e.solved, true);
  assert.equal(e.canPromoteReference, true);
});

test("summarize: counts actionable buckets across a candidate list", () => {
  const list = [
    { evaluation: upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC" }), hasSample: true, vaultUsable: false }) }, // promote only
    { evaluation: upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC", analysis: { cfRating: 1300, ratingConfirmed: false } }), hasSample: true, vaultUsable: true }) }, // confirm only
    { evaluation: upgrade.evaluateCandidate({ meta: meta({ lastVerdict: "AC", analysis: { cfRating: 1300, ratingConfirmed: true } }), hasSample: true, vaultUsable: true }) }, // fully ready, not actionable
  ];
  const s = upgrade.summarize(list);
  assert.equal(s.total, 3);
  assert.equal(s.canPromoteReference, 1);
  assert.equal(s.canConfirmRating, 1);
});
