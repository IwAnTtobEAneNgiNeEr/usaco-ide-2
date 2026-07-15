"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const dijkstraTrace = require("../src/dijkstraTrace");
const evidenceStore = require("../src/evidenceStore");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const CODE = `#include <bits/stdc++.h>
using namespace std;
vector<pair<int,int>> adj[20]; long long dist[20]; bool visited[20];
void dijkstra(int s){
  priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<pair<long long,int>>> pq;
  dist[s]=0; pq.push({0,s});
  while(!pq.empty()){
    auto [d,u]=pq.top(); pq.pop();
    if(visited[u]) continue; visited[u]=true;
    for(auto [v,w]:adj[u]) if(dist[v] > dist[u] + w){
      dist[v]=dist[u]+w; pq.push({dist[v],v});
    }
  }
}
void edge(int u,int v,int w){ adj[u].push_back({v,w}); adj[v].push_back({u,w}); }`;

const INPUT = "5 6\n1 2 4\n1 3 1\n3 2 2\n2 4 1\n3 4 5\n4 5 3\n1 5\n";

test("Dijkstra trace is deterministic and exposes heap, dist, visited, relaxations, and path", () => {
  const first = dijkstraTrace.traceDijkstra({ code: CODE, input: INPUT, verdict: "WA" });
  const second = dijkstraTrace.traceDijkstra({ code: CODE, input: INPUT, verdict: "WA" });
  assert.deepEqual(first, second);
  assert.equal(first.supported, true);
  assert.equal(first.graph.directed, false);
  assert.equal(first.result.distance, 7);
  assert.deepEqual(first.result.path, [1, 3, 2, 4, 5]);
  assert.ok(first.steps.every((step) => Array.isArray(step.heapBefore) && Array.isArray(step.dist) && Array.isArray(step.visited)));
  assert.ok(first.steps.some((step) => step.relaxations.some((relaxation) => relaxation.accepted)));
});

test("Dijkstra reports explicit unsupported reasons for code shape and negative weights", () => {
  const codeResult = dijkstraTrace.traceDijkstra({ code: "int main(){}", input: INPUT });
  assert.equal(codeResult.supported, false);
  assert.equal(codeResult.reason, "unsupported-code-shape");
  assert.ok(codeResult.details.includes("heapDeclaration"));
  const weightResult = dijkstraTrace.traceDijkstra({ code: CODE, input: "2 1\n1 2 -1\n1 2\n" });
  assert.equal(weightResult.supported, false);
  assert.match(weightResult.reason, /negative-weight/);
  const overflowResult = dijkstraTrace.traceDijkstra({ code: CODE, input: `2 1\n1 2 ${Number.MAX_SAFE_INTEGER}\n1 2\n` });
  assert.equal(overflowResult.supported, false);
  assert.match(overflowResult.reason, /overflow-risk/);
});

async function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); } catch (error) { reject(error); } finally { server.close(); }
  }));
}

test("Dijkstra route analyzes only the stored evidence snapshot", async () => {
  const meta = await problemStore.createProblem({ title: "zz-dijkstra-trace", code: CODE });
  try {
    const runId = evidenceStore.createRunId();
    const record = await problemStore.recordRun(meta.id, { id: runId, type: "judge", verdict: "WA", snapshot: { code: CODE } });
    await evidenceStore.saveRunEvidence(meta.id, { record, code: CODE, result: { compileOk: true, results: [{ testId: "01", status: "WA", input: INPUT, expected: "7", actual: "8" }] } });
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/problems/${meta.id}/analysis/dijkstra-trace`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId: runId, code: "fake", input: "fake" }),
      });
      const { analysis } = await response.json();
      assert.equal(response.status, 200);
      assert.equal(analysis.supported, true);
      assert.equal(analysis.evidence.runId, runId);
      assert.equal(analysis.result.distance, 7);
      assert.equal("completion" in analysis, false, "analysis must not manufacture a fresh win");
    });
  } finally { await problemStore.deleteProblem(meta.id); }
});
