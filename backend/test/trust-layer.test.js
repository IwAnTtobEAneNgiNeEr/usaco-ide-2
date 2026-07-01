"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const trust = require("../src/trustLayer");

test("official samples receive provenance and numeric confidence is removed", () => {
  const tests = [{ input: "1\n", expected: "2\n", expectedKnown: true, confidence: 1, verifiedBy: "reference" }];
  const summary = trust.applyProvenance({ tests, samples: [{ input: "1", output: "2" }], statement: "double" });
  assert.equal(tests[0].provenance, trust.PROVENANCE.OFFICIAL_SAMPLE);
  assert.equal("confidence" in tests[0], false);
  assert.equal("verifiedBy" in tests[0], false);
  assert.equal(summary.counts[trust.PROVENANCE.OFFICIAL_SAMPLE], 1);
});

test("exact and whitespace-only duplicate inputs are detected", () => {
  const tests = [
    { name: "a", input: "1 2\n", expected: "3" },
    { name: "b", input: "1 2\r\n", expected: "3" },
    { name: "c", input: "1\n2\n", expected: "3" }
  ];
  const summary = trust.applyProvenance({ tests, samples: [], statement: "sum" });
  assert.ok(summary.issues.some((issue) => issue.type === "duplicate-input"));
  assert.ok(summary.issues.some((issue) => issue.type === "near-duplicate-whitespace"));
  assert.equal(tests[1].provenance, trust.PROVENANCE.INVALID_DUPLICATE);
});

test("generated tests without evidence stay explicitly unverified", () => {
  const tests = [{ input: "9", expected: "81", expectedKnown: true }];
  trust.applyProvenance({ tests, samples: [], statement: "square" });
  assert.equal(tests[0].provenance, trust.PROVENANCE.GENERATED_UNVERIFIED);
});
