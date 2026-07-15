"use strict";

// Tests for arena/roadmap.js (S7) — pure goal-gradient math over
// computeSkillMap's real output (skills.js is not re-derived, just read),
// same meta() fixture convention as skills.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSkillMap } = require("../src/skills");
const roadmap = require("../src/arena/roadmap");

const NOW = new Date("2026-07-06T00:00:00Z");

function meta(overrides = {}) {
  return {
    id: overrides.id || "p1",
    topic: overrides.topic || "graph",
    tags: overrides.tags || [],
    status: overrides.status || "learning",
    lastVerdict: overrides.lastVerdict || null,
    updatedAt: overrides.updatedAt || "2026-07-01T00:00:00Z",
    history: overrides.history || [],
  };
}

test("computeRoadmap with no data ever attempted: 0% progress, full rating gap, low confidence", () => {
  const { clusters } = computeSkillMap([], { now: NOW });
  const r = roadmap.computeRoadmap(clusters, { rating: 0 });
  assert.equal(r.progressPct, 0);
  assert.equal(r.ratingGap, roadmap.SILVER_RATING_FLOOR);
  assert.equal(r.confidence.level, "so-bo");
  assert.equal(r.clusters.length, roadmap.SILVER_TARGET_CLUSTER_IDS.length);
});

test("computeRoadmap: a fully-mastered target cluster contributes 100% to its own slice", () => {
  // 4+ solved AC problems in one topic saturates skills.js's mastery volume term.
  const metas = Array.from({ length: 4 }, (_, i) => meta({
    id: `g${i}`, topic: "graphs", history: [{ verdict: "AC", at: "2026-07-05T00:00:00Z" }],
  }));
  const { clusters } = computeSkillMap(metas, { now: NOW });
  const r = roadmap.computeRoadmap(clusters, { rating: 1000 });
  const graphsSlice = r.clusters.find((c) => c.id === "graphs");
  assert.ok(graphsSlice.mastery >= roadmap.CLUSTER_MASTERY_GOAL);
  assert.equal(graphsSlice.gap, 0);
});

test("computeRoadmap: rating at/above the Silver floor has zero rating gap", () => {
  const { clusters } = computeSkillMap([], { now: NOW });
  assert.equal(roadmap.computeRoadmap(clusters, { rating: roadmap.SILVER_RATING_FLOOR }).ratingGap, 0);
  assert.equal(roadmap.computeRoadmap(clusters, { rating: roadmap.SILVER_RATING_FLOOR + 500 }).ratingGap, 0);
  assert.ok(roadmap.computeRoadmap(clusters, { rating: roadmap.SILVER_RATING_FLOOR - 1 }).ratingGap > 0);
});

test("computeRoadmap: confidence rises with total attempts across target clusters", () => {
  const few = Array.from({ length: 3 }, (_, i) => meta({ id: `f${i}`, topic: "dp" }));
  const many = Array.from({ length: 35 }, (_, i) => meta({ id: `m${i}`, topic: "dp" }));
  const { clusters: c1 } = computeSkillMap(few, { now: NOW });
  const { clusters: c2 } = computeSkillMap(many, { now: NOW });
  assert.equal(roadmap.confidenceFor(3).level, "so-bo");
  assert.equal(roadmap.computeRoadmap(c1, { rating: 0 }).confidence.level, "so-bo");
  assert.equal(roadmap.computeRoadmap(c2, { rating: 0 }).confidence.level, "kha-ro");
});

test("computeRoadmap never includes non-Silver clusters (strings/geometry/other excluded by design)", () => {
  const { clusters } = computeSkillMap([], { now: NOW });
  const r = roadmap.computeRoadmap(clusters, { rating: 0 });
  const ids = r.clusters.map((c) => c.id);
  assert.ok(!ids.includes("strings"));
  assert.ok(!ids.includes("geometry"));
  assert.ok(!ids.includes("other"));
});
