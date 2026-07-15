"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const problemStore = require("../src/problemStore");

test("metadata patch and list summary preserve provenance and derived fields", async () => {
  const id = `zz-contract-summary-${Date.now()}`;
  try {
    await problemStore.createProblem({ id, title: "BFS", code: "int main(){}", provider: "Codeforces", collection: "BFS", origin: "imported", activityKind: "competitive-problem", derivedFrom: { problemId: "seed" }, cfRating: 900 });
    await problemStore.updateProblem(id, { provider: "AtCoder", collection: "ABC", origin: "ocr", activityKind: "algorithm-module", derivedFrom: { problemId: "p0", runId: "r0" } });
    const summary = (await problemStore.listProblems()).find((item) => item.id === id);
    assert.equal(summary.provider, "AtCoder");
    assert.equal(summary.collection, "ABC");
    assert.equal(summary.origin, "ocr");
    assert.equal(summary.activityKind, "algorithm-module");
    assert.deepEqual(summary.derivedFrom, { problemId: "p0", runId: "r0" });
    assert.equal(summary.cfRating, 900);
    assert.ok(summary.derivedStatus);
    assert.deepEqual(summary.provenance.derivedFrom, { problemId: "p0", runId: "r0" });
  } finally {
    await problemStore.deleteProblem(id).catch(() => {});
  }
});
