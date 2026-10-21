"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const prefixSumTrace = require("../src/prefixSumTrace");
const evidenceStore = require("../src/evidenceStore");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const ZERO_CODE = `long long a[100], prefix[101];
void build(int n){ for(int i=0;i<n;i++) prefix[i+1] = prefix[i] + a[i]; }
long long query(int l,int r){ return prefix[r+1] - prefix[l]; }`;
const ONE_CODE = `long long a[101], pref[101];
void build(int n){ for(int i=1;i<=n;i++) pref[i] = pref[i-1] + a[i]; }
long long query(int l,int r){ return pref[r] - pref[l-1]; }`;

test("0-based prefix analysis covers construction, boundaries, multiple queries, and off-by-one witness", () => {
  const input = "5\n3 -1 4 2 5\n4\n0 0\n0 4\n1 3\n4 4\n";
  const result = prefixSumTrace.tracePrefixSum({ code: ZERO_CODE, input, verdict: "WA" });
  assert.equal(result.supported, true);
  assert.equal(result.indexMapping.inputBase, 0);
  assert.deepEqual(result.prefix, [0, 3, 2, 6, 8, 13]);
  assert.deepEqual(result.queries.map((query) => query.result), [3, 13, 5, 5]);
  assert.ok(result.queries.every((query) => query.result === query.directSum));
  assert.equal(result.offByOneCounterexample.available, true);
  assert.notEqual(result.offByOneCounterexample.correctResult, result.offByOneCounterexample.wrongResult);
});

test("1-based prefix analysis maps boundaries and multiple queries correctly", () => {
  const input = "4\n7 0 -2 6\n3\n1 1\n1 4\n3 4\n";
  const result = prefixSumTrace.tracePrefixSum({ code: ONE_CODE, input, verdict: "AC" });
  assert.equal(result.supported, true);
  assert.equal(result.indexMapping.inputBase, 1);
  assert.deepEqual(result.queries.map((query) => query.result), [7, 11, 4]);
  assert.equal(result.queries[0].mapping.leftPrefixIndex, 0);
  assert.equal(result.queries[1].mapping.rightPrefixIndex, 4);
});

test("prefix analysis rejects mismatched query bounds and unsupported source instead of inventing output", () => {
  assert.match(prefixSumTrace.tracePrefixSum({ code: ZERO_CODE, input: "2 1 2 1 0 2" }).reason, /query-range/);
  const unsupported = prefixSumTrace.tracePrefixSum({ code: "int main(){}", input: "1 5 1 0 0" });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.reason, "unsupported-code-shape");
  assert.equal(unsupported.queries, undefined);
  const overflow = prefixSumTrace.tracePrefixSum({ code: ZERO_CODE, input: `2 ${Number.MAX_SAFE_INTEGER} 1 0` });
  assert.equal(overflow.supported, false);
  assert.match(overflow.reason, /overflow-risk/);
});

async function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); } catch (error) { reject(error); } finally { server.close(); }
  }));
}

test("Prefix Sum route analyzes only stored evidence", async () => {
  const input = "3\n2 4 8\n2\n0 2\n1 1\n";
  const meta = await problemStore.createProblem({ title: "zz-prefix-trace", code: ZERO_CODE });
  try {
    const runId = evidenceStore.createRunId();
    // Save the complete immutable evidence once below, not via snapshot as well.
    const record = await problemStore.recordRun(meta.id, { id: runId, type: "judge", verdict: "WA" });
    await evidenceStore.saveRunEvidence(meta.id, { record, code: ZERO_CODE, result: { compileOk: true, results: [{ testId: "01", status: "WA", input, expected: "14", actual: "6" }] } });
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/problems/${meta.id}/analysis/prefix-sum-trace`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId: runId, input: "fake" }),
      });
      const { analysis } = await response.json();
      assert.equal(response.status, 200);
      assert.equal(analysis.supported, true);
      assert.equal(analysis.evidence.runId, runId);
      assert.deepEqual(analysis.queries.map((query) => query.result), [14, 4]);
      assert.equal("completion" in analysis, false, "analysis must not manufacture a fresh win");
    });
  } finally { await problemStore.deleteProblem(meta.id); }
});
