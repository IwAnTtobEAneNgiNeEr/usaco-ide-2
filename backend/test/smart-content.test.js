"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const smartContent = require("../src/smartContent");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const NOW = "2026-07-16T00:00:00.000Z";
const FIXTURES = [
  { id: "dijkstra-work", title: "Weighted Graph Route", track: "core-proof", concept: "dijkstra", provider: "smart-test", collection: "three-concepts", status: "learning", rating: 1400, lastVerdict: "WA", derivedStatus: "needs-work", updatedAt: "2026-07-15T00:00:00.000Z", tags: ["graph"] },
  { id: "prefix-fresh", title: "Range Query Basics", track: "core-proof", concept: "prefix-sum", provider: "smart-test", collection: "three-concepts", status: "learning", rating: 1300, lastVerdict: null, derivedStatus: "unverified", updatedAt: "2026-07-14T00:00:00.000Z", tags: ["range"] },
  { id: "bfs-no-rating", title: "Grid Walk", track: "core-proof", concept: "bfs", provider: "smart-test", collection: "three-concepts", status: "review", rating: null, lastVerdict: "RE", derivedStatus: "needs-work", updatedAt: "2026-06-20T00:00:00.000Z", tags: ["graph"] },
  { id: "solved", title: "Done Graph", track: "core-proof", concept: "bfs", provider: "smart-test", collection: "three-concepts", status: "solved", rating: 1200, lastVerdict: "AC", derivedStatus: "verified", updatedAt: "2026-07-16T00:00:00.000Z", tags: [] },
];

test("search supports every documented filter and explains why each result matched", () => {
  const results = smartContent.searchProblems(FIXTURES, { q: "graph", track: "core-proof", concept: "dijkstra", provider: "smart-test", collection: "three-concepts", status: "learning", minRating: 1350, maxRating: 1450 });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "dijkstra-work");
  assert.ok(results[0].whyMatched.some((reason) => /Title/.test(reason)));
  assert.ok(results[0].whyMatched.some((reason) => /Rating evidence/.test(reason)));
});

test("search excludes missing ratings when a numeric bound is requested and is deterministic", () => {
  const filters = { track: "core-proof", minRating: 1000 };
  const first = smartContent.searchProblems(FIXTURES, filters);
  assert.deepEqual(first, smartContent.searchProblems(FIXTURES, filters));
  assert.ok(!first.some((item) => item.id === "bfs-no-rating"));
});

test("recommendation is deterministic, capped at three, evidence-based, and never controls navigation", () => {
  const options = { track: "core-proof", targetRating: 1350, liked: ["prefix-fresh"], dismissed: ["bfs-no-rating"], now: NOW };
  const first = smartContent.recommendEntries(FIXTURES, options);
  assert.deepEqual(first, smartContent.recommendEntries(FIXTURES, options));
  assert.ok(first.length <= 3);
  assert.ok(!first.some((item) => item.id === "solved" || item.id === "bfs-no-rating"));
  assert.ok(first.some((item) => item.scoreBreakdown.userFeedback === 25));
  assert.ok(first.every((item) => item.action.autoOpen === false));
  assert.ok(first.every((item) => !item.reason.some((reason) => /weak/i.test(reason))));
});

test("recommendation keeps rating null when content has no rating evidence", () => {
  const [item] = smartContent.recommendEntries([FIXTURES[2]], { track: "core-proof", targetRating: 1500, now: NOW });
  assert.equal(item.rating, null);
  assert.equal(item.ratingEvidence, null);
  assert.equal("difficulty" in item.scoreBreakdown, false);
  assert.equal("mastery" in item, false);
});

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); } catch (error) { reject(error); } finally { server.close(); }
  }));
}

test("search and recommendation HTTP contracts are deterministic and return reasons", async () => {
  const created = [];
  try {
    for (const fixture of FIXTURES.slice(0, 3)) {
      created.push(await problemStore.createProblem({ ...fixture, id: `zz-smart-${fixture.id}`, track: "zz-smart-track", provider: "zz-smart-provider" }));
    }
    await withServer(async (base) => {
      const searchUrl = `${base}/api/problems/search?track=zz-smart-track&provider=zz-smart-provider&concept=dijkstra&minRating=1300&maxRating=1500`;
      const search = await (await fetch(searchUrl)).json();
      assert.equal(search.results.length, 1);
      assert.ok(search.results[0].whyMatched.length > 0);

      const recommendationUrl = `${base}/api/recommendations/entry?track=zz-smart-track&targetRating=1350&liked=${created[1].id}`;
      const first = await (await fetch(recommendationUrl)).json();
      const second = await (await fetch(recommendationUrl)).json();
      assert.deepEqual(first, second);
      assert.ok(first.items.length <= 3);
      assert.equal(first.autoOpen, false);
      assert.equal(first.policy.recentTopicIsWeakness, false);
      assert.ok(first.items.every((item) => item.reason.length && item.action.autoOpen === false));
    });
  } finally { await Promise.all(created.map((meta) => problemStore.deleteProblem(meta.id))); }
});
