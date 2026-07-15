"use strict";

// Route-level tests for routes/arena-memoir.js (S10). Both routes are
// READ-ONLY (they never call ratingStore.applyAndSave/cardStore.mint), so —
// unlike arena-match-route.test.js/arena-weekly-route.test.js — there is
// nothing here that needs snapshot/restore of the real data/ files: this
// suite only asserts on STRUCTURE, never exact values, precisely so it stays
// safe to run concurrently with other test files that DO mutate those same
// shared global files.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const { appendEvent } = require("../src/recorder");
const fileStore = require("../src/fileStore");
const { buildApp } = require("../server");

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-memoir-route-test" });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
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

test("GET /memoir on a problem with no events ever: honest 'nothing to tell yet' peak", async () => {
  await withProblem((id) => withServer(async (base) => {
    const r = await fetch(`${base}/api/problems/${id}/memoir`);
    const json = await r.json();
    assert.equal(r.status, 200);
    assert.ok(json.peak); // buildNotes always returns at least one line for zero attempts
    assert.ok(Array.isArray(json.lines));
  }));
});

test("GET /memoir on a problem with a real clean-AC timeline reports it", async () => {
  await withProblem((id) => withServer(async (base) => {
    const dir = fileStore.problemDir(id);
    await appendEvent(dir, "open-statement", {}, { now: 1000 });
    await appendEvent(dir, "verdict", { verdict: "AC", passed: 1, total: 1 }, { now: 2000 });

    const r = await fetch(`${base}/api/problems/${id}/memoir`);
    const json = await r.json();
    assert.equal(json.peak, "Sạch: AC nộp phát một.");
  }));
});

test("GET /api/arena/reel returns the documented shape regardless of ambient real data", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/arena/reel`);
    const json = await r.json();
    assert.equal(r.status, 200);
    assert.equal(json.ok, true);
    assert.ok("hasMatches" in json);
    assert.ok(Number.isInteger(json.matchCount));
  });
});
