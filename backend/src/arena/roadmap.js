"use strict";

// roadmap.js — pure core of "Đường lên Silver" (S7). A goal-gradient view: not
// a new mastery model (skills.js already owns that — README-LOOPS.md §3.3
// "KHÔNG nhân đôi nguồn sự thật"), just a curated slice of computeSkillMap's
// OWN clusters compared against a fixed goal, plus the player's own rating gap
// to the same target. Everything here reads existing numbers; nothing is computed twice.
//
// Pure: takes computeSkillMap's `clusters` output + a rating snapshot, no fs.

// USACO Silver's curriculum footprint — the clusters a Silver-level solver is
// expected to have some real command of. Deliberately excludes "strings",
// "geometry" and "other": this codebase's own AI analysis prompt (ai.js,
// ANALYSIS_SYSTEM) already places those techniques above the Silver band in
// practice, and skills.js's cluster list is the single source of truth this
// reuses rather than re-deriving a second curriculum.
const SILVER_TARGET_CLUSTER_IDS = ["foundation", "math", "greedy-sort", "search", "ds", "graphs", "dp"];

// Mirrors the SAME Codeforces-scale mapping already documented in ai.js's
// analysis prompt ("Silver≈1200–1600") — reused, not reinvented.
const SILVER_RATING_FLOOR = 1200;

// A cluster mastery of "gold" tier (skills.js TIERS) is treated as "solid for
// Silver" — the same 60 threshold skills.js already uses for its own gold tier.
const CLUSTER_MASTERY_GOAL = 60;

function confidenceFor(totalAttempts) {
  if (totalAttempts < 10) return { level: "so-bo", label: "Sơ bộ — còn ít dữ liệu" };
  if (totalAttempts < 30) return { level: "dang-ro-dan", label: "Đang rõ dần" };
  return { level: "kha-ro", label: "Khá rõ" };
}

/**
 * @param {Array} clusters - computeSkillMap(metas).clusters output (already computed)
 * @param {object} ratingSnapshot - { rating, gamesPlayed } from ratingStore
 */
function computeRoadmap(clusters, ratingSnapshot = {}) {
  const byId = new Map((Array.isArray(clusters) ? clusters : []).map((c) => [c.id, c]));

  const onPath = SILVER_TARGET_CLUSTER_IDS.map((id) => {
    const c = byId.get(id);
    const mastery = c ? c.mastery : 0;
    const total = c ? c.topics.reduce((s, t) => s + t.total, 0) : 0;
    return {
      id,
      name: c ? c.name : id,
      mastery,
      goal: CLUSTER_MASTERY_GOAL,
      gap: Math.max(0, CLUSTER_MASTERY_GOAL - mastery),
      attempts: total,
    };
  });

  const progressFractions = onPath.map((c) => Math.min(1, c.mastery / CLUSTER_MASTERY_GOAL));
  const progressPct = Math.round((progressFractions.reduce((a, b) => a + b, 0) / onPath.length) * 100);
  const totalAttempts = onPath.reduce((s, c) => s + c.attempts, 0);

  const rating = Number(ratingSnapshot.rating) || 0;
  const ratingGap = Math.max(0, SILVER_RATING_FLOOR - rating);

  return {
    progressPct,
    ratingFloor: SILVER_RATING_FLOOR,
    rating,
    ratingGap,
    confidence: confidenceFor(totalAttempts),
    clusters: onPath,
  };
}

module.exports = { SILVER_TARGET_CLUSTER_IDS, SILVER_RATING_FLOOR, CLUSTER_MASTERY_GOAL, confidenceFor, computeRoadmap };
