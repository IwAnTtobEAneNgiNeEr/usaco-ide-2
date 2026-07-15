"use strict";

// Tests for arena/bossCase.js — pure core, no fs. Mirrors the "Đối Thủ v1"
// rule: a counterexample only becomes a NAMED Boss once it has broken the
// student's code at least twice on the SAME problem (never a one-off fluke).

const test = require("node:test");
const assert = require("node:assert/strict");

const bossCase = require("../src/arena/bossCase");

test("recordFailure on a brand new input creates one case, not yet promoted", () => {
  const { cases, entry, justPromoted } = bossCase.recordFailure([], {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "2026-07-07T00:00:00.000Z",
  });
  assert.equal(cases.length, 1);
  assert.equal(entry.count, 1);
  assert.equal(entry.promoted, false);
  assert.equal(justPromoted, false);
});

test("the SAME minimal input recurring bumps the same case's count", () => {
  const first = bossCase.recordFailure([], {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "2026-07-07T00:00:00.000Z",
  });
  const second = bossCase.recordFailure(first.cases, {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "2026-07-08T00:00:00.000Z",
  });
  assert.equal(second.cases.length, 1); // still one distinct case
  assert.equal(second.entry.count, 2);
  assert.equal(second.entry.firstSeenAt, "2026-07-07T00:00:00.000Z");
  assert.equal(second.entry.lastSeenAt, "2026-07-08T00:00:00.000Z");
});

test("a case is promoted to Boss exactly when count reaches 2, not before", () => {
  const first = bossCase.recordFailure([], {
    minimalInput: "0", kind: "TLE", expected: "", got: "", now: "2026-07-07T00:00:00.000Z",
  });
  assert.equal(first.entry.promoted, false);
  assert.equal(first.justPromoted, false);

  const second = bossCase.recordFailure(first.cases, {
    minimalInput: "0", kind: "TLE", expected: "", got: "", now: "2026-07-08T00:00:00.000Z",
  });
  assert.equal(second.entry.promoted, true);
  assert.equal(second.justPromoted, true); // fires exactly once, on the crossing

  const third = bossCase.recordFailure(second.cases, {
    minimalInput: "0", kind: "TLE", expected: "", got: "", now: "2026-07-09T00:00:00.000Z",
  });
  assert.equal(third.entry.promoted, true);
  assert.equal(third.justPromoted, false); // already promoted — no re-fire
});

test("different minimal inputs on the same problem are distinct cases", () => {
  const first = bossCase.recordFailure([], {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "2026-07-07T00:00:00.000Z",
  });
  const second = bossCase.recordFailure(first.cases, {
    minimalInput: "0", kind: "RE", expected: "0", got: "", now: "2026-07-07T00:00:00.000Z",
  });
  assert.equal(second.cases.length, 2);
});

test("whitespace-only differences hash to the same case (canonical trim)", () => {
  const first = bossCase.recordFailure([], {
    minimalInput: "3\n1 2 3\n", kind: "WA", expected: "6", got: "5", now: "t1",
  });
  const second = bossCase.recordFailure(first.cases, {
    minimalInput: "  3\n1 2 3  ", kind: "WA", expected: "6", got: "5", now: "t2",
  });
  assert.equal(second.cases.length, 1);
  assert.equal(second.entry.count, 2);
});

test("nameFor produces a stable, deterministic label per kind", () => {
  const a = bossCase.nameFor("WA", "abcd1234");
  const b = bossCase.nameFor("WA", "abcd1234");
  assert.equal(a, b);
  assert.match(a, /abcd/);
  assert.notEqual(bossCase.nameFor("TLE", "abcd1234"), bossCase.nameFor("WA", "abcd1234"));
});

test("PROMOTE_THRESHOLD is exported and equals 2", () => {
  assert.equal(bossCase.PROMOTE_THRESHOLD, 2);
});
