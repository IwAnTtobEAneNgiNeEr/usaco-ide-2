"use strict";

// Route-level test for GET /api/problems/:id/ghost (S8). Writes real
// session-log.jsonl events directly via recorder.appendEvent (so timestamps
// are fully controlled) against throwaway zz-* problems, same convention as
// problems-event.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const { appendEvent } = require("../src/recorder");
const { buildApp } = require("../server");

async function withProblems(specs, run) {
  const ids = [];
  try {
    for (const spec of specs) {
      const meta = await problemStore.createProblem({ title: `zz-ghost-${spec.key}`, ...spec.create });
      ids.push(meta.id);
      if (spec.rating) await problemStore.updateProblem(meta.id, { analysis: { cfRating: spec.rating } });
      if (spec.solved) await problemStore.updateProblem(meta.id, { status: "solved", lastVerdict: "AC" });
      for (const [t, type, data] of spec.events || []) await appendEvent(require("../src/fileStore").problemDir(meta.id), type, data, { now: t });
    }
    return await run(ids);
  } finally {
    await Promise.all(ids.map((id) => problemStore.deleteProblem(id)));
  }
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try { resolve(await run(`http://127.0.0.1:${port}`)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

// This suite runs against the REAL dev workspace (same as every other route
// test file here), which already has ~115 real problems with real cfRating
// estimates clustered at round hundreds (800-1800). Using a rating band far
// outside that real range (3200s) keeps these assertions deterministic
// regardless of what else lives in the workspace.
const ISOLATED_BAND = 3200;

test("GET /ghost: not enough same-band solved candidates → available:false, never fabricated", async () => {
  await withProblems([{ key: "target", rating: ISOLATED_BAND }], (ids) => withServer(async (base) => {
    const r = await fetch(`${base}/api/problems/${ids[0]}/ghost`);
    const json = await r.json();
    assert.equal(json.ok, true);
    assert.equal(json.available, false);
  }));
});

test("GET /ghost: with 3+ similar-band solved problems, reports a real baseline comparison", async () => {
  await withProblems([
    { key: "a", rating: ISOLATED_BAND, solved: true, events: [[0, "open-statement", {}], [10000, "verdict", { verdict: "AC" }]] },
    { key: "b", rating: ISOLATED_BAND + 50, solved: true, events: [[0, "open-statement", {}], [20000, "verdict", { verdict: "AC" }]] },
    { key: "c", rating: ISOLATED_BAND - 50, solved: true, events: [[0, "open-statement", {}], [30000, "verdict", { verdict: "AC" }]] },
    { key: "far", rating: ISOLATED_BAND + 700, solved: true, events: [[0, "open-statement", {}], [1000, "verdict", { verdict: "AC" }]] }, // out of band — must be excluded
    { key: "target", rating: ISOLATED_BAND, events: [[0, "open-statement", {}], [5000, "verdict", { verdict: "WA" }]] },
  ], (ids) => withServer(async (base) => {
    const targetId = ids[ids.length - 1];
    const r = await fetch(`${base}/api/problems/${targetId}/ghost`);
    const json = await r.json();
    assert.equal(json.ok, true);
    assert.equal(json.available, true);
    assert.equal(json.sampleCount, 3);
    assert.equal(json.baselineMedianMs, 20000); // median of 10000/20000/30000
  }));
});
