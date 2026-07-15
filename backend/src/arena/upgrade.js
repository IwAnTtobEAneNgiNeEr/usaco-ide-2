"use strict";

// upgrade.js — pure core of "Nâng Kèo RATED 1-click". The single biggest
// lever for making S3/S4 (Elo) actually MOVE on a workspace that predates the
// Đấu Trường: every already-solved problem is a FREE reference (the student's
// own AC'd code) — zero AI tokens, zero new trust rule. It just needs to be
// persisted into the vault the same way a manually-pasted reference already
// is (arena/referenceStore.js already accepts source:"manual"|"ai-brute";
// this adds "ac-code").
//
// Being RATED still requires all three README-LOOPS §1.2 conditions
// (arena/match.js's isRatedEligible) — this module only helps CLOSE two of
// them (reference + confirmed rating) faster and honestly. It never lowers
// the bar: a promoted reference is verified against samples with the EXACT
// same compile+run check a manual paste gets (referenceStore.
// verifyCodeAgainstSamples) — an AC'd solution that no longer matches the
// (possibly since-edited) statement is correctly refused, not rubber-stamped.
//
// Pure: takes already-computed facts (meta, hasSample, vaultUsable), no fs.

const match = require("./match");

/**
 * @param {object} meta - problemStore.readMeta() result
 * @param {boolean} hasSample - ai.extractSamples(statement).length > 0
 * @param {boolean} vaultUsable - referenceStore.evaluateTrust(...).usable
 */
function evaluateCandidate({ meta, hasSample, vaultUsable }) {
  // Same predicate arena/match.js's rated gate and arena/nextBet.js's Kèo
  // pools use — "solved" cannot mean three different things in three corners
  // of the Arena (that drift was a real bug: Next Bet used to only recognize
  // matchState==="closed", so every problem solved before the Arena existed
  // never showed up as "solved" there and kept re-offering itself as a kèo).
  const solved = match.wasEverSolved(meta);
  const hasRatingEstimate = Boolean(meta.analysis && Number(meta.analysis.cfRating) > 0);
  const ratingConfirmed = Boolean(meta.analysis && meta.analysis.ratingConfirmed);

  const canPromoteReference = solved && hasSample && !vaultUsable;
  const canConfirmRating = hasRatingEstimate && !ratingConfirmed;
  const fullyRatedReady = solved && hasSample && vaultUsable && hasRatingEstimate && ratingConfirmed;

  return {
    solved, hasSample, hasRatingEstimate, ratingConfirmed, vaultUsable,
    canPromoteReference, canConfirmRating, fullyRatedReady,
    actionable: canPromoteReference || canConfirmRating,
  };
}

/** Roll a list of `{ evaluation }` entries into headline counts for the UI. */
function summarize(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return {
    total: list.length,
    canPromoteReference: list.filter((c) => c.evaluation.canPromoteReference).length,
    canConfirmRating: list.filter((c) => c.evaluation.canConfirmRating).length,
  };
}

module.exports = { evaluateCandidate, summarize };
