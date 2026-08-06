"use strict";

const { tagLabel } = require("./moment/diagnose");

// planner.js — pure core of "Giáo Án Động" (Flagship 3, README-LOOPS.md D1 /
// README-AUTOPILOT.md M8). Composes ONE session plan from ingredients that
// already exist elsewhere in the app:
//
//   reviewQueue      — spaced-repetition, due today (reviewQueue.js) — the
//                      cheapest way to fight forgetting, so it goes first.
//   recurringBugs    — Student Model (studentModel.js), now fed real data by
//                      the Khoảnh Khắc autopilot — one quiz seed per bug tag,
//                      checking whether last week's lesson actually stuck.
//   skillFrontier    — the weakest topics the student has ACTUALLY attempted.
//                      Passed in already-derived from /api/stats/skills — this
//                      module does not recompute tiers/mastery itself
//                      (README-LOOPS.md §3.3: "KHÔNG nhân đôi nguồn sự thật").
//   candidateProblems — unsolved problems, for quota once frontier picks run out.
//
// Deterministic greedy fill within budgetMinutes, in that exact priority
// order. No fs, no Express, no Date.now() — every input is already computed
// by the caller, so this is trivially fixture-testable (README-LOOPS.md D1:
// "Deterministic, có test với fixture").
//
// NOTE for whoever wires the UI (D2): there is no "Flash Quiz" feature to
// launch today — frontend/styles/journey.css has leftover .quiz-* CSS and
// index.html's help text mentions one, but no JS implements it. This module
// still emits `kind: "quiz"` items (the recurring-bug seed is real and
// useful data) — it just describes what SHOULD happen; building the actual
// quiz UI is separate, future work.

const REVIEW_MIN = 15; // re-solving a known problem is faster than a fresh one
const QUIZ_MIN = 5;    // a 3-question recall check
const NEW_MIN = { easy: 20, medium: 35, hard: 55, unrated: 30 };
const MAX_REVIEWS = 3; // a session shouldn't be ALL review
const MAX_QUIZZES = 2;

function newProblemMinutes(difficulty) {
  return NEW_MIN[difficulty] || NEW_MIN.unrated;
}

/**
 * @param {object} opts
 * @param {Array} opts.reviewQueue - computeReviewQueue() output, hardest-first
 * @param {Array} opts.recurringBugs - Student Model recurringBugs (tag/count/lastSeen/evidence)
 * @param {Array} opts.skillFrontier - weakest-first topic names (string) or {topic} objects
 * @param {Array} opts.candidateProblems - unsolved problems {id,title,topic,difficulty}
 * @param {number} opts.budgetMinutes - user-set session length
 * @returns {{items: object[], totalMinutes: number, budgetMinutes: number, remainingMinutes: number}}
 */
function composeSession({
  reviewQueue = [],
  recurringBugs = [],
  skillFrontier = [],
  candidateProblems = [],
  budgetMinutes = 45,
} = {}) {
  const budget = Math.max(0, Number(budgetMinutes) || 0);
  const items = [];
  let used = 0;
  const fits = (min) => used + min <= budget;
  const usedProblemIds = new Set();

  // 1) Recurring-bug quiz seeds — the 5-minute warm-up, most-frequent bug
  // first. Seated BEFORE reviews on purpose: at 15'/review a 45' budget is
  // gone after three reviews and the cheapest, highest-retention item would
  // starve (found live: real plan had 3 reviews = 45/45, quiz squeezed out).
  // Starting a session with recall of your own past bugs is also just good
  // pedagogy — it's how Duolingo opens a session.
  const sortedBugs = [...recurringBugs].sort((a, b) => (b.count || 0) - (a.count || 0));
  for (const bug of sortedBugs.slice(0, MAX_QUIZZES)) {
    if (!fits(QUIZ_MIN)) break;
    items.push({
      kind: "quiz",
      tag: bug.tag,
      reason: `khởi động · lỗi "${tagLabel(bug.tag)}" đã gặp ${bug.count || 0} lần, gần nhất ${bug.lastSeen || "?"}`,
      estMinutes: QUIZ_MIN,
    });
    used += QUIZ_MIN;
  }

  // 2) Reviews due today — homogeneous cost, so if one doesn't fit none will.
  for (const r of reviewQueue.slice(0, MAX_REVIEWS)) {
    if (!fits(REVIEW_MIN)) break;
    items.push({
      kind: "review",
      id: r.id,
      title: r.title || r.id,
      reason: `đến hạn ôn (lần ${(r.reviewCount || 0) + 1}) · từng WA ${r.waBeforeAc || 0} lần trước khi AC`,
      estMinutes: REVIEW_MIN,
    });
    used += REVIEW_MIN;
    usedProblemIds.add(r.id);
  }

  // 3) New problems from the weakest ATTEMPTED topics (frontier). Costs vary
  // by difficulty, so a topic that doesn't fit shouldn't block a cheaper one
  // further down the (already weakest-first) list.
  for (const entry of skillFrontier) {
    const topicName = typeof entry === "string" ? entry : entry && entry.topic;
    if (!topicName) continue;
    const pick = candidateProblems.find(
      (p) => !usedProblemIds.has(p.id) && String(p.topic || "").toLowerCase() === String(topicName).toLowerCase()
    );
    if (!pick) continue;
    const min = newProblemMinutes(pick.difficulty);
    if (!fits(min)) continue;
    items.push({
      kind: "new",
      id: pick.id,
      title: pick.title || pick.id,
      reason: `chủ đề đang yếu: ${topicName}`,
      estMinutes: min,
    });
    used += min;
    usedProblemIds.add(pick.id);
  }

  // 4) Generic quota — cheapest-first so a tight budget still fits one more.
  const remaining = candidateProblems
    .filter((p) => !usedProblemIds.has(p.id))
    .sort((a, b) => newProblemMinutes(a.difficulty) - newProblemMinutes(b.difficulty));
  for (const p of remaining) {
    const min = newProblemMinutes(p.difficulty);
    if (!fits(min)) continue;
    items.push({ kind: "new", id: p.id, title: p.title || p.id, reason: "bài mới", estMinutes: min });
    used += min;
    usedProblemIds.add(p.id);
  }

  return { items, totalMinutes: used, budgetMinutes: budget, remainingMinutes: Math.max(0, budget - used) };
}

module.exports = { composeSession, REVIEW_MIN, QUIZ_MIN, NEW_MIN, MAX_REVIEWS, MAX_QUIZZES };
