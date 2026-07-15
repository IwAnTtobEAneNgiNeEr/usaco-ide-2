"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const practice = require("../src/personalizedPractice");

function meta(id, daysAgo, topic, rating, verdict = "AC", tags = []) {
  return {
    id,
    title: id,
    topic,
    tags,
    status: verdict === "AC" ? "solved" : "learning",
    lastVerdict: verdict,
    analysis: rating ? { cfRating: rating } : null,
    updatedAt: new Date(Date.UTC(2026, 6, 10 - daysAgo)).toISOString()
  };
}

test("recentProblems clamps the evidence window to 5-10 and keeps newest first", () => {
  const metas = Array.from({ length: 14 }, (_, i) => meta(`p${i}`, i, "dp", 1000 + i * 10));
  assert.deepEqual(practice.recentProblems(metas, 2).map((m) => m.id), ["p0", "p1", "p2", "p3", "p4"]);
  assert.equal(practice.recentProblems(metas, 99).length, 10);
});
test("recent BFS/DFS evidence beats an older unrelated topic", () => {
  const metas = [
    meta("bfs-new", 0, "bfs", 1150, "AC", ["graph"]),
    meta("dfs-new", 1, "bfs", 1100, "WA", ["dfs", "graph"]),
    meta("grid", 2, "bfs", 1200, "AC", ["shortest path"]),
    meta("old-dp", 3, "dp", 1200),
    meta("old-math", 4, "math", 900)
  ];
  const ranked = practice.rankTopics(metas, 5);
  assert.equal(ranked[0].topic, "bfs");
  assert.ok(ranked[0].score > ranked.find((x) => x.topic === "dp").score);
});

test("ratingBand follows player Elo and only nudges by recent solve stability", () => {
  const clean = Array.from({ length: 5 }, (_, i) => meta(`ac${i}`, i, "graphs", 1100 + i * 20, "AC"));
  const rough = Array.from({ length: 5 }, (_, i) => meta(`wa${i}`, i, "graphs", 1100 + i * 20, "WA"));
  assert.equal(practice.ratingBand(1137, clean, 5).targetRating, 1200);
  assert.equal(practice.ratingBand(1137, rough, 5).targetRating, 1100);
});

test("buildRecommendation returns inspectable topic and Elo evidence", () => {
  const metas = [
    meta("a", 0, "dfs", 1200, "AC", ["graph"]),
    meta("b", 1, "dfs", 1150, "WA", ["tree"]),
    meta("c", 2, "bfs", 1100, "AC", ["graph"]),
    meta("d", 3, "math", 900),
    meta("e", 4, "dp", 1300)
  ];
  const r = practice.buildRecommendation({ metas, playerRating: 1180, recentWindow: 5 });
  assert.equal(r.recent.length, 5);
  assert.equal(r.topic, "dfs");
  assert.equal(r.playerRating, 1180);
  assert.ok(r.minRating <= r.targetRating && r.targetRating <= r.maxRating);
  assert.ok(r.topicEvidence.length >= 2);
});

test("statement and tests are complete and de-duplicate sample input", () => {
  const problem = {
    title: "Đường đi trong sương",
    statement: "Tìm số bước ngắn nhất trên lưới.",
    inputFormat: "Dòng đầu là n, m.",
    outputFormat: "In số bước.",
    constraints: ["1 ≤ n, m ≤ 20"],
    samples: [{ input: "1 1\n", expected: "0\n", explanation: "Đứng tại đích." }],
    verifiedTests: [
      { name: "duplicate", input: "1 1\n", expected: "0\n" },
      { name: "edge", input: "1 2\n", expected: "1\n", reason: "một cạnh" }
    ]
  };
  const md = practice.buildStatementMd(problem);
  assert.match(md, /## Dữ liệu vào/);
  assert.match(md, /## Ví dụ 1/);
  assert.equal(practice.collectTests(problem).length, 2);
});
