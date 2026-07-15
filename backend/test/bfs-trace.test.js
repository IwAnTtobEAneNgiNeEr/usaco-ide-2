"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const bfsTrace = require("../src/bfsTrace");
const evidenceStore = require("../src/evidenceStore");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const SAFE_BFS = `#include <bits/stdc++.h>
using namespace std;
int dx[] = {0, 1, 0, -1};
int dy[] = {1, 0, -1, 0};
int d[20][20];
queue<pair<int,int>> q;
void bfs(int sx,int sy){
  d[sx][sy]=0; q.push({sx,sy});
  while(!q.empty()){
    auto cur=q.front(); q.pop();
    int x=cur.first,y=cur.second;
    for(int i=0;i<4;i++){
      int nx=x+dx[i],ny=y+dy[i];
      if(nx>=0 && ny>=0 && nx<20 && ny<20 && d[nx][ny]==-1){
        d[nx][ny]=d[x][y]+1; q.push({nx,ny});
      }
    }
  }
}`;

const UNSAFE_BFS = SAFE_BFS.replace(
  "if(nx>=0 && ny>=0 && nx<20 && ny<20 && d[nx][ny]==-1)",
  "if(d[nx][ny]==-1 && nx>=0 && ny>=0 && nx<20 && ny<20)"
);

const INPUT = "3 4\nS...\n##.#\n...T\n";

test("checked-in BFS fixture remains supported", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "bfs-supported.json"), "utf8"));
  const result = bfsTrace.traceGridBfs({ code: fixture.code, input: fixture.input, verdict: "WA" });
  assert.equal(result.supported, true);
  assert.equal(result.result.distance, 5);
  assert.ok(result.steps.length > 0);
});

test("recognized grid BFS trace is deterministic and exposes queue/visited/path", () => {
  const first = bfsTrace.traceGridBfs({ code: SAFE_BFS, input: INPUT, verdict: "WA" });
  const second = bfsTrace.traceGridBfs({ code: SAFE_BFS, input: INPUT, verdict: "WA" });
  assert.deepEqual(first, second);
  assert.equal(first.supported, true);
  assert.equal(first.deterministic, true);
  assert.equal(first.executionMode, "semantic-model-not-arbitrary-cpp-instrumentation");
  assert.equal(first.result.reachable, true);
  assert.equal(first.result.distance, 5);
  assert.deepEqual(first.result.path[0], { r: 0, c: 0 });
  assert.deepEqual(first.result.path.at(-1), { r: 2, c: 3 });
  assert.ok(first.steps.some((step) => step.discovered.length > 0));
  assert.ok(first.steps.every((step) => Number.isInteger(step.visitedCount)));
});

test("recognized source with unsafe bounds stays transparent and returns Work action", () => {
  const result = bfsTrace.traceGridBfs({ code: UNSAFE_BFS, input: INPUT, verdict: "AC" });
  assert.equal(result.supported, true);
  assert.equal(result.warnings[0].code, "bounds-after-index");
  assert.equal(result.nextAction.id, "return-to-work");
  assert.ok(result.nextAction.line > 0);
});

test("unrecognized C++ returns unsupported plus the exact visualizer fallback, never a trace", () => {
  const result = bfsTrace.traceGridBfs({ code: "int main(){}", input: INPUT, verdict: "WA" });
  assert.equal(result.supported, false);
  assert.equal(result.reason, "unsupported-code-shape");
  assert.equal(result.fallback.input, INPUT);
  assert.equal(result.fallback.visualizer.kind, "grid");
  assert.equal(result.steps, undefined);
  assert.match(result.nextAction.reason, /không bịa trace/);
});

test("invalid or oversized grid returns an honest unsupported reason", () => {
  assert.equal(bfsTrace.traceGridBfs({ code: SAFE_BFS, input: "not a grid" }).reason, "input-header");
  assert.equal(bfsTrace.traceGridBfs({ code: SAFE_BFS, input: "100 100\n" }).reason, "input-too-large");
});

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-bfs-trace", code: SAFE_BFS });
  try { return await run(meta.id); }
  finally { await problemStore.deleteProblem(meta.id); }
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); }
      catch (error) { reject(error); }
      finally { server.close(); }
    });
  });
}

test("BFS trace route can only analyze the code/input snapshot from stored evidence", async () => {
  await withProblem(async (id) => {
    const runId = evidenceStore.createRunId();
    const record = await problemStore.recordRun(id, {
      id: runId, type: "judge", verdict: "WA", passed: 0, total: 1,
      snapshot: { code: SAFE_BFS, stdout: "-1", stderr: "" },
    });
    await evidenceStore.saveRunEvidence(id, {
      record,
      code: SAFE_BFS,
      result: { compileOk: true, results: [{ testId: "01", status: "WA", input: INPUT, expected: "5", actual: "-1", stderr: "", timeMs: 1 }] },
    });

    await withServer(async (base) => {
      const response = await fetch(`${base}/api/problems/${id}/analysis/bfs-trace`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidenceId: runId, code: "int main(){}", input: "fake" }),
      });
      assert.equal(response.status, 200);
      const { analysis } = await response.json();
      assert.equal(analysis.supported, true);
      assert.equal(analysis.basis.codeHash, evidenceStore.toReference(await evidenceStore.readEvidence(id, runId)).codeHash);
      assert.equal(analysis.evidence.runId, runId);
      assert.equal(analysis.result.distance, 5);
    });
  });
});
