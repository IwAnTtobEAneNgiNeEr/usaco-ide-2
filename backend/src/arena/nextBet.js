"use strict";

// nextBet.js — pure core of "Kèo 3 cửa" (Revenge / Self-select / Mystery
// Bet), the CTA a student sees after any verdict. Takes already-flattened
// candidate records — no fs, no Date.now() (same "pure core given already-
// loaded facts" convention as arena/upgrade.js's evaluateCandidate).
//
// A candidate record: { id, title, topic, tags, cfRating, updatedAt,
//   matchState, matchOutcome, matchRated, solved, gauntletLastResult }.
// `solved` is the caller's already-computed arena/match.js wasEverSolved(meta)
// — NOT derivable from matchState/matchOutcome alone here, since a problem
// solved before the Arena's match bookkeeping existed has no "closed"/"ac"
// match state at all but is still very much solved (see routes/arena-next-
// bet.js's buildCandidates — this was a real bug: self-select/mystery used to
// only exclude matchState==="closed", so every pre-Arena solve kept re-
// offering itself as a "fresh" kèo forever).
//
// Three doors, three different honesty rules:
//   - Revenge:      real unfinished business (a surrender, or an AC the
//                    Gauntlet later disproved) — never randomized.
//   - Self-select:  any not-yet-solved problem inside the Elo band, fully
//                    visible, sorted closest-fight-first.
//   - Mystery Bet:  the ONE place RNG lives in this whole reward system —
//                    band shown, identity hidden (interleaved practice).
//                    Redaction strips id too: this app's problem ids are
//                    slugified titles, so leaking the id leaks the topic.

const rating = require("./rating");

const DEFAULT_BAND_WIDTH = 150;

function isSolved(c) {
  return Boolean(c.solved);
}

function inBand(c, playerRating, bandWidth) {
  return Number(c.cfRating) > 0 && Math.abs(Number(c.cfRating) - Number(playerRating)) <= bandWidth;
}

/** Real, non-random debts: a surrender, or a rated AC the Gauntlet later broke. */
function pickRevenge(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const debts = list.filter((c) => c.matchState === "surrendered" || (isSolved(c) && c.gauntletLastResult === "broken"));
  return debts.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** Any not-yet-solved problem inside the Elo band — fully visible, closest fight first. */
function pickSelfSelect(candidates, playerRating, { bandWidth = DEFAULT_BAND_WIDTH, excludeIds = [] } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const exclude = new Set(excludeIds);
  return list
    .filter((c) => !exclude.has(c.id) && !isSolved(c) && inBand(c, playerRating, bandWidth))
    .sort((a, b) => Math.abs(a.cfRating - playerRating) - Math.abs(b.cfRating - playerRating));
}

/** The one RNG zone: pick ONE eligible (unsolved, in-band, not excluded) candidate. */
function pickMysteryBet(candidates, playerRating, { bandWidth = DEFAULT_BAND_WIDTH, excludeIds = [], randomFn = Math.random } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const exclude = new Set(excludeIds);
  const pool = list.filter((c) => !exclude.has(c.id) && !isSolved(c) && inBand(c, playerRating, bandWidth));
  if (!pool.length) return null;
  const idx = Math.min(pool.length - 1, Math.floor(randomFn() * pool.length));
  return pool[idx];
}

/** Pre-open view: band visible, identity hidden — never leak id (slugs reveal
 *  topic) or the internal match/gauntlet bookkeeping. Omits rather than
 *  allowlists so callers can compose this AFTER withStakes and keep the
 *  stakes/riskLabel/nextTierGap fields it added. */
function redactCandidate(candidate) {
  if (!candidate) return null;
  const { id, title, topic, tags, matchState, matchOutcome, matchRated, solved, gauntletLastResult, ...rest } = candidate;
  return rest;
}

/** Attach Elo stakes/riskLabel/nextTierGap using the existing Elo engine — same
 *  numbers the "kèo" CTA line already shows elsewhere in the app. */
function withStakes(candidate, { rating: playerRating, gamesPlayed }) {
  const stakes = rating.stakesPreview({ rating: playerRating, gamesPlayed, problemRating: candidate.cfRating });
  return {
    ...candidate,
    stakes,
    riskLabel: rating.riskLabelFor(playerRating, candidate.cfRating),
    nextTierGap: rating.nextTierGap(playerRating),
  };
}

module.exports = { DEFAULT_BAND_WIDTH, pickRevenge, pickSelfSelect, pickMysteryBet, redactCandidate, withStakes };
