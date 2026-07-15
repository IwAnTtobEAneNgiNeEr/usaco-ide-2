"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const artifact = require("../src/verifiedArtifact");

const AC_CODE = "int main(){return 0;}\n";

test("legacy BFS metadata projects additively without rewriting source/status", () => {
  const value = artifact.buildContract({
    meta: {
      id: "maze",
      title: "Mê cung",
      source: "speedrun 120 bài",
      topic: "bfs",
      difficulty: "easy",
      status: "learning",
      history: [],
    },
    currentCode: AC_CODE,
  });
  assert.equal(value.activityKind, "competitive-problem");
  assert.equal(value.provider, "local");
  assert.equal(value.collection, "speedrun 120 bài");
  assert.equal(value.origin, "imported");
  assert.equal(value.concept, "bfs");
  assert.deepEqual(value.compatibility, { legacySource: "speedrun 120 bài", legacyStatus: "learning" });
});

test("Run AC/OK never creates competitive completion", () => {
  const history = [
    { at: "2026-01-02T00:00:00.000Z", type: "run", verdict: "AC" },
    { at: "2026-01-01T00:00:00.000Z", type: "run", verdict: "OK" },
  ];
  assert.equal(artifact.hasJudgeAcceptance(history), false);
  assert.equal(artifact.hasHistoricalAcceptance({ lastVerdict: "AC", status: "learning", history }), false);
  assert.equal(artifact.deriveStatus({ history, currentCode: AC_CODE }), "in-progress");
});

test("legacy lastVerdict-only AC blocks fake freshness without becoming derivedStatus truth", () => {
  const meta = { lastVerdict: "AC", status: "learning", history: [] };
  assert.equal(artifact.hasHistoricalAcceptance(meta), true);
  assert.equal(artifact.deriveStatus({ history: meta.history, currentCode: AC_CODE }), "unverified");
});

test("legacy untyped AC remains readable but is not current verification without a snapshot", () => {
  const history = [{ at: "2025-01-01T00:00:00.000Z", verdict: "AC" }];
  assert.equal(artifact.hasJudgeAcceptance(history), true);
  assert.equal(artifact.deriveStatus({ history, detailedHistory: [], currentCode: AC_CODE }), "historically-accepted");
});

test("derivedStatus is verified only when current code matches latest Judge AC snapshot", () => {
  const history = [{ id: "run-1", at: "2026-01-01T00:00:00.000Z", type: "judge", verdict: "AC" }];
  const detailedHistory = [{ id: "run-1", at: history[0].at, type: "judge", verdict: "AC", code: AC_CODE }];
  assert.equal(artifact.deriveStatus({ history, detailedHistory, currentCode: AC_CODE }), "verified");
  assert.equal(artifact.deriveStatus({ history, detailedHistory, currentCode: AC_CODE + "// edit" }), "stale");
});

test("latest full Judge failure returns needs-work even when an older AC exists", () => {
  const history = [
    { at: "2026-01-02T00:00:00.000Z", type: "judge", verdict: "WA" },
    { at: "2026-01-01T00:00:00.000Z", type: "judge", verdict: "AC" },
  ];
  assert.equal(artifact.deriveStatus({ history, currentCode: AC_CODE }), "needs-work");
});

test("nextAction exposes exactly one reasoned action for Run, failure, and AC intent", () => {
  const run = artifact.nextAction({ operation: "run", verdict: "AC" });
  assert.equal(run.id, "judge-full-suite");
  assert.match(run.reason, /không tạo completion/);

  const fail = artifact.nextAction({ operation: "judge", verdict: "TLE", evidence: { id: "run-1" } });
  assert.equal(fail.id, "return-to-work");
  assert.deepEqual(fail.evidence, { id: "run-1" });

  const evolve = artifact.nextAction({ operation: "judge", verdict: "AC", intent: "derive-module", evidence: { id: "run-1" } });
  assert.equal(evolve.id, "create-grid-pathfinder");

  const dijkstra = artifact.nextAction({ operation: "judge", verdict: "AC", intent: "derive-module", concept: "dijkstra", evidence: { id: "run-2" } });
  assert.equal(dijkstra.id, "create-weighted-graph-router");
  const prefix = artifact.nextAction({ operation: "judge", verdict: "AC", intent: "derive-module", concept: "prefix sum", evidence: { id: "run-3" } });
  assert.equal(prefix.id, "create-range-sum-module");
  assert.equal(evolve.state, "evolve");

  const legacyEvolve = artifact.nextAction({ operation: "judge", verdict: "AC", intent: "derive-module" });
  assert.equal(legacyEvolve.id, "judge-full-suite");
  assert.match(legacyEvolve.reason, /AC cũ/);
});

test("historical AC contract never reports a fresh win or Rated progress", () => {
  const contract = artifact.buildContract({
    meta: {
      id: "old-ac",
      status: "solved",
      lastVerdict: "AC",
      history: [{ at: "2025-01-01T00:00:00.000Z", type: "judge", verdict: "AC" }],
    },
    detailedHistory: [{ at: "2025-01-01T00:00:00.000Z", type: "judge", verdict: "AC", code: AC_CODE }],
    currentCode: AC_CODE,
  });
  assert.equal(contract.derivedStatus, "verified");
  assert.equal(contract.freshness.freshWin, false);
  assert.equal(contract.freshness.ratedProgress, false);
});
