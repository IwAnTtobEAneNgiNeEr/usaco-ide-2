// module-model.test.mjs — pure-core tests for the standalone module policy
// (Library merge, Route Planner dataset, simulate normalization, reason i18n).
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModules, moduleCta, moduleProvenance, moduleMatchesFilters,
  moduleLocalReasons, visibleModules, currentSuite, pendingChange,
  buildRouteDataset, normalizeSimulateResult, translateReason,
} from "../src/core/module-model.js";

const sample = {
  modules: [
    {
      id: "module:weighted-graph-router", artifactId: "weighted-graph-router",
      title: "WeightedGraphRouter", concept: "dijkstra", provider: "local",
      collection: "applied-algorithms-v1", origin: "catalog", derivedFrom: null,
      derivedStatus: "verified", status: "verified",
      requirement: "Directed non-negative shortest distance and reconstructed path.",
      currentRequirementId: "directed-shortest-path-v1", updatedAt: "2026-07-16T00:00:00.000Z",
    },
    {
      id: "module:range-sum-module", artifactId: "range-sum-module",
      title: "RangeSum", concept: "prefix-sum", derivedStatus: "unverified",
      status: "needs-work", requirement: "Immutable 1D inclusive sums.",
    },
  ],
};

test("normalizeModules keeps valid rows, null on absent route", () => {
  const mods = normalizeModules(sample);
  assert.equal(mods.length, 2);
  assert.equal(mods[0].track, "build");
  assert.equal(mods[0].itemType, "module");
  assert.equal(normalizeModules(null), null);
  assert.equal(normalizeModules({ nope: [] }), null);
  assert.deepEqual(normalizeModules({ modules: [{ bad: true }] }), []);
});

test("moduleCta: one continue verb per state", () => {
  const [verified, needsWork] = normalizeModules(sample);
  assert.equal(moduleCta(verified).intent, "open");
  assert.equal(moduleCta(needsWork).intent, "work");
});

test("moduleProvenance: standalone vs derived", () => {
  const [standalone] = normalizeModules(sample);
  assert.equal(moduleProvenance(standalone).kind, "standalone");
  const derived = { derivedFrom: { problemId: "p1", sourceTitle: "Bài 113" } };
  assert.equal(moduleProvenance(derived).kind, "derived");
  assert.match(moduleProvenance(derived).text, /Bài 113/);
});

test("moduleMatchesFilters: lens, status mapping, search", () => {
  const [verified, needsWork] = normalizeModules(sample);
  assert.equal(moduleMatchesFilters(verified, { track: "build" }), true);
  assert.equal(moduleMatchesFilters(verified, { track: "compete" }), false);
  assert.equal(moduleMatchesFilters(verified, { status: "solved" }), true);
  assert.equal(moduleMatchesFilters(needsWork, { status: "solved" }), false);
  assert.equal(moduleMatchesFilters(needsWork, { status: "learning" }), true);
  assert.equal(moduleMatchesFilters(verified, { status: "review" }), false);
  assert.equal(moduleMatchesFilters(verified, { search: "dijkstra" }), true);
  assert.equal(moduleMatchesFilters(verified, { search: "segment tree" }), false);
  // problem-only filters exclude modules honestly
  assert.equal(moduleMatchesFilters(verified, { source: "Tech28" }), false);
  assert.equal(moduleMatchesFilters(verified, { difficulty: "easy" }), false);
});

test("moduleLocalReasons names the matched field", () => {
  const [verified] = normalizeModules(sample);
  assert.deepEqual(moduleLocalReasons(verified, ""), []);
  assert.match(moduleLocalReasons(verified, "dijkstra")[0], /concept/);
  assert.match(moduleLocalReasons(verified, "router")[0], /tên chứa/);
});

test("visibleModules applies filters over the set", () => {
  const mods = normalizeModules(sample);
  assert.equal(visibleModules(mods, {}).length, 2);
  assert.equal(visibleModules(mods, { status: "solved" }).length, 1);
  assert.equal(visibleModules(mods, { track: "compete" }).length, 0);
});

test("currentSuite/pendingChange follow the requirement list", () => {
  const artifact = {
    currentRequirementId: "base-v1",
    requirements: [
      { id: "base-v1", status: "active" },
      { id: "change-v2", status: "proposed" },
    ],
  };
  assert.equal(currentSuite(artifact), "baseline");
  assert.equal(pendingChange(artifact).id, "change-v2");
  const evolved = { ...artifact, currentRequirementId: "change-v2" };
  assert.equal(currentSuite(evolved), "requirement-change");
  assert.equal(pendingChange(evolved), null);
});

test("buildRouteDataset: contract input shape + server limits mirrored", () => {
  const ok = buildRouteDataset({
    nodeCount: 4,
    edges: [{ from: "0", to: 1, weight: 2 }, { from: 1, to: 3, weight: 5 }],
    source: 0, target: 3,
  });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.input, {
    nodeCount: 4,
    edges: [{ from: 0, to: 1, weight: 2 }, { from: 1, to: 3, weight: 5 }],
    start: 0, target: 3,
  });

  assert.match(buildRouteDataset({ nodeCount: 0, edges: [], source: 0, target: 0 }).error, /1–200/);
  assert.match(buildRouteDataset({ nodeCount: 3, edges: [{ from: 0, to: 9, weight: 1 }], source: 0, target: 1 }).error, /Cạnh 1/);
  assert.match(buildRouteDataset({ nodeCount: 3, edges: [{ from: 0, to: 1, weight: -2 }], source: 0, target: 1 }).error, /trọng số/);
  assert.match(buildRouteDataset({ nodeCount: 3, edges: [], source: 5, target: 1 }).error, /xuất phát/);
  assert.match(buildRouteDataset({ nodeCount: 3, edges: [], source: 0, target: "x" }).error, /đích/);
});

test("normalizeSimulateResult: contract {output,module,run} shapes only", () => {
  assert.deepEqual(
    normalizeSimulateResult({
      output: { reachable: true, distance: 7, path: [0, 1, 3] },
      module: { artifactId: "weighted-graph-router", derivedStatus: "verified" },
      run: { verdict: "AC", timeMs: 82 },
    }),
    { reachable: true, distance: 7, path: [0, 1, 3], timeMs: 82 },
  );
  assert.equal(normalizeSimulateResult({ output: { reachable: true, distance: "??", path: [0] } }), null);
  assert.deepEqual(
    normalizeSimulateResult({ output: { reachable: false, distance: null, path: [] }, run: { timeMs: 74 } }),
    { reachable: false, distance: null, path: [], timeMs: 74 },
  );
  assert.equal(normalizeSimulateResult({ ok: true, reachable: true, distance: 7, path: [0] }), null); // pre-contract WIP shape
  assert.equal(normalizeSimulateResult({ error: "boom" }), null);
  assert.equal(normalizeSimulateResult(null), null);
});

test("translateReason: known sentences translated, unknown pass through", () => {
  assert.equal(translateReason("Unfinished work has stored WA evidence."), "Bài còn dở — đã lưu bằng chứng WA.");
  assert.equal(translateReason("Content freshness: updated 3 day(s) ago."), "Mới cập nhật 3 ngày trước.");
  assert.equal(translateReason("Some future new reason."), "Some future new reason.");
});
