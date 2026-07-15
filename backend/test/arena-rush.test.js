"use strict";

// Tests for arena/rush.js — pure state machine + selection core of "Sới Đập
// Lỗi" (Bug Rush). Fixture-only, no fs.

const test = require("node:test");
const assert = require("node:assert/strict");

const rush = require("../src/arena/rush");

// ---- defaultRun / startRun ---------------------------------------------------

test("defaultRun: idle, full lives, level 1, nothing in flight", () => {
  const r = rush.defaultRun();
  assert.equal(r.state, "idle");
  assert.equal(r.lives, 3);
  assert.equal(r.score, 0);
  assert.equal(r.level, 1);
  assert.equal(r.currentDrill, null);
  assert.equal(r.deadlineAt, null);
});

test("startRun: active, resets everything even if called mid-something", () => {
  const r = rush.startRun(1000);
  assert.equal(r.state, "active");
  assert.equal(r.lives, 3);
  assert.equal(r.score, 0);
  assert.equal(r.level, 1);
  assert.equal(r.startedAt, 1000);
});

// ---- timeLimitForLevel / difficultyLabelForLevel -----------------------------

test("timeLimitForLevel: starts at maxTimeMs, shrinks, floors at minTimeMs", () => {
  assert.equal(rush.timeLimitForLevel(1), 60000);
  assert.equal(rush.timeLimitForLevel(2), 55000);
  assert.equal(rush.timeLimitForLevel(9), 20000);
  assert.equal(rush.timeLimitForLevel(10), 15000);
  assert.equal(rush.timeLimitForLevel(50), 15000, "never goes below the floor");
});

test("difficultyLabelForLevel: easy -> medium -> hard -> expert as level rises", () => {
  assert.equal(rush.difficultyLabelForLevel(1), "easy");
  assert.equal(rush.difficultyLabelForLevel(2), "easy");
  assert.equal(rush.difficultyLabelForLevel(3), "medium");
  assert.equal(rush.difficultyLabelForLevel(5), "medium");
  assert.equal(rush.difficultyLabelForLevel(6), "hard");
  assert.equal(rush.difficultyLabelForLevel(8), "hard");
  assert.equal(rush.difficultyLabelForLevel(9), "expert");
  assert.equal(rush.difficultyLabelForLevel(999), "expert");
});

// ---- assignDrill --------------------------------------------------------------

test("assignDrill: sets currentDrill and a deadline based on the run's level", () => {
  const run = rush.startRun(1000);
  const drill = { id: "d1", tag: "off-by-one" };
  const out = rush.assignDrill(run, { drill, now: 1000 });
  assert.equal(out.currentDrill, drill);
  assert.equal(out.deadlineAt, 1000 + 60000);
});

test("assignDrill: a no-op on a non-active run", () => {
  const idle = rush.defaultRun();
  const out = rush.assignDrill(idle, { drill: { id: "x" }, now: 1000 });
  assert.equal(out, idle);
});

// ---- resolveAttempt -------------------------------------------------------------

function activeRunWithDrill(overrides = {}) {
  const run = rush.startRun(0);
  return rush.assignDrill(run, { drill: { id: "d1", tag: "off-by-one" }, now: 0, ...overrides });
}

test("resolveAttempt: correct + on-time scores, escalates the level, clears the drill", () => {
  const run = activeRunWithDrill();
  const { run: out, outcome } = rush.resolveAttempt(run, { correct: true, now: 1000 });
  assert.equal(outcome, "correct");
  assert.equal(out.score, 1);
  assert.equal(out.level, 2);
  assert.equal(out.lives, 3, "a correct answer never costs a life");
  assert.equal(out.currentDrill, null);
  assert.equal(out.deadlineAt, null);
});

test("resolveAttempt: wrong (but on-time) costs a life, does NOT change the level", () => {
  const run = activeRunWithDrill();
  const { run: out, outcome } = rush.resolveAttempt(run, { correct: false, now: 1000 });
  assert.equal(outcome, "wrong");
  assert.equal(out.lives, 2);
  assert.equal(out.level, 1, "a miss never drops OR raises the level");
  assert.equal(out.score, 0);
});

test("resolveAttempt: correct but submitted AFTER the deadline is a timeout, not a win", () => {
  const run = activeRunWithDrill(); // deadlineAt = 0 + 60000
  const { run: out, outcome } = rush.resolveAttempt(run, { correct: true, now: 60001 });
  assert.equal(outcome, "timeout");
  assert.equal(out.lives, 2, "a timeout costs a life exactly like a wrong answer");
  assert.equal(out.score, 0, "never scored, no matter how correct the LATE code was");
});

test("resolveAttempt: the third miss ends the run (state 'over', finishedAt set)", () => {
  let run = activeRunWithDrill();
  run = rush.resolveAttempt(run, { correct: false, now: 100 }).run; // lives 2
  run = rush.assignDrill(run, { drill: { id: "d2", tag: "bien-tran" }, now: 100 });
  run = rush.resolveAttempt(run, { correct: false, now: 200 }).run; // lives 1
  run = rush.assignDrill(run, { drill: { id: "d3", tag: "canh-bien" }, now: 200 });
  const { run: out, outcome } = rush.resolveAttempt(run, { correct: false, now: 300 }); // lives 0
  assert.equal(outcome, "wrong");
  assert.equal(out.lives, 0);
  assert.equal(out.state, "over");
  assert.equal(out.finishedAt, 300);
  assert.equal(out.currentDrill, null);
});

test("resolveAttempt: level is capped at RUSH.maxLevel even on a long correct streak", () => {
  let run = activeRunWithDrill();
  for (let i = 0; i < 20; i++) {
    run = rush.resolveAttempt(run, { correct: true, now: i }).run;
    run = rush.assignDrill(run, { drill: { id: `d${i}`, tag: "off-by-one" }, now: i });
  }
  assert.equal(run.level, 12);
});

test("resolveAttempt: a no-op when the run isn't active (idle or already over)", () => {
  const idle = rush.defaultRun();
  assert.deepEqual(rush.resolveAttempt(idle, { correct: true, now: 1 }), { run: idle, outcome: null });
});

// ---- chooseTargetTag ------------------------------------------------------------

test("chooseTargetTag: never returns 'khac' (not a real catchable species)", () => {
  for (let i = 0; i < 50; i++) {
    const tag = rush.chooseTargetTag([], { randomFn: () => i / 50 });
    assert.notEqual(tag, "khac");
    assert.ok(rush.SPECIES_TAGS.includes(tag));
  }
});

test("chooseTargetTag: with no history, every species is reachable (uniform base weight)", () => {
  const seen = new Set();
  for (let i = 0; i < rush.SPECIES_TAGS.length; i++) {
    seen.add(rush.chooseTargetTag([], { randomFn: () => (i + 0.5) / rush.SPECIES_TAGS.length }));
  }
  assert.equal(seen.size, rush.SPECIES_TAGS.length, "every species must be reachable with no recurringBugs history");
});

test("chooseTargetTag: deterministic given a fixed randomFn", () => {
  const a = rush.chooseTargetTag([{ tag: "off-by-one", count: 5 }], { randomFn: () => 0.3 });
  const b = rush.chooseTargetTag([{ tag: "off-by-one", count: 5 }], { randomFn: () => 0.3 });
  assert.equal(a, b);
});

test("chooseTargetTag: a heavily recurring bug dominates a much wider slice of the weight space", () => {
  const bugs = [{ tag: "off-by-one", count: 1000 }];
  // near the very end of the roll (randomFn close to 1) should still land on the
  // dominant tag, since it owns almost the entire weight mass.
  const tag = rush.chooseTargetTag(bugs, { randomFn: () => 0.99 });
  assert.equal(tag, "off-by-one");
});

// ---- wrong-keeps-drill + progressive hints (Debug tốc độ redesign) --------------

test("resolveAttempt: WRONG with lives left keeps the SAME drill and deadline (no reveal-and-skip)", () => {
  const drill = { id: "d1", buggyCode: "x", tests: [], bugSummary: "s", tag: "off-by-one" };
  let run = rush.assignDrill(rush.startRun(1000), { drill, now: 1000 });
  const deadline = run.deadlineAt;
  const { run: after, outcome } = rush.resolveAttempt(run, { correct: false, now: 2000 });
  assert.equal(outcome, "wrong");
  assert.equal(after.lives, 2);
  assert.equal(after.currentDrill, drill, "the drill must stay in play");
  assert.equal(after.deadlineAt, deadline, "the clock must not reset on a wrong submit");
});

test("resolveAttempt: TIMEOUT still discards the drill (moves on)", () => {
  const drill = { id: "d1", buggyCode: "x", tests: [] };
  const run = rush.assignDrill(rush.startRun(1000), { drill, now: 1000 });
  const { run: after, outcome } = rush.resolveAttempt(run, { correct: true, now: run.deadlineAt + 1 });
  assert.equal(outcome, "timeout");
  assert.equal(after.currentDrill, null);
});

test("resolveAttempt: WRONG on the last life ends the run", () => {
  const drill = { id: "d1" };
  let run = { ...rush.assignDrill(rush.startRun(1000), { drill, now: 1000 }), lives: 1 };
  const { run: after, outcome } = rush.resolveAttempt(run, { correct: false, now: 2000 });
  assert.equal(outcome, "wrong");
  assert.equal(after.state, "over");
});

test("useHint: level 1 is free, level 2 costs 1 điểm, capped at 2", () => {
  const drill = { id: "d1" };
  let run = { ...rush.assignDrill(rush.startRun(1000), { drill, now: 1000 }), score: 3 };
  const h1 = rush.useHint(run);
  assert.equal(h1.level, 1);
  assert.equal(h1.run.score, 3, "hint 1 must be free");
  const h2 = rush.useHint(h1.run);
  assert.equal(h2.level, 2);
  assert.equal(h2.run.score, 2, "hint 2 must cost 1 điểm");
  const h3 = rush.useHint(h2.run);
  assert.equal(h3.level, 2, "hints are capped at level 2");
  assert.equal(h3.run.score, 2, "a capped re-ask must not charge again");
});

test("useHint: level-2 cost never drives score below 0", () => {
  const drill = { id: "d1" };
  let run = rush.assignDrill(rush.startRun(1000), { drill, now: 1000 });
  run = rush.useHint(run).run;
  run = rush.useHint(run).run;
  assert.equal(run.score, 0);
});

test("assignDrill: a fresh drill resets hintLevel", () => {
  const run = { ...rush.assignDrill(rush.startRun(1000), { drill: { id: "d1" }, now: 1000 }), hintLevel: 2 };
  const next = rush.assignDrill(run, { drill: { id: "d2" }, now: 5000 });
  assert.equal(next.hintLevel, 0);
});
