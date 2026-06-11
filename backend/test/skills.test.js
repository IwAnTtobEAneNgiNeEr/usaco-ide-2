"use strict";

// Tests for the Skill Constellation engine (src/skills.js). Mastery must be
// deterministic and the curriculum routing must survive Vietnamese topics
// (with/without diacritics) — the UI sorts the whole map by these numbers.

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeSkillMap, clusterOf, masteryOf, tierOf, fold } = require("../src/skills");

const NOW = new Date("2026-06-11T15:00:00");

function isoAt(daysAgo, hour = 10) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// meta.history is stored newest-first.
function meta(overrides = {}) {
  return {
    id: overrides.id || "p1",
    title: overrides.title || "P1",
    topic: overrides.topic || "",
    tags: overrides.tags || [],
    difficulty: overrides.difficulty || "unrated",
    status: overrides.status || "learning",
    lastVerdict: overrides.lastVerdict || null,
    updatedAt: overrides.updatedAt || isoAt(0),
    history: overrides.history || []
  };
}

// ---- fold + cluster routing -------------------------------------------------

test("fold strips Vietnamese diacritics", () => {
  assert.equal(fold("Quy hoạch động"), "quy hoach dong");
  assert.equal(fold("Đồ thị"), "do thi");
});

test("clusterOf routes EN and VN topics to the same cluster", () => {
  assert.equal(clusterOf("dp").id, "dp");
  assert.equal(clusterOf("Quy hoạch động").id, "dp");
  assert.equal(clusterOf("graphs").id, "graphs");
  assert.equal(clusterOf("đồ thị").id, "graphs");
  assert.equal(clusterOf("binary search").id, "search");
  assert.equal(clusterOf("chặt nhị phân").id, "search");
  assert.equal(clusterOf("segment tree").id, "ds");
  assert.equal(clusterOf("xâu").id, "strings");
});

test("clusterOf falls back to 'other' for unknown topics", () => {
  assert.equal(clusterOf("vũ trụ học").id, "other");
  assert.equal(clusterOf("").id, "other");
});

// ---- mastery ----------------------------------------------------------------

test("mastery blends volume, reliability and recency", () => {
  const nowMs = NOW.getTime();
  // 4 solved / 4 total, touched today: 60 + 20 + 20 = 100
  assert.equal(masteryOf({ solved: 4, total: 4, lastAt: isoAt(0) }, nowMs), 100);
  // 1 solved / 2 total, touched 10 days ago: 15 + 10 + 10 = 35
  assert.equal(masteryOf({ solved: 1, total: 2, lastAt: isoAt(10) }, nowMs), 35);
  // nothing solved, stale: 0
  assert.equal(masteryOf({ solved: 0, total: 3, lastAt: isoAt(90) }, nowMs), 0);
});

test("tier thresholds", () => {
  assert.equal(tierOf(100).id, "diamond");
  assert.equal(tierOf(60).id, "gold");
  assert.equal(tierOf(35).id, "silver");
  assert.equal(tierOf(15).id, "bronze");
  assert.equal(tierOf(0).id, "seed");
});

// ---- computeSkillMap --------------------------------------------------------

test("computeSkillMap groups topics into ordered clusters with weighted mastery", () => {
  const metas = [
    meta({ id: "a", topic: "dp", status: "solved", lastVerdict: "AC", history: [{ verdict: "AC", at: isoAt(1) }] }),
    meta({ id: "b", topic: "quy hoạch động", history: [{ verdict: "WA", at: isoAt(2) }] }),
    meta({ id: "c", topic: "đồ thị", status: "solved", history: [{ verdict: "AC", at: isoAt(0) }] })
  ];
  const map = computeSkillMap(metas, { now: NOW });

  assert.equal(map.totals.problems, 3);
  assert.equal(map.totals.topics, 3); // "dp" and "quy hoạch động" stay distinct topics
  const ids = map.clusters.map((c) => c.id);
  // graphs comes before dp in the curriculum order
  assert.ok(ids.indexOf("graphs") < ids.indexOf("dp"));

  const dp = map.clusters.find((c) => c.id === "dp");
  assert.equal(dp.topics.length, 2);
  // topics sorted by mastery desc — solved "dp" first
  assert.equal(dp.topics[0].topic, "dp");
  assert.ok(dp.topics[0].mastery > dp.topics[1].mastery);
  // cluster mastery is the volume-weighted mean of its topics
  const expect = Math.round((dp.topics[0].mastery * 1 + dp.topics[1].mastery * 1) / 2);
  assert.equal(dp.mastery, expect);
});

test("computeSkillMap counts AC/WA runs and attaches capped problem lists", () => {
  const history = [{ verdict: "AC", at: isoAt(0) }, { verdict: "WA", at: isoAt(1) }, { verdict: "WA", at: isoAt(2) }];
  const metas = [meta({ id: "a", topic: "graphs", history })];
  const map = computeSkillMap(metas, { now: NOW });
  const t = map.clusters[0].topics[0];
  assert.equal(t.acRuns, 1);
  assert.equal(t.waRuns, 2);
  assert.equal(t.solved, 1);
  assert.equal(t.problems.length, 1);
  assert.equal(t.problems[0].id, "a");
  assert.equal(t.problems[0].solved, true);
});

test("computeSkillMap with no metas returns an empty, valid shape", () => {
  const map = computeSkillMap([], { now: NOW });
  assert.deepEqual(map.clusters, []);
  assert.equal(map.totals.topics, 0);
  assert.equal(map.totals.avgMastery, 0);
});

test("untagged problems land in 'khác' inside the other cluster", () => {
  const map = computeSkillMap([meta({ id: "x", topic: "" })], { now: NOW });
  assert.equal(map.clusters.length, 1);
  assert.equal(map.clusters[0].id, "other");
  assert.equal(map.clusters[0].topics[0].topic, "khác");
});
