"use strict";

// Tests for POST /api/problems/:id/event (README-AUTOPILOT.md M6) — the only
// door a client has into the recorder: an allowlist of two event types the
// frontend can observe but the server never naturally sees on its own
// ("open-statement", "timer"). "verdict"/"run" must stay server-only (routes/
// judge.js already has trustworthy context for those) — a client reporting
// its own verdict history would let a student fabricate progress, which the
// honesty rules (README-LOOPS.md §1.2) forbid.
//
// Real throwaway zz-* problems, same convention as problem-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fsp = require("node:fs/promises");

const problemStore = require("../src/problemStore");
const fileStore = require("../src/fileStore");
const { buildApp } = require("../server");

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-event-test", ...input });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
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

async function postEvent(base, id, body) {
  const res = await fetch(`${base}/api/problems/${id}/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function readLog(id) {
  const raw = await fsp.readFile(`${fileStore.problemDir(id)}/session-log.jsonl`, "utf-8").catch(() => "");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

test("open-statement and timer events are accepted and land in the session log", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const r1 = await postEvent(base, id, { type: "open-statement", data: {} });
    assert.equal(r1.status, 200);
    assert.equal(r1.json.ok, true);

    const r2 = await postEvent(base, id, { type: "timer", data: { action: "start", totalSec: 1500 } });
    assert.equal(r2.status, 200);

    // recordProblemEvent is fire-and-forget — give the write a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    const events = await readLog(id);
    assert.ok(events.some((e) => e.type === "open-statement"));
    const timerEvt = events.find((e) => e.type === "timer");
    assert.ok(timerEvt);
    assert.equal(timerEvt.data.action, "start");
    assert.equal(timerEvt.data.totalSec, 1500);
  }));
});

test("verdict/run/anything-not-allowlisted is rejected with 400 — clients cannot fabricate judge history", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    for (const type of ["verdict", "run", "autopsy", "made-up-type"]) {
      const r = await postEvent(base, id, { type, data: {} });
      assert.equal(r.status, 400, `expected 400 for type=${type}`);
      assert.equal(r.json.ok, false);
    }
    const events = await readLog(id);
    assert.equal(events.length, 0, "no rejected event should reach the log");
  }));
});

test("unknown problem id 404s (requireProblem gate still applies)", async () => {
  await withServer(async (base) => {
    const r = await postEvent(base, "does-not-exist-zz", { type: "open-statement", data: {} });
    assert.equal(r.status, 404);
  });
});
