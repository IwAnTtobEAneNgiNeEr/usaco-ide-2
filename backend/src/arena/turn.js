"use strict";

// turn.js — the non-pure edge that wires match.js (S2) + rating.js (S3/S4)
// into the real judge loop. Every judge verdict passes through here exactly
// once; this module decides rated-vs-friendly, transitions the match, and
// (only when rated) moves the Elo needle — then persists both. Never throws:
// a failure here must never cost a student their actual judge result, so
// every public function is called from routes/judge.js inside a try/catch
// (same "recorder must never break the thing it's recording" discipline as
// recorder.js/recordProblemEvent).

const path = require("path");
const config = require("../config");
const ai = require("../ai");
const problemStore = require("../problemStore");
const referenceStore = require("./referenceStore");
const ratingStore = require("./ratingStore");
const rating = require("./rating");
const match = require("./match");
const { statementHash } = require("../trustLayer");

const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

/** The four honesty conditions a match must clear to be RATED (README-LOOPS
 *  §1.2 in numeric form): a real official sample, a reference the app itself
 *  trusts, a problem rating the STUDENT has looked at and confirmed, and —
 *  the problem has never been won before (a rated win is spent exactly once,
 *  ever; see arena/match.js's wasEverSolved). `meta` MUST be read before the
 *  current verdict is persisted (problemStore.recordRun already wrote
 *  lastVerdict/history by the time routes/judge.js calls onJudgeVerdict, so
 *  onJudgeVerdict passes its own pre-verdict `meta` through here instead of
 *  letting this function re-read a now-stale-for-this-purpose disk state). */
async function computeEligibility(id, meta, statement) {
  const samples = ai.extractSamples(statement);
  const vaultMeta = await referenceStore.readMeta(id);
  const trust = referenceStore.evaluateTrust(vaultMeta, statementHash(statement));
  return {
    sample: samples.length > 0,
    reference: trust.usable,
    problemRatingConfirmed: Boolean(meta.analysis && meta.analysis.ratingConfirmed && Number(meta.analysis.cfRating) > 0),
    neverSolvedBefore: !match.wasEverSolved(meta),
  };
}

function problemRatingOf(meta) {
  const cf = meta.analysis && Number(meta.analysis.cfRating);
  return cf && cf > 0 ? cf : rating.DEFAULT_RATING;
}

/** Called after EVERY judge (not run/single-test) completes. `meta`, if
 *  given, MUST be the pre-verdict read the caller already had lying around
 *  (routes/judge.js reads meta before recordRun persists this verdict's
 *  lastVerdict/history) — see computeEligibility's header. Falls back to a
 *  fresh read for callers (tests, other call sites) that don't already have
 *  one, where no such staleness risk exists. */
async function onJudgeVerdict({ id, verdict, now = Date.now(), meta: preMeta } = {}) {
  if (!["AC", "WA", "RE", "TLE"].includes(verdict)) return null; // CE etc. — not a real attempt
  const meta = preMeta || await problemStore.readMeta(id);
  const statement = await problemStore.getFile(id, "statement");
  const eligibility = await computeEligibility(id, meta, statement);

  const { match: nextMatch, event } = match.onVerdict(meta.match, { verdict, now, eligibility });
  await problemStore.updateProblem(id, { match: nextMatch });

  let ratingResult = null;
  if (event === "closed-ac" && nextMatch.rated) {
    const { entry } = await ratingStore.applyAndSave(RATING_FILE, {
      problemId: id, problemRating: problemRatingOf(meta), verdict: "AC", waBeforeAc: nextMatch.waCount, at: new Date(now).toISOString(),
    });
    ratingResult = entry;
  }
  return { match: nextMatch, event, rating: ratingResult };
}

/** POST .../match/surrender */
async function surrenderMatch(id, { now = Date.now() } = {}) {
  const meta = await problemStore.readMeta(id);
  const statement = await problemStore.getFile(id, "statement");
  const eligibility = await computeEligibility(id, meta, statement);
  const nextMatch = match.surrender(meta.match, { now, eligibility });
  await problemStore.updateProblem(id, { match: nextMatch });

  let ratingResult = null;
  if (nextMatch.outcome === "surrender" && nextMatch.rated) {
    const { entry } = await ratingStore.applyAndSave(RATING_FILE, {
      problemId: id, problemRating: problemRatingOf(meta), verdict: "surrender", waBeforeAc: 0, at: new Date(now).toISOString(),
    });
    ratingResult = entry;
  }
  return { match: nextMatch, rating: ratingResult };
}

/** POST .../match/adjourn — never touches rating. */
async function adjournMatch(id, { now = Date.now() } = {}) {
  const meta = await problemStore.readMeta(id);
  const nextMatch = match.adjourn(meta.match, { now });
  await problemStore.updateProblem(id, { match: nextMatch });
  return { match: nextMatch };
}

/** GET .../match — live status + "would this AC be rated right now" preview. */
async function getMatchStatus(id) {
  const meta = await problemStore.readMeta(id);
  const statement = await problemStore.getFile(id, "statement");
  const eligibility = await computeEligibility(id, meta, statement);
  return {
    match: match.normalize(meta.match),
    eligibility,
    wouldBeRated: match.isRatedEligible(eligibility),
    problemRating: problemRatingOf(meta),
  };
}

module.exports = { RATING_FILE, computeEligibility, problemRatingOf, onJudgeVerdict, surrenderMatch, adjournMatch, getMatchStatus };
