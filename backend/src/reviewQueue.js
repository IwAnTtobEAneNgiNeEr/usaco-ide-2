"use strict";

// reviewQueue.js — spaced-repetition core, extracted from the inline logic in
// routes/stats.js's GET /review-queue (byte-for-byte same behavior) so the
// Giáo Án Động planner (Flagship 3) can reuse the exact due-date rule instead
// of re-deriving it and risking the two copies drifting apart.
//
//   - waBeforeAc = WA runs that happened BEFORE the first AC (proxy for "how
//     hard was this for the student?"). Counted chronologically.
//   - daysSinceAc = days since the first AC entry.
//   - reviewCount = how many times the student has marked "Đã ôn" (lives in
//     meta.reviewCount; absent → 0).
//   - Due when daysSinceLastReview >= REVIEW_INTERVALS[reviewCount] (capped at
//     the last interval). lastReviewedAt defaults to firstAcAt.
//
// Pure: no fs, no Express — takes the already-loaded metas array.

const REVIEW_INTERVALS = [3, 7, 21, 60]; // days
const MS_PER_DAY = 86400000;

/**
 * The shared interval engine — due when daysSince(lastEventAt) >=
 * REVIEW_INTERVALS[eventCount] (capped at the last interval). Extracted so
 * cardStore.js's Flash Quiz training queue and this file's problem review
 * queue age off the exact SAME [3,7,21,60] clock instead of each re-deriving
 * it (two copies risk drifting apart — the same reasoning this file's header
 * already gives for existing at all).
 *
 * `lastEventAt` accepts either an ISO string or an epoch-ms number.
 */
function dueStatus({ lastEventAt, eventCount, now = Date.now() }) {
  const count = Number(eventCount) > 0 ? Math.floor(Number(eventCount)) : 0;
  const lastMs = typeof lastEventAt === "number" ? lastEventAt : Date.parse(lastEventAt);
  const daysSince = (now - lastMs) / MS_PER_DAY;
  const intervalDays = REVIEW_INTERVALS[Math.min(count, REVIEW_INTERVALS.length - 1)];
  return { due: daysSince >= intervalDays, daysSince: Math.floor(daysSince), intervalDays };
}

/** Ranked hardest-first (most WA before AC), ties broken by staleness. Unsliced — cap at the call site. */
function computeReviewQueue(metas, opts = {}) {
  const now = opts.now || Date.now();
  const list = Array.isArray(metas) ? metas : [];
  const due = [];

  for (const m of list) {
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
    const status = dueStatus({ lastEventAt: lastReviewedAt, eventCount: reviewCount, now });
    if (!status.due) continue;

    due.push({
      id: m.id,
      title: m.title || m.id,
      topic: m.topic || "",
      tags: m.tags || [],
      waBeforeAc,
      daysSinceAc: Math.floor((now - firstAcAt) / MS_PER_DAY),
      daysSinceReview: status.daysSince,
      reviewCount,
      nextIntervalDays: status.intervalDays,
    });
  }

  due.sort((a, b) => (b.waBeforeAc - a.waBeforeAc) || (b.daysSinceReview - a.daysSinceReview));
  return due;
}

module.exports = { computeReviewQueue, REVIEW_INTERVALS, dueStatus };
