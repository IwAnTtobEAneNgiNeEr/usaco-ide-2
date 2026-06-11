"use strict";

// stats.js — GET /api/stats : aggregate analytics across ALL problems for the
// Progress Dashboard (verdict mix, status, difficulty / USACO-tier / CF-rating
// distribution, top topics, a 8-week activity heatmap, and a current streak).

const path = require("path");
const express = require("express");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const { computeSkillMap } = require("../skills");
const { asyncHandler } = require("./_util");

const router = express.Router();

function inc(map, key) { if (!key && key !== 0) return; map[key] = (map[key] || 0) + 1; }
function dayKey(iso) { const d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0, 10); }

router.get("/", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));

  const byStatus = {};
  const byDifficulty = {};
  const bySource = {};
  const byTier = {};
  const byLastVerdict = {};
  const cfRatings = [];
  const topicCount = {};
  const activity = {};        // dayKey -> run count
  const verdictRuns = {};     // verdict -> count across all history
  let totalRuns = 0;
  let solved = 0;

  for (const m of metas) {
    inc(byStatus, m.status);
    inc(byDifficulty, m.difficulty);
    if (m.source) inc(bySource, m.source);
    inc(byLastVerdict, m.lastVerdict || "none");
    const a = m.analysis || {};
    if (a.usacoTier) inc(byTier, a.usacoTier);
    if (a.cfRating) cfRatings.push(a.cfRating);
    (m.tags || []).forEach((t) => inc(topicCount, t));
    if (m.topic) inc(topicCount, m.topic);
    if (m.status === "solved" || m.lastVerdict === "AC") solved += 1;

    for (const h of (m.history || [])) {
      totalRuns += 1;
      inc(verdictRuns, h.verdict || "none");
      const k = dayKey(h.at);
      if (k) inc(activity, k);
    }
  }

  // CF rating distribution into Codeforces-style buckets.
  const cfBuckets = { "<1000": 0, "1000-1299": 0, "1300-1599": 0, "1600-1899": 0, "1900-2099": 0, "2100+": 0 };
  for (const r of cfRatings) {
    if (r < 1000) cfBuckets["<1000"]++;
    else if (r < 1300) cfBuckets["1000-1299"]++;
    else if (r < 1600) cfBuckets["1300-1599"]++;
    else if (r < 1900) cfBuckets["1600-1899"]++;
    else if (r < 2100) cfBuckets["1900-2099"]++;
    else cfBuckets["2100+"]++;
  }
  const cfAvg = cfRatings.length ? Math.round(cfRatings.reduce((a, b) => a + b, 0) / cfRatings.length) : 0;

  // 56-day (8 week) activity grid, oldest→newest.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const heatmap = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    heatmap.push({ date: k, count: activity[k] || 0 });
  }
  // Current streak: consecutive days up to today with ≥1 run.
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    if (activity[k]) streak += 1; else break;
  }

  const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));

  res.json({
    ok: true,
    totals: { problems: metas.length, solved, totalRuns, streak, cfAvg },
    byStatus, byDifficulty, bySource, byTier, byLastVerdict,
    verdictRuns, cfBuckets, topTopics, heatmap
  });
}));

// GET /api/stats/skills
// The Skill Constellation: every tagged topic routed into a CP curriculum of
// clusters, each topic scored 0-100 (volume + reliability + recency). Pure
// derivation from meta.history — see src/skills.js.
router.get("/skills", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
  res.json({ ok: true, ...computeSkillMap(metas) });
}));

// GET /api/stats/review-queue
// Spaced-repetition queue: solved problems that are due for review.
//   - waBeforeAc = WA runs that occurred BEFORE the first AC (proxy for "how
//     hard was this for the student?"). Counted chronologically.
//   - daysSinceAc = days since the first AC entry.
//   - reviewCount = how many times the student has marked "Đã ôn" (lives in
//     meta.reviewCount; absent → 0).
//   - Intervals: due when daysSinceLastReview >= [3, 7, 21][reviewCount] (or 60
//     for higher counts). lastReviewedAt defaults to firstAcAt.
// Ranked by waBeforeAc desc (hardest first), capped at 8.
router.get("/review-queue", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
  const now = Date.now();
  const INTERVALS = [3, 7, 21, 60]; // days
  const MS_PER_DAY = 86400000;

  const due = [];
  for (const m of metas) {
    const history = Array.isArray(m.history) ? m.history : [];
    if (!history.length) continue;
    const chrono = history.slice().reverse(); // oldest → newest
    const firstAcIdx = chrono.findIndex((h) => h.verdict === "AC");
    if (firstAcIdx < 0) continue;
    const firstAc = chrono[firstAcIdx];
    const waBeforeAc = chrono.slice(0, firstAcIdx).filter((h) => h.verdict === "WA").length;
    const firstAcAt = firstAc.at ? Date.parse(firstAc.at) : null;
    if (!firstAcAt) continue;

    const reviewCount = Number(m.reviewCount) > 0 ? Math.floor(Number(m.reviewCount)) : 0;
    const lastReviewedAt = m.lastReviewedAt ? Date.parse(m.lastReviewedAt) : firstAcAt;
    const daysSinceReview = (now - lastReviewedAt) / MS_PER_DAY;
    const intervalDays = INTERVALS[Math.min(reviewCount, INTERVALS.length - 1)];
    if (daysSinceReview < intervalDays) continue;

    due.push({
      id: m.id,
      title: m.title || m.id,
      topic: m.topic || "",
      tags: m.tags || [],
      waBeforeAc,
      daysSinceAc: Math.floor((now - firstAcAt) / MS_PER_DAY),
      daysSinceReview: Math.floor(daysSinceReview),
      reviewCount,
      nextIntervalDays: intervalDays
    });
  }

  // Hardest first; ties broken by oldest review (most stale).
  due.sort((a, b) => (b.waBeforeAc - a.waBeforeAc) || (b.daysSinceReview - a.daysSinceReview));
  res.json({ ok: true, items: due.slice(0, 8) });
}));

// GET /api/stats/mistakes
// The Mistake Notebook: every problem's mistakes.md (written by the
// Learning-from-WA flow) collected into one reviewable list, newest first.
router.get("/mistakes", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems(); // already updatedAt desc
  const items = [];
  for (const s of summaries) {
    const file = path.join(fileStore.problemDir(s.id), "mistakes.md");
    if (!(await fileStore.pathExists(file))) continue;
    const content = await fileStore.readText(file, "");
    if (!content.trim()) continue;
    items.push({
      id: s.id,
      title: s.title,
      topic: s.topic || "",
      lastVerdict: s.lastVerdict || null,
      updatedAt: s.updatedAt,
      content
    });
  }
  res.json({ ok: true, items });
}));

module.exports = router;
