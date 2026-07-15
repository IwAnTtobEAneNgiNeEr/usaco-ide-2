import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDijkstraAnalysis, normalizePrefixSumAnalysis, heapStr, pathStr, distancesStr,
} from "../src/core/trace-model.js";
import { fixtures } from "./fixtures/contract-fixtures.mjs";

// ---------------------------------------------------------------------------
// Dijkstra — real trace of a recognized student solution (WA evidence),
// 4 nodes / 5 edges, source 1 → target 4 (see fixtures header).
// ---------------------------------------------------------------------------

test("dijkstra: supported fixture normalizes into renderable rows", () => {
  const vm = normalizeDijkstraAnalysis(fixtures.dijkstraSupported);
  assert.equal(vm.supported, true);
  assert.equal(vm.deterministic, true);
  assert.ok(vm.steps.length >= 4);

  const first = vm.steps[0];
  assert.equal(first.node, "1");
  assert.equal(first.dist, 0);
  assert.equal(first.heapBefore, "1(d=0)");
  assert.equal(first.distances, "1:0 2:4 3:1 4:∞");
  assert.equal(first.stale, false);
  assert.equal(first.relaxations.length, 2);
  assert.equal(first.relaxations[0].previous, "∞"); // dist[2] was INF before relax
  assert.equal(first.relaxations[0].accepted, true);

  // every step anchors back to the REAL pop() line of the student's code
  assert.equal(first.line, fixtures.dijkstraSupported.sourceLines.pop);
  assert.ok(Number.isInteger(first.line));
});

test("dijkstra: result carries real distance + reconstructed path", () => {
  const vm = normalizeDijkstraAnalysis(fixtures.dijkstraSupported);
  assert.equal(vm.result.reachable, true);
  assert.equal(vm.result.distance, 4); // 1→3(1) →2(2) →4(1)
  assert.deepEqual(vm.result.path, ["1", "3", "2", "4"]);
  assert.equal(vm.graph.source, "1");
  assert.equal(vm.graph.target, "4");
  assert.equal(vm.graph.directed, true);
  assert.equal(pathStr(vm.result.path), "1 → 3 → 2 → 4");
});

test("dijkstra: unsupported code shape yields honest fallback, no steps", () => {
  const vm = normalizeDijkstraAnalysis(fixtures.dijkstraUnsupported);
  assert.equal(vm.supported, false);
  assert.ok(vm.reason.includes("unsupported-code-shape"));
  assert.equal(vm.steps, undefined);
  assert.equal(typeof vm.fallback.input, "string"); // the REAL evidence input
  assert.ok(vm.nextAction && vm.nextAction.id === "open-visualizer");
});

test("dijkstra: malformed payloads cannot crash the modal", () => {
  for (const bad of [null, {}, { supported: true }, { supported: true, steps: [{}, null] }]) {
    const vm = bad && bad.supported === true ? normalizeDijkstraAnalysis(bad) : normalizeDijkstraAnalysis(bad);
    assert.ok(vm); // never throws
  }
  const vm = normalizeDijkstraAnalysis({ supported: true, steps: [{}, null] });
  assert.equal(vm.steps.length, 2);
  assert.equal(vm.steps[0].heapBefore, "");
});

test("heapStr formats {node,distance} snapshots compactly", () => {
  assert.equal(heapStr([{ node: 3, distance: 1 }, { node: 2, distance: 4 }]), "3(d=1) 2(d=4)");
  assert.equal(heapStr([]), "");
  assert.equal(heapStr(null), "");
});

test("distancesStr keeps unreachable vertices visible as infinity", () => {
  assert.equal(distancesStr([{ node: 1, distance: 0 }, { node: 2, distance: null }]), "1:0 2:∞");
  assert.equal(distancesStr(null), "");
});

// ---------------------------------------------------------------------------
// Prefix Sum — real analysis of a recognized 1-based solution over
// a = [1,2,3,4,5] with queries [1,3] and [2,5].
// ---------------------------------------------------------------------------

test("prefix-sum: supported fixture normalizes tables, build steps and queries", () => {
  const vm = normalizePrefixSumAnalysis(fixtures.prefixSupported);
  assert.equal(vm.supported, true);
  assert.equal(vm.indexBase, 1);
  assert.deepEqual(vm.a, [1, 2, 3, 4, 5]);
  assert.deepEqual(vm.prefix, [0, 1, 3, 6, 10, 15]);
  assert.equal(vm.buildSteps.length, 5);

  const b0 = vm.buildSteps[0];
  assert.equal(b0.prefixIndex, 1);
  assert.equal(b0.previousPrefix, 0);
  assert.equal(b0.value, 1);
  assert.equal(b0.prefixValue, 1);
  assert.equal(b0.line, fixtures.prefixSupported.sourceLines.construction);

  assert.equal(vm.queries.length, 2);
  assert.equal(vm.queries[0].result, 6);      // 1+2+3
  assert.equal(vm.queries[1].result, 14);     // 2+3+4+5
  assert.equal(vm.queries[0].formula, "prefix[r] - prefix[l - 1]");
  // server computed both sides from the same evidence → no mismatch here
  assert.equal(vm.mismatchCount, 0);
  assert.equal(vm.queries[0].line, fixtures.prefixSupported.sourceLines.query);
});

test("prefix-sum: off-by-one counterexample uses the real array", () => {
  const vm = normalizePrefixSumAnalysis(fixtures.prefixSupported);
  assert.equal(vm.offByOne.available, true);
  assert.equal(vm.offByOne.correctFormula, "prefix[r] - prefix[l - 1]");
  assert.equal(vm.offByOne.wrongFormula, "prefix[r] - prefix[l]");
  assert.notEqual(vm.offByOne.correctResult, vm.offByOne.wrongResult);
});

test("prefix-sum: unsupported code shape yields honest fallback", () => {
  const vm = normalizePrefixSumAnalysis(fixtures.prefixUnsupported);
  assert.equal(vm.supported, false);
  assert.ok(vm.reason.includes("unsupported-code-shape"));
  assert.equal(vm.queries, undefined);
  assert.equal(typeof vm.fallback.input, "string");
});

test("prefix-sum: malformed payloads cannot crash the modal", () => {
  for (const bad of [null, {}, { supported: true }, { supported: true, queries: [null, {}] }]) {
    assert.ok(normalizePrefixSumAnalysis(bad));
  }
  const vm = normalizePrefixSumAnalysis({ supported: true, queries: [null, {}] });
  assert.equal(vm.queries.length, 2);
  assert.equal(vm.mismatchCount, 0);
});
