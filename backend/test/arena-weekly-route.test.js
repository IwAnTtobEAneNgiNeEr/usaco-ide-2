"use strict";

// Route-level test for routes/arena-weekly.js (S9). Touches the REAL
// data/arena-weekly.json (hardcoded path, same as arena-rating.js/arena-
// cards.js) — snapshotted and restored, same technique as the other route tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const WEEKLY_FILE = path.join(config.DATA_DIR, "arena-weekly.json");
let snapshot;
test.before(async () => { snapshot = await fsp.readFile(WEEKLY_FILE, "utf8").catch(() => null); });
test.after(async () => {
  if (snapshot == null) await fsp.rm(WEEKLY_FILE, { force: true });
  else await fsp.writeFile(WEEKLY_FILE, snapshot, "utf8");
});

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
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-weekly-route-test" });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
}

test("POST /weekly/start rejects an unknown problem id", async () => {
  await withServer(async (base) => {
    const r = await postJson(base, "/api/arena/weekly/start", { problemIds: ["does-not-exist-zz"], durationMin: 60 });
    assert.equal(r.status, 400);
  });
});

test("POST /weekly/start then GET: session is open, standing shows nothing solved yet", async () => {
  await withProblem((id) => withServer(async (base) => {
    const start = await postJson(base, "/api/arena/weekly/start", { problemIds: [id], durationMin: 60 });
    assert.equal(start.status, 201);
    assert.equal(start.json.session.open, true);

    const got = await getJson(base, `/api/arena/weekly/${start.json.session.id}`);
    assert.equal(got.json.session.standing.solvedCount, 0);
  }));
});

test("POST /submit records a real AC and updates standing; a bad problemId is rejected", async () => {
  await withProblem((id) => withServer(async (base) => {
    const start = await postJson(base, "/api/arena/weekly/start", { problemIds: [id], durationMin: 60 });
    const sessionId = start.json.session.id;

    const bad = await postJson(base, `/api/arena/weekly/${sessionId}/submit`, { problemId: "not-in-session", verdict: "AC" });
    assert.equal(bad.status, 400);

    const ok = await postJson(base, `/api/arena/weekly/${sessionId}/submit`, { problemId: id, verdict: "AC" });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.session.standing.solvedCount, 1);
  }));
});

test("POST /close then /submit: a closed session rejects further submissions", async () => {
  await withProblem((id) => withServer(async (base) => {
    const start = await postJson(base, "/api/arena/weekly/start", { problemIds: [id], durationMin: 60 });
    const sessionId = start.json.session.id;
    const closed = await postJson(base, `/api/arena/weekly/${sessionId}/close`);
    assert.equal(closed.json.session.open, false);

    const late = await postJson(base, `/api/arena/weekly/${sessionId}/submit`, { problemId: id, verdict: "AC" });
    assert.equal(late.status, 400);
    assert.equal(late.json.reason, "closed");
  }));
});

test("GET on an unknown session 404s", async () => {
  await withServer(async (base) => {
    const r = await getJson(base, "/api/arena/weekly/does-not-exist");
    assert.equal(r.status, 404);
  });
});
