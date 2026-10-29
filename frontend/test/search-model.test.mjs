import test from "node:test";
import assert from "node:assert/strict";
import {
  normTopic, trackOf, matchesFilters, buildSearchParams, searchQueryString,
  applyLocalFilters, normalizeSearchResults, localReasons, displayTitle,
} from "../src/core/search-model.js";
import { fixtures } from "./fixtures/contract-fixtures.mjs";

test("normalizeSearchResults reads the real contract shape (results + whyMatched)", () => {
  const items = normalizeSearchResults(fixtures.searchDijkstra);
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "dij-1");
  // the server's own "Vì sao khớp" strings survive normalization
  assert.ok(items[0].reasons.length >= 1);
  assert.ok(items[0].reasons.some((r) => /title|Concept/i.test(r)));
});

test("normalizeSearchResults rejects absent/malformed payloads (→ local fallback)", () => {
  assert.equal(normalizeSearchResults(null), null);
  assert.equal(normalizeSearchResults({}), null);
  assert.equal(normalizeSearchResults({ results: "nope" }), null);
  // rows without a real id are dropped; oversized reasons are clamped
  const items = normalizeSearchResults({ results: [{ id: "" }, { id: "x", whyMatched: ["ok", 42, "  ", "b".repeat(500)] }] });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].reasons.map((r) => r.length <= 120), [true, true]);
});

test("catalog search serializes canonical tracks", () => {
  assert.deepEqual(buildSearchParams({
    search: "dijkstra", status: "learning", track: "verified-artifact",
    concept: "dijkstra", provider: "local", collection: "speedrun",
    minRating: 1200, maxRating: 1600, difficulty: "easy",
  }), {
    q: "dijkstra", status: "learning", track: "verified-artifact",
    concept: "dijkstra", provider: "local", collection: "speedrun",
    minRating: 1200, maxRating: 1600,
  });
  assert.deepEqual(buildSearchParams({ search: "dijkstra", track: "algorithm-engineering" }), { q: "dijkstra", track: "algorithm-engineering" });
  assert.equal(searchQueryString({ search: "a b" }), "q=a+b");
});

test("applyLocalFilters applies hướng/source/topics over server rows", () => {
  const rows = [
    { id: "m1", activityKind: "algorithm-module", title: "RangeSum" },
    { id: "p1", title: "Bài thường", source: "cses" },
  ];
  assert.deepEqual(applyLocalFilters(rows, { track: "algorithm-engineering" }).map((r) => r.id), ["m1"]);
  assert.deepEqual(applyLocalFilters(rows, { source: "cses" }).map((r) => r.id), ["p1"]);
  assert.equal(applyLocalFilters(rows, {}).length, 2);
});

test("trackOf: only algorithm-module rows belong to hướng Thuật toán & ứng dụng", () => {
  assert.equal(trackOf({ activityKind: "algorithm-module" }), "algorithm-engineering");
  assert.equal(trackOf({ activityKind: "competitive-problem" }), "competitive");
  assert.equal(trackOf({}), "competitive");
});

test("localReasons names the actual matched field, honestly, max 2", () => {
  const p = { title: "Dijkstra cơ bản", topic: "graphs", tags: ["dijkstra"], provider: "cses", collection: "graph" };
  const reasons = localReasons(p, { search: "dijkstra" });
  assert.ok(reasons.length >= 1 && reasons.length <= 2);
  assert.ok(reasons[0].includes("dijkstra"));
  assert.deepEqual(localReasons(p, { search: "" }), []); // browsing needs no justification
});

test("displayTitle cleans display only (glyph strip + whitespace collapse)", () => {
  assert.equal(displayTitle({ title: "  Hai   khoảng  trắng " }), "Hai khoảng trắng");
  assert.equal(displayTitle({ title: "⚔️ Boss tuần" }), "Boss tuần");
  assert.equal(displayTitle({ title: "abc", titleClean: "Sạch hơn" }), "Sạch hơn");
});

test("matchesFilters + normTopic keep the old local semantics", () => {
  const p = { title: "A", topic: "Binary Search", tags: ["two pointers"], source: "cses", status: "learning" };
  assert.equal(normTopic("Binary Search"), "binarysearch");
  assert.equal(matchesFilters(p, { topics: ["binarysearch"] }), true);
  assert.equal(matchesFilters(p, { topics: ["dp"] }), false);
  assert.equal(matchesFilters(p, { search: "binary" }), true);
  assert.equal(matchesFilters(p, { status: "solved" }), false);
});

test("Đã giải filters current verified Judge evidence in both search and fallback", () => {
  const rows = [
    { id: "current", status: "learning", truth: { derivedStatus: "verified" }, source: "cses", topic: "dp" },
    { id: "stale", status: "solved", truth: { derivedStatus: "stale" }, source: "cses", topic: "dp" },
    { id: "historical", status: "solved", truth: { derivedStatus: "historically-accepted" }, source: "cses", topic: "dp" },
    { id: "untested", status: "solved", truth: { derivedStatus: "unverified" }, source: "cses", topic: "dp" },
  ];
  const filters = { status: "solved", source: "cses", topics: ["dp"], search: "" };
  assert.deepEqual(rows.filter((row) => matchesFilters(row, filters)).map((row) => row.id), ["current"]);
  assert.deepEqual(applyLocalFilters(rows, { ...filters, search: "matched by server" }).map((row) => row.id), ["current"]);
  assert.deepEqual(buildSearchParams({ search: "source", status: "solved" }), { q: "source" });
  assert.equal(matchesFilters({ status: "review" }, { status: "review" }), true);
});
