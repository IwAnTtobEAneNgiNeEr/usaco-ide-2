"use strict";

// Route-level tests for routes/lab.js's Stress Tester (POST /:id/stress) —
// specifically the seed-space bug fix: a second "Chạy stress" click used to
// always loop seeds 1..iterations again, deterministically re-running the
// EXACT SAME generator outputs as the first click (a generator seeded by an
// integer argv is deterministic by construction) — so hitting the button
// twice never actually stress-tested anything new. Fixed by picking a fresh
// random base seed per run (loop becomes base+1..base+iterations), with an
// explicit `baseSeed` override for reproducible tests, plus a cumulative
// stressSeedsRan counter persisted on the problem.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

// Deliberately bug-free: generator emits the seed as a single int, main and
// brute both echo it back identically — `found` is always false, so these
// tests only exercise the seed-range/cumulative-counter bookkeeping, not the
// (separately-tested-elsewhere) comparison/diff logic.
const GEN_CODE = '#include <bits/stdc++.h>\nusing namespace std;\nint main(int argc,char**argv){int seed=atoi(argv[1]);printf("%d\\n",seed);}';
const ECHO_CODE = "#include <bits/stdc++.h>\nusing namespace std;\nint main(){int x;cin>>x;cout<<x<<endl;}";

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
async function withProblem(overrides, run) {
  const meta = await problemStore.createProblem({ title: "zz-lab-stress-test", ...overrides });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
}
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("POST /stress: an explicit baseSeed controls the exact seed range (reproducible)", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const r = await postJson(base, `/api/problems/${id}/stress`, {
      genCode: GEN_CODE, bruteCode: ECHO_CODE, mainCode: ECHO_CODE, iterations: 5, baseSeed: 1000,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.found, false);
    assert.equal(r.json.ran, 5);
    assert.equal(r.json.seedRangeStart, 1001);
    assert.equal(r.json.seedRangeEnd, 1005);
  }));
});

test("POST /stress: two runs WITHOUT baseSeed explore DIFFERENT seed ranges (not always 1..iterations)", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const first = await postJson(base, `/api/problems/${id}/stress`, {
      genCode: GEN_CODE, bruteCode: ECHO_CODE, mainCode: ECHO_CODE, iterations: 10,
    });
    const second = await postJson(base, `/api/problems/${id}/stress`, {
      genCode: GEN_CODE, bruteCode: ECHO_CODE, mainCode: ECHO_CODE, iterations: 10,
    });
    assert.equal(first.json.ok, true);
    assert.equal(second.json.ok, true);
    assert.notEqual(first.json.seedRangeStart, second.json.seedRangeStart,
      "a second click must not silently re-run the exact same seed range as the first");
  }));
});

test("POST /stress: totalSeedsRan accumulates cumulatively across separate runs on the same problem", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const first = await postJson(base, `/api/problems/${id}/stress`, {
      genCode: GEN_CODE, bruteCode: ECHO_CODE, mainCode: ECHO_CODE, iterations: 7, baseSeed: 1,
    });
    assert.equal(first.json.totalSeedsRan, 7);

    const second = await postJson(base, `/api/problems/${id}/stress`, {
      genCode: GEN_CODE, bruteCode: ECHO_CODE, mainCode: ECHO_CODE, iterations: 3, baseSeed: 500,
    });
    assert.equal(second.json.totalSeedsRan, 10, "second run adds on top of the first, not a fresh replay");

    const meta = await problemStore.readMeta(id);
    assert.equal(meta.stressSeedsRan, 10);
  }));
});
