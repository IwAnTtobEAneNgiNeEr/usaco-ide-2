"use strict";

// rating.js — pure Elo engine for the Đấu Trường (S3 identity, S4 stakes).
// Deliberately modeled after Codeforces, the rating culture CP students
// already read fluently, rather than inventing a new number nobody trusts.
//
// Two honesty rules baked into the math itself (not bolted on as copy):
//   1. `band` (uncertainty) starts wide and narrows with games played — a
//      seeded/early rating is visibly "still forming", never presented as a
//      settled fact. This IS the "seeded, not proven" story from the design,
//      expressed as a number instead of an asterisk.
//   2. `performanceScore` floors a comeback AC (after some WAs) at 0.7, never
//      1.0 — a clean AC and a scraped-through AC both count as a win, but a
//      clean one is worth (correctly) a little more.
//
// Pure: no fs, no Date.now(), no Express — every input is passed in.

const K_PROVISIONAL = 40;
const K_ESTABLISHED = 20;
const PROVISIONAL_GAMES = 30; // matches this codebase's existing convention (settingsStore fallback windows, planner MAX_* caps use similarly small round numbers)
const DEFAULT_RATING = 1000; // CF-ish "unrated newbie" starting point
const BAND_START = 350;
const BAND_MIN = 60;
const PERFORMANCE_FLOOR = 0.7;
const PERFORMANCE_DECAY_PER_WA = 0.05;

// CF-like rank bands (reused verbatim as thresholds — this app already mirrors
// this scale for PROBLEM difficulty in ai.js's cfRating estimate; giving the
// PLAYER the same scale is the whole point of S3).
const TIERS = [
  { id: "legendary", name: "Huyền thoại", min: 3000 },
  { id: "international-gm", name: "Đại kiện tướng Quốc tế", min: 2600 },
  { id: "grandmaster", name: "Kiện tướng", min: 2400 },
  { id: "master", name: "Master", min: 2100 },
  { id: "candidate-master", name: "Ứng viên Master", min: 1900 },
  { id: "expert", name: "Chuyên gia", min: 1600 },
  { id: "specialist", name: "Chuyên viên", min: 1400 },
  { id: "pupil", name: "Học viên", min: 1200 },
  { id: "newbie", name: "Người mới", min: 0 },
];

function tierOf(rating) {
  for (const t of TIERS) if (rating >= t.min) return t;
  return TIERS[TIERS.length - 1];
}

/** Rating gap to the next tier up (0 if already at the top tier). */
function nextTierGap(rating) {
  const idx = TIERS.findIndex((t) => t.id === tierOf(rating).id);
  if (idx <= 0) return 0; // already legendary
  return Math.max(0, TIERS[idx - 1].min - rating);
}

function kFactorFor(gamesPlayed) {
  return gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
}

/** Standard Elo expected-score curve (0..1). */
function expectedScore(rating, problemRating) {
  return 1 / (1 + Math.pow(10, (problemRating - rating) / 400));
}

/**
 * How much a win is "worth" this time: a clean first-try AC is a full win;
 * every WA before it decays the credit, floored at 0.7 so a hard-fought
 * comeback still counts as a real win (the design's "sàn ~0.7" rule).
 * A surrender is worth 0.
 */
function performanceScore({ verdict, waBeforeAc = 0 }) {
  if (verdict === "surrender") return 0;
  const decayed = 1 - PERFORMANCE_DECAY_PER_WA * Math.max(0, Number(waBeforeAc) || 0);
  return Math.max(PERFORMANCE_FLOOR, decayed);
}

/** Uncertainty band shrinks linearly from BAND_START to BAND_MIN over the
 *  first PROVISIONAL_GAMES games, then stays put. */
function bandAfter(gamesPlayed) {
  const t = Math.min(1, Math.max(0, gamesPlayed) / PROVISIONAL_GAMES);
  return Math.round(BAND_START - (BAND_START - BAND_MIN) * t);
}

/**
 * One Elo update. `verdict` is "AC" or "surrender" (the only two outcomes a
 * RATED match can close on — WA/RE/TLE never reach here, see arena/match.js).
 */
function applyResult({ rating = DEFAULT_RATING, gamesPlayed = 0, problemRating, verdict, waBeforeAc = 0 }) {
  const R = Number(rating) || DEFAULT_RATING;
  const P = Number(problemRating) || DEFAULT_RATING;
  const expected = expectedScore(R, P);
  const performance = performanceScore({ verdict, waBeforeAc });
  const k = kFactorFor(gamesPlayed);
  const delta = Math.round(k * (performance - expected));
  const ratingAfter = Math.max(0, R + delta);
  const nextGames = gamesPlayed + 1;
  return { ratingBefore: R, ratingAfter, delta, expected, performance, k, gamesPlayed: nextGames, band: bandAfter(nextGames) };
}

/**
 * Fold a chronological list of ALREADY-RATED-ELIGIBLE past results into a
 * seeded rating — "Dựa trên N trận đã đấu, rating ước lượng của em: X".
 * `entries`: [{ problemRating, verdict:"AC"|"surrender", waBeforeAc, at }],
 * oldest first. Never throws on an empty list — that's just an unseeded newbie.
 */
function seedFromHistory(entries) {
  let rating = DEFAULT_RATING;
  let gamesPlayed = 0;
  const log = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    const step = applyResult({ rating, gamesPlayed, problemRating: e.problemRating, verdict: e.verdict, waBeforeAc: e.waBeforeAc });
    rating = step.ratingAfter;
    gamesPlayed = step.gamesPlayed;
    log.push({ at: e.at, delta: step.delta, ratingAfter: rating });
  }
  return { rating, gamesPlayed, band: bandAfter(gamesPlayed), log };
}

/**
 * "Kèo" preview for a candidate problem — what a clean win / a surrender
 * would be worth RIGHT NOW, without mutating anything. Used for the stakes
 * line on the CTA ("+19/−5 · RATED").
 */
function stakesPreview({ rating, gamesPlayed, problemRating }) {
  const win = applyResult({ rating, gamesPlayed, problemRating, verdict: "AC", waBeforeAc: 0 });
  const lose = applyResult({ rating, gamesPlayed, problemRating, verdict: "surrender" });
  return { win: win.delta, lose: lose.delta, expected: win.expected };
}

/** Which of three difficulty bands a candidate problem rating falls into,
 *  relative to the player — the "an toàn / chuẩn / upset" kèo choice (S4). */
function riskLabelFor(rating, problemRating) {
  const gap = Number(problemRating) - Number(rating);
  if (gap <= -100) return "safe";
  if (gap >= 100) return "upset";
  return "standard";
}

module.exports = {
  DEFAULT_RATING,
  PROVISIONAL_GAMES,
  BAND_START,
  BAND_MIN,
  PERFORMANCE_FLOOR,
  TIERS,
  tierOf,
  nextTierGap,
  kFactorFor,
  expectedScore,
  performanceScore,
  bandAfter,
  applyResult,
  seedFromHistory,
  stakesPreview,
  riskLabelFor,
};
