"use strict";

// match.js — pure state machine for a single problem's "trận đấu" (S2, Đấu
// Trường). This is the honesty gate the whole Arena sits on: a match is only
// RATED when the suite backing it is actually trustworthy (official sample +
// a trusted reference + a human-confirmed problem rating) AND the problem has
// never been won before (a problem's rated win is spent exactly once, ever —
// re-solving an already-AC'd problem is Ôn tập/Gauntlet material, not a fresh
// Elo fight) — chess.com's Rated/Unrated toggle, decided by evidence instead
// of a checkbox.
//
// WA/RE/TLE never end a match — only AC (win) or an explicit surrender do.
// "Adjourned" (hoãn) is the nhân từ escape hatch: leaving mid-fight costs
// nothing and gives the student something honest to come back to.
//
// Pure: no fs, no Date.now() (caller passes `now`), no Express. Persisted as
// `meta.match` via problemStore (same additive-field pattern as `defense`).

const truthModel = require("../truthModel");

const STATES = Object.freeze(["none", "open", "adjourned", "surrendered", "closed"]);

function defaultMatch() {
  return {
    state: "none",
    rated: null,
    openedAt: null,
    closedAt: null,
    adjournedAt: null,
    surrenderedAt: null,
    ratedEligible: null,
    outcome: null, // null | "ac" | "surrender"
    waCount: 0,
  };
}

/** Heal a partial/legacy match object so callers never see undefined fields. */
function normalize(match) {
  if (!match || typeof match !== "object" || !STATES.includes(match.state)) return defaultMatch();
  return { ...defaultMatch(), ...match };
}

/** True iff ALL four trust conditions hold — no partial credit. The 4th
 *  (`neverSolvedBefore`) is what stops a rated-replay farm: promoting an old
 *  AC's code into a trusted reference and re-judging it would otherwise
 *  satisfy sample+reference+problemRatingConfirmed on a problem that was
 *  never actually a live fight this time around. */
function isRatedEligible(eligibility) {
  return Boolean(
    eligibility &&
    eligibility.sample &&
    eligibility.reference &&
    eligibility.problemRatingConfirmed &&
    eligibility.neverSolvedBefore
  );
}

/**
 * True iff this problem has EVER recorded an AC — checked across every
 * signal this codebase has historically used for "solved", since no single
 * one is complete on its own:
 *   - the Arena match's own closed-ac state (catches an AC that hasn't gone
 *     through a real judge/recordRun cycle yet — e.g. route-level bookkeeping
 *     in tests);
 *   - the legacy meta.lastVerdict==="AC" / meta.status==="solved" fields
 *     (the ones every OTHER call site in this codebase — upgrade.js, boss.js,
 *     skills.js, contests.js, planner.js, stats.js — has always checked);
 *   - truthModel.isSolved's history-derived firstAcceptedAt (durable and
 *     append-only, so it survives lastVerdict later flipping back to WA on a
 *     re-submission, which the legacy fields alone would miss).
 * truthModel.js's own deriveLifecycle does NOT look at lastVerdict at all —
 * it's an unwired, incomplete module on its own (nothing in this codebase
 * ever calls its syncLifecycle to keep `status` in sync), so it must be
 * combined with the legacy fields here, not used alone. Callers needing "has
 * this problem already been won" (rated-eligibility here, the Kèo pools in
 * arena/nextBet.js) must use this single function so "already solved" never
 * means three different things in three different corners of the Arena.
 */
function wasEverSolved(meta) {
  const m = meta || {};
  const matchState = m.match;
  const matchSolved = Boolean(matchState && matchState.state === "closed" && matchState.outcome === "ac");
  const legacySolved = m.lastVerdict === "AC" || m.status === "solved";
  return matchSolved || legacySolved || truthModel.isSolved(m);
}

/** A match auto-(re)opens the moment a student engages a problem with no live attempt. */
function ensureOpen(match, { now }) {
  const m = normalize(match);
  if (m.state === "open" || m.state === "adjourned") {
    return m.state === "adjourned" ? { ...m, state: "open" } : m;
  }
  // "none" (never played) or "closed"/"surrendered" (a previous cycle already
  // ended) → this is a FRESH attempt cycle.
  return { ...defaultMatch(), state: "open", openedAt: now };
}

/**
 * Apply one judge verdict to an (already-open) match. `eligibility` is
 * evaluated at THIS moment — a student who fixes their suite mid-match earns
 * a rated win on the attempt that actually clears the bar, not retroactively.
 * Returns { match, event } where event is "closed-ac" | "fail" | "ignored"
 * (CE doesn't count as an attempt — nothing compiled, nothing was judged).
 */
function onVerdict(match, { verdict, now, eligibility }) {
  const opened = ensureOpen(match, { now });
  if (verdict === "AC") {
    const rated = isRatedEligible(eligibility);
    return {
      match: { ...opened, state: "closed", outcome: "ac", rated, ratedEligible: eligibility || null, closedAt: now },
      event: "closed-ac",
    };
  }
  if (verdict === "WA" || verdict === "RE" || verdict === "TLE") {
    return { match: { ...opened, waCount: opened.waCount + 1 }, event: "fail" };
  }
  return { match: opened, event: "ignored" }; // CE or anything else — not a real attempt
}

/** Đầu hàng (nhân từ escape hatch): valid mid-fight, costs a small rated loss
 *  IF the match was rated-eligible at the moment of surrender (still honest —
 *  giving up on a real fight has a real cost; giving up on a friendly doesn't). */
function surrender(match, { now, eligibility }) {
  const m = normalize(match);
  if (m.state !== "open" && m.state !== "adjourned") return m; // no-op: nothing live to surrender
  const rated = isRatedEligible(eligibility);
  return { ...m, state: "surrendered", outcome: "surrender", rated, ratedEligible: eligibility || null, surrenderedAt: now };
}

/** Hoãn trận: only valid while genuinely open (already-adjourned/closed is a no-op). */
function adjourn(match, { now }) {
  const m = normalize(match);
  if (m.state !== "open") return m;
  return { ...m, state: "adjourned", adjournedAt: now };
}

module.exports = { STATES, defaultMatch, normalize, isRatedEligible, wasEverSolved, ensureOpen, onVerdict, surrender, adjourn };
