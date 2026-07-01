"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const generation = require("../src/testGeneration");

const STATEMENT = `A + B
Given two integers a and b, print the sum a + b.
Constraints: -1000000000 <= a,b <= 1000000000.`;

test("A+B deterministic generator creates 40 diverse, correct tests", () => {
  const result = generation.generateAddition(STATEMENT);
  assert.ok(result);
  assert.ok(result.tests.length >= 30);
  assert.ok(result.tests.some((item) => item.category === "min-boundary"));
  assert.ok(result.tests.some((item) => item.category === "max-valid-boundary"));
  assert.ok(result.tests.some((item) => item.category.includes("random")));
  for (const item of result.tests) {
    const [a, b] = item.input.trim().split(/\s+/).map(Number);
    assert.equal(item.expected.trim(), String(a + b));
    assert.equal(item.provenance, "generated-self-consistency-check");
  }
  assert.equal(new Set(result.tests.map((item) => generation.normalizedInput(item.input))).size, result.tests.length);
});

test("generated duplicates are skipped by normalized input", () => {
  const result = generation.deduplicate([
    { name: "one", input: "1 2\n" },
    { name: "same", input: " 1\t2 \r\n" },
    { name: "two", input: "2 3\n" }
  ]);
  assert.equal(result.tests.length, 2);
  assert.equal(result.skipped.length, 1);
});

test("unrelated statements are not mistaken for A+B", () => {
  assert.equal(generation.generateAddition("Given an array, output its maximum value."), null);
});
