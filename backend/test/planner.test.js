"use strict";

// Tests for planner.js — pure core of Giáo Án Động (README-LOOPS.md D1,
// README-AUTOPILOT.md M8). Pure fixtures only, no fs/AI — matches this
// codebase's session-analyze.js/reviewQueue.js testing convention.

const test = require("node:test");
const assert = require("node:assert/strict");
const { composeSession, REVIEW_MIN, QUIZ_MIN, NEW_MIN, MAX_REVIEWS, MAX_QUIZZES } = require("../src/planner");

function reviewItem(id, overrides = {}) {
  return { id, title: `Bài ${id}`, topic: "graph", waBeforeAc: 2, reviewCount: 0, ...overrides };
}
function bug(tag, count, lastSeen = "2026-07-01") {
  return { tag, count, lastSeen, evidence: [`problems/x/moment/1.json`] };
}
function problem(id, topic, difficulty = "medium") {
  return { id, title: `Bài ${id}`, topic, difficulty };
}

test("empty everything → empty plan, full budget remains", () => {
  const plan = composeSession({ budgetMinutes: 60 });
  assert.deepEqual(plan.items, []);
  assert.equal(plan.totalMinutes, 0);
  assert.equal(plan.budgetMinutes, 60);
  assert.equal(plan.remainingMinutes, 60);
});

test("reviews come first, in the order given (already hardest-first from reviewQueue)", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("r1"), reviewItem("r2")],
    budgetMinutes: 60,
  });
  assert.equal(plan.items.length, 2);
  assert.deepEqual(plan.items.map((i) => i.kind), ["review", "review"]);
  assert.deepEqual(plan.items.map((i) => i.id), ["r1", "r2"]);
  assert.equal(plan.items[0].estMinutes, REVIEW_MIN);
  assert.equal(plan.totalMinutes, REVIEW_MIN * 2);
});

test("reviews are capped at MAX_REVIEWS even when more are due", () => {
  const queue = Array.from({ length: 10 }, (_, i) => reviewItem(`r${i}`));
  const plan = composeSession({ reviewQueue: queue, budgetMinutes: 1000 });
  const reviews = plan.items.filter((i) => i.kind === "review");
  assert.equal(reviews.length, MAX_REVIEWS);
});

test("a review that doesn't fit the remaining budget is skipped, not overfilled", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("r1"), reviewItem("r2")],
    budgetMinutes: REVIEW_MIN + 5, // room for one review, not two
  });
  assert.equal(plan.items.length, 1);
  assert.ok(plan.totalMinutes <= plan.budgetMinutes);
});

test("recurring bugs become quiz seeds, most-frequent first, capped at MAX_QUIZZES", () => {
  const plan = composeSession({
    recurringBugs: [bug("off-by-one", 2), bug("bien-tran", 7), bug("do-phuc-tap", 4)],
    budgetMinutes: 60,
  });
  const quizzes = plan.items.filter((i) => i.kind === "quiz");
  assert.equal(quizzes.length, MAX_QUIZZES);
  assert.deepEqual(quizzes.map((q) => q.tag), ["bien-tran", "do-phuc-tap"]); // 7, then 4 — not the 2
  assert.ok(quizzes[0].reason.includes("7 lần"));
});

test("frontier topics pick a matching unsolved problem each, cost varies by difficulty", () => {
  const plan = composeSession({
    skillFrontier: ["graph", "dp"],
    candidateProblems: [problem("p1", "graph", "easy"), problem("p2", "dp", "hard"), problem("p3", "graph", "medium")],
    budgetMinutes: 100,
  });
  const news = plan.items.filter((i) => i.kind === "new");
  assert.equal(news.length, 2);
  assert.equal(news[0].id, "p1"); // first graph match, not p3
  assert.equal(news[0].estMinutes, NEW_MIN.easy);
  assert.equal(news[1].id, "p2");
  assert.equal(news[1].estMinutes, NEW_MIN.hard);
  assert.ok(news[0].reason.includes("graph"));
});

test("frontier: a topic with no matching candidate is silently skipped (no crash, no gap item)", () => {
  const plan = composeSession({
    skillFrontier: ["greedy", "graph"],
    candidateProblems: [problem("p1", "graph", "easy")],
    budgetMinutes: 60,
  });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].id, "p1");
});

test("frontier: an expensive topic doesn't block a cheaper LATER frontier topic", () => {
  const plan = composeSession({
    skillFrontier: ["dp", "graph"], // dp is checked first but is expensive
    candidateProblems: [problem("p-dp", "dp", "hard"), problem("p-graph", "graph", "easy")],
    budgetMinutes: NEW_MIN.easy + 2, // not enough for the hard dp problem
  });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].id, "p-graph");
});

test("generic quota fills remaining budget, cheapest problems first", () => {
  const plan = composeSession({
    candidateProblems: [problem("hard1", "x", "hard"), problem("easy1", "x", "easy"), problem("med1", "x", "medium")],
    budgetMinutes: NEW_MIN.easy + NEW_MIN.medium + 1, // fits easy+medium, not hard
  });
  const ids = plan.items.map((i) => i.id);
  assert.deepEqual(ids, ["easy1", "med1"]);
});

test("a problem already claimed by review/frontier is never double-booked into the generic quota", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("shared")],
    candidateProblems: [problem("shared", "graph", "easy"), problem("other", "graph", "easy")],
    budgetMinutes: 200,
  });
  const ids = plan.items.map((i) => i.id).filter(Boolean);
  assert.equal(ids.filter((id) => id === "shared").length, 1);
  assert.ok(ids.includes("other"));
});

test("zero budget produces zero items regardless of how much is available", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("r1")],
    recurringBugs: [bug("khac", 5)],
    candidateProblems: [problem("p1", "x", "easy")],
    budgetMinutes: 0,
  });
  assert.deepEqual(plan.items, []);
  assert.equal(plan.totalMinutes, 0);
  assert.equal(plan.remainingMinutes, 0);
});

test("deterministic: identical input produces identical output on repeat calls", () => {
  const input = {
    reviewQueue: [reviewItem("r1"), reviewItem("r2")],
    recurringBugs: [bug("bien-tran", 3), bug("off-by-one", 5)],
    skillFrontier: ["graph", "dp"],
    candidateProblems: [problem("p1", "graph", "easy"), problem("p2", "dp", "medium"), problem("p3", "misc", "hard")],
    budgetMinutes: 90,
  };
  const a = composeSession(input);
  const b = composeSession(input);
  assert.deepEqual(a, b);
});

test("full priority order end-to-end with a realistic mixed fixture (quiz = warm-up, first)", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("rev-hard", { waBeforeAc: 4 })],
    recurringBugs: [bug("bien-tran", 6)],
    skillFrontier: ["graph"],
    candidateProblems: [problem("p-graph", "graph", "easy"), problem("p-misc", "misc", "medium")],
    budgetMinutes: REVIEW_MIN + QUIZ_MIN + NEW_MIN.easy + NEW_MIN.medium, // fits everything exactly
  });
  assert.deepEqual(plan.items.map((i) => i.kind), ["quiz", "review", "new", "new"]);
  assert.equal(plan.remainingMinutes, 0);
});

test("quiz warm-up survives a budget that reviews would otherwise consume whole (live-found starvation bug)", () => {
  const plan = composeSession({
    reviewQueue: [reviewItem("r1"), reviewItem("r2"), reviewItem("r3")],
    recurringBugs: [bug("canh-bien", 1)],
    budgetMinutes: 45, // 3 × REVIEW_MIN would eat this exactly — the quiz must be seated first
  });
  assert.equal(plan.items[0].kind, "quiz");
  assert.ok(plan.items.filter((i) => i.kind === "review").length >= 2, "reviews still get most of the session");
  assert.ok(plan.totalMinutes <= 45);
});
