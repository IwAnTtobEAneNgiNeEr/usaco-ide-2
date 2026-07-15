"use strict";

// Tests for arena/bossCaseStore.js — real fs read/write against a throwaway
// tmp file (never data/arena-boss-cases.json), same convention as
// arena-card-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const bossCaseStore = require("../src/arena/bossCaseStore");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-boss-"));
  return path.join(dir, "arena-boss-cases.json");
}

test("load returns an empty collection when no file exists yet", async () => {
  const file = await tmpFile();
  const state = await bossCaseStore.load(file);
  assert.deepEqual(state.byProblem, {});
});

test("recordFailure persists a case scoped to its problemId", async () => {
  const file = await tmpFile();
  const result = await bossCaseStore.recordFailure(file, "bai-35", {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "2026-07-07T00:00:00.000Z",
  });
  assert.equal(result.entry.count, 1);
  assert.equal(result.justPromoted, false);

  const reloaded = await bossCaseStore.load(file);
  assert.equal(reloaded.byProblem["bai-35"].length, 1);
});

test("recurring failures on the same problem accumulate; other problems stay isolated", async () => {
  const file = await tmpFile();
  await bossCaseStore.recordFailure(file, "bai-35", {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "t1",
  });
  const second = await bossCaseStore.recordFailure(file, "bai-35", {
    minimalInput: "3\n1 2 3", kind: "WA", expected: "6", got: "5", now: "t2",
  });
  assert.equal(second.entry.count, 2);
  assert.equal(second.justPromoted, true);

  await bossCaseStore.recordFailure(file, "bai-99", {
    minimalInput: "0", kind: "TLE", expected: "", got: "", now: "t3",
  });
  const state = await bossCaseStore.load(file);
  assert.equal(state.byProblem["bai-35"].length, 1);
  assert.equal(state.byProblem["bai-99"].length, 1);
  assert.equal(state.byProblem["bai-99"][0].count, 1);
});

test("listPromoted returns only cases at/above PROMOTE_THRESHOLD, across all problems, sorted by count desc", async () => {
  const file = await tmpFile();
  // bai-a: promoted (count 3)
  await bossCaseStore.recordFailure(file, "bai-a", { minimalInput: "1", kind: "WA", now: "t1" });
  await bossCaseStore.recordFailure(file, "bai-a", { minimalInput: "1", kind: "WA", now: "t2" });
  await bossCaseStore.recordFailure(file, "bai-a", { minimalInput: "1", kind: "WA", now: "t3" });
  // bai-b: promoted (count 2)
  await bossCaseStore.recordFailure(file, "bai-b", { minimalInput: "2", kind: "TLE", now: "t4" });
  await bossCaseStore.recordFailure(file, "bai-b", { minimalInput: "2", kind: "TLE", now: "t5" });
  // bai-c: not promoted (count 1)
  await bossCaseStore.recordFailure(file, "bai-c", { minimalInput: "3", kind: "RE", now: "t6" });

  const promoted = await bossCaseStore.listPromoted(file);
  assert.equal(promoted.length, 2);
  assert.equal(promoted[0].problemId, "bai-a");
  assert.equal(promoted[0].count, 3);
  assert.equal(promoted[1].problemId, "bai-b");
  assert.equal(promoted[1].count, 2);
});

test("listForProblem returns the raw case list for one problem, empty array if none", async () => {
  const file = await tmpFile();
  await bossCaseStore.recordFailure(file, "bai-35", {
    minimalInput: "3\n1 2 3", kind: "WA", now: "t1",
  });
  const forProblem = await bossCaseStore.listForProblem(file, "bai-35");
  assert.equal(forProblem.length, 1);
  const empty = await bossCaseStore.listForProblem(file, "never-touched");
  assert.deepEqual(empty, []);
});
