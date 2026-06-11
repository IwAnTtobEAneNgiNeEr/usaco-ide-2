"use strict";

// Tests for the first-run sample seeder. The store is injected, so these run
// against in-memory stubs — no disk, no workspace mutation.

const test = require("node:test");
const assert = require("node:assert/strict");

const { SAMPLE, seedSampleIfEmpty } = require("../src/seed");

function fakeStore(existing = []) {
  const created = [];
  return {
    created,
    listProblems: async () => existing,
    createProblem: async (input) => {
      created.push(input);
      return { id: "sample-id", ...input };
    }
  };
}

test("empty workspace gets exactly one seeded sample problem", async () => {
  const store = fakeStore([]);
  const logs = [];
  const meta = await seedSampleIfEmpty(store, (m) => logs.push(m));
  assert.ok(meta, "should return the created meta");
  assert.equal(store.created.length, 1);
  assert.equal(store.created[0].title, SAMPLE.title);
  assert.equal(logs.length, 1);
});

test("non-empty workspace is never re-seeded (deleting the sample is final)", async () => {
  const store = fakeStore([{ id: "my-problem" }]);
  const meta = await seedSampleIfEmpty(store);
  assert.equal(meta, null);
  assert.equal(store.created.length, 0);
});

test("sample is self-consistent: solution shape, tests, and statement agree", () => {
  // 3+ tests, every test has both input and expected — Judge All can fully run.
  assert.ok(Array.isArray(SAMPLE.tests) && SAMPLE.tests.length >= 3);
  for (const t of SAMPLE.tests) {
    assert.ok(t.input.trim().length > 0, `test "${t.name}" has input`);
    assert.ok(t.expected.trim().length > 0, `test "${t.name}" has expected`);
    // Expected really is the sum of the two input numbers (guards typos).
    const [a, b] = t.input.trim().split(/\s+/).map(BigInt);
    assert.equal(BigInt(t.expected.trim()), a + b, `test "${t.name}" expected = a + b`);
  }
  // The solution must use long long (the seeded tests overflow 32-bit int).
  assert.match(SAMPLE.code, /long long/);
  // The custom Run input matches the statement sample.
  assert.equal(SAMPLE.input.trim(), "2 3");
  assert.equal(SAMPLE.expected.trim(), "5");
});
