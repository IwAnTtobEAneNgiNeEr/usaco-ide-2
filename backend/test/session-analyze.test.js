"use strict";

// Tests for Game Review's pure analysis core (README-LOOPS.md tasks C1/C2).
// Input is exactly the shape recorder.readEvents() returns: [{ t, type, data }].
// Score formula is published (computeProcessScore returns its own `formula`
// string) and kept to signals we ACTUALLY record today: manual test-before-
// submit ("run" events), repeated no-progress WA (same `passed` count twice
// in a row), and how much of the session was spent after a failing verdict.
// "Read the statement before coding" is deliberately NOT scored in v1 — there
// is no open-statement event wired yet, and a fabricated term would violate
// the project's evidence-only rule.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  splitSessions,
  analyzeSession,
  computeProcessScore,
  buildNotes,
} = require("../src/gamereview/session-analyze");

// ---- splitSessions -----------------------------------------------------------------

test("splitSessions groups events and breaks on a large idle gap", () => {
  const events = [
    { t: 0, type: "verdict", data: { verdict: "WA" } },
    { t: 1000, type: "run", data: {} },
    { t: 2000, type: "verdict", data: { verdict: "AC" } },
    { t: 10000, type: "verdict", data: { verdict: "WA" } }, // gap of 8000 > 5000
    { t: 11000, type: "verdict", data: { verdict: "AC" } },
  ];
  const sessions = splitSessions(events, { idleGapMs: 5000 });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].length, 3);
  assert.equal(sessions[1].length, 2);
});

test("splitSessions sorts out-of-order events by time first", () => {
  const events = [
    { t: 2000, type: "verdict", data: { verdict: "AC" } },
    { t: 0, type: "verdict", data: { verdict: "WA" } },
  ];
  const sessions = splitSessions(events, { idleGapMs: 5000 });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0][0].t, 0);
});

test("splitSessions on an empty event list returns no sessions", () => {
  assert.deepEqual(splitSessions([]), []);
});

// ---- computeProcessScore (pure arithmetic, weights are part of the public contract) --

test("computeProcessScore publishes its formula alongside the score", () => {
  const result = computeProcessScore({ manualTestRate: 0, repeatedNoProgressCount: 0, debugRatio: 0 });
  assert.equal(typeof result.formula, "string");
  assert.ok(result.formula.length > 0);
});

test("computeProcessScore rewards manual testing and a clean debug ratio up to 100", () => {
  const result = computeProcessScore({ manualTestRate: 1, repeatedNoProgressCount: 0, debugRatio: 0 });
  assert.equal(result.value, 100); // raw 120, clamped
});

test("computeProcessScore penalizes repeated no-progress WA and a heavy debug ratio", () => {
  // raw = 100 + 20*0 - 15*min(1,3) - 25*max(0, 1.0-0.6) = 100 - 15 - 10 = 75
  const result = computeProcessScore({ manualTestRate: 0, repeatedNoProgressCount: 1, debugRatio: 1.0 });
  assert.equal(result.value, 75);
});

test("computeProcessScore never leaves the [0,100] range even for out-of-formula inputs", () => {
  const bad = computeProcessScore({ manualTestRate: 0, repeatedNoProgressCount: 10, debugRatio: 5 });
  assert.equal(bad.value, 0);
  const good = computeProcessScore({ manualTestRate: 3, repeatedNoProgressCount: 0, debugRatio: 0 });
  assert.equal(good.value, 100);
});

// ---- analyzeSession: signal extraction from a realistic event timeline --------------

test("analyzeSession: manual test before each submit + no repeats scores 100", () => {
  const events = [
    { t: 0, type: "run", data: { verdict: "WA" } },
    { t: 1000, type: "verdict", data: { verdict: "WA", passed: 2, total: 5, timeMs: 50 } },
    { t: 2000, type: "run", data: { verdict: "AC" } },
    { t: 3000, type: "verdict", data: { verdict: "AC", passed: 5, total: 5, timeMs: 60 } },
  ];
  const analysis = analyzeSession(events);
  assert.equal(analysis.attempts, 2);
  assert.equal(analysis.acAt, 3000);
  assert.equal(analysis.manualTestRate, 1);
  assert.equal(analysis.repeatedNoProgressCount, 0);
  assert.equal(analysis.score.value, 100);
});

test("analyzeSession: no manual tests + repeated identical WA + long debugging scores 75", () => {
  const events = [
    { t: 0, type: "verdict", data: { verdict: "WA", passed: 1, total: 5, timeMs: 50 } },
    { t: 100000, type: "verdict", data: { verdict: "WA", passed: 1, total: 5, timeMs: 50 } },
    { t: 200000, type: "verdict", data: { verdict: "AC", passed: 5, total: 5, timeMs: 55 } },
  ];
  const analysis = analyzeSession(events);
  assert.equal(analysis.attempts, 3);
  assert.equal(analysis.manualTestRate, 0);
  assert.equal(analysis.repeatedNoProgressCount, 1);
  assert.equal(Math.round(analysis.debugRatio * 100) / 100, 1);
  assert.equal(analysis.score.value, 75);
});

test("analyzeSession: verdicts after the AC don't count toward the score", () => {
  const events = [
    { t: 0, type: "verdict", data: { verdict: "WA", passed: 1, total: 5 } },
    { t: 1000, type: "verdict", data: { verdict: "AC", passed: 5, total: 5 } },
    { t: 2000, type: "verdict", data: { verdict: "WA", passed: 1, total: 5 } }, // re-submit after AC — ignored
  ];
  const analysis = analyzeSession(events);
  assert.equal(analysis.attempts, 2);
  assert.equal(analysis.acAt, 1000);
});

test("analyzeSession: never-ACed session still scores what happened so far", () => {
  const events = [
    { t: 0, type: "verdict", data: { verdict: "WA", passed: 1, total: 5 } },
    { t: 5000, type: "verdict", data: { verdict: "WA", passed: 3, total: 5 } },
  ];
  const analysis = analyzeSession(events);
  assert.equal(analysis.acAt, null);
  assert.equal(analysis.attempts, 2);
  assert.equal(analysis.repeatedNoProgressCount, 0); // passed changed 1 -> 3, not a repeat
});

test("analyzeSession: no verdict events yields a null score, not a crash", () => {
  const analysis = analyzeSession([{ t: 0, type: "run", data: {} }]);
  assert.equal(analysis.attempts, 0);
  assert.equal(analysis.score, null);
});

// ---- buildNotes: every line must trace back to a real field ------------------------

test("buildNotes flags first-try AC", () => {
  const notes = buildNotes({ attempts: 1, acAt: 1000, manualTestRate: 1, repeatedNoProgressCount: 0, debugRatio: 0 });
  assert.ok(notes.some((n) => n.includes("lần nộp đầu tiên")));
});

test("buildNotes flags zero manual testing, repeated no-progress, and heavy debugging together", () => {
  const notes = buildNotes({ attempts: 3, acAt: null, manualTestRate: 0, repeatedNoProgressCount: 2, debugRatio: 0.9 });
  assert.ok(notes.some((n) => n.includes("test tay")));
  assert.ok(notes.some((n) => n.includes("2 lần nộp liên tiếp")));
  assert.ok(notes.some((n) => n.includes("gỡ lỗi")));
  assert.ok(notes.some((n) => n.includes("chưa AC")));
});

test("buildNotes on zero attempts returns a single neutral line", () => {
  assert.deepEqual(buildNotes({ attempts: 0 }), ["Chưa có lần nộp nào để tổng kết."]);
});

test("analyzeSession: timeline entries carry manualTestBeforeSubmit per attempt", () => {
  const events = [
    { t: 0, type: "verdict", data: { verdict: "WA", passed: 1, total: 5 } }, // no run before it
    { t: 500, type: "run", data: {} },
    { t: 1000, type: "verdict", data: { verdict: "AC", passed: 5, total: 5 } },
  ];
  const analysis = analyzeSession(events);
  assert.equal(analysis.timeline[0].manualTestBeforeSubmit, false);
  assert.equal(analysis.timeline[1].manualTestBeforeSubmit, true);
});
