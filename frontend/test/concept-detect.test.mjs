import test from "node:test";
import assert from "node:assert/strict";
import {
  CONCEPTS, detectConcept, conceptInfo, moduleForConcept, traceKindForConcept,
} from "../src/core/concept-detect.js";

test("the three contract concepts map to their locked trace + module ids", () => {
  assert.equal(CONCEPTS.bfs.module.id, "grid-pathfinder");
  assert.equal(CONCEPTS.dijkstra.module.id, "weighted-graph-router");
  assert.equal(CONCEPTS["prefix-sum"].module.id, "range-sum-module");
  assert.equal(traceKindForConcept("dijkstra"), "dijkstra-trace");
  assert.equal(traceKindForConcept("prefix-sum"), "prefix-sum-trace");
  assert.equal(traceKindForConcept("bfs"), "bfs-trace");
});

test("explicit concept field wins and must be a known id", () => {
  assert.equal(detectConcept({ concept: "dijkstra", topic: "bfs" }), "dijkstra");
  assert.equal(detectConcept({ concept: "graphs", topic: "dijkstra" }), "dijkstra"); // unknown concept → scan topic
});

test("topic/tags/title detection, first hit wins, whole words only", () => {
  assert.equal(detectConcept({ topic: "dijkstra" }), "dijkstra");
  assert.equal(detectConcept({ topic: "Prefix Sum" }), "prefix-sum");
  assert.equal(detectConcept({ topic: "prefix_sum" }), "prefix-sum");
  assert.equal(detectConcept({ topic: "tổng tiền tố" }), "prefix-sum");
  assert.equal(detectConcept({ tags: ["dp", "bfs"] }), "bfs");
  assert.equal(detectConcept({ title: "Mê cung ít bước nhất BFS" }), "bfs");
  // no false positives from lookalike words
  assert.equal(detectConcept({ topic: "prefixed trees" }), null);
  assert.equal(detectConcept({ topic: "dbfs variant" }), null);
});

test("unknown/empty metadata stays null (honest fallback path)", () => {
  assert.equal(detectConcept({}), null);
  assert.equal(detectConcept(null), null);
  assert.equal(detectConcept({ topic: "dp", tags: ["greedy"] }), null);
  assert.equal(moduleForConcept(null), null);
  assert.equal(conceptInfo("nope"), null);
  // unknown concept still routes to bfs-trace whose server-side check falls back
  assert.equal(traceKindForConcept(null), "bfs-trace");
});
