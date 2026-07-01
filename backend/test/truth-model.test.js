"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const truth = require("../src/truthModel");

test("legacy solved status migrates without mixing workflow and verdict", () => {
  const value = truth.syncLifecycle({ status: "solved", history: [] });
  assert.equal(value.workflowState, "learning");
  assert.equal(value.verdictState, "solved");
  assert.equal(value.status, "solved");
  assert.equal(value.firstAcceptedAt, null);
});

test("an AC remains solved after a later WA", () => {
  const value = truth.syncLifecycle({
    status: "learning",
    lastVerdict: "WA",
    history: [
      { at: "2026-01-02T00:00:00.000Z", verdict: "WA" },
      { at: "2026-01-01T00:00:00.000Z", verdict: "AC" }
    ]
  });
  assert.equal(value.verdictState, "solved");
  assert.equal(value.lastVerdict, "WA");
  assert.equal(value.firstAcceptedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(value.attemptCount, 2);
});

test("review is workflow intent and does not manufacture an acceptance", () => {
  const value = truth.syncLifecycle({ status: "review", history: [] });
  assert.equal(value.workflowState, "reviewing");
  assert.equal(value.verdictState, "unsolved");
  assert.equal(value.status, "review");
});
