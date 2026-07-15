"use strict";

// Proves routes/moment.js's persistDiagnosis actually calls arena/cardStore.mint
// on a successful diagnosis — same withServer/withStubs technique and same
// disk-hygiene stance as moment-autoshrink.test.js (fileStore/studentModel
// stubbed so nothing touches real disk; cardStore.mint is stubbed to a spy
// for the same reason, and to keep this file decoupled from cardStore's own
// already-tested internals).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const express = require("express");

const settingsStore = require("../src/settingsStore");
const problemStore = require("../src/problemStore");
const fileStore = require("../src/fileStore");
const studentModel = require("../src/studentModel");
const cardStore = require("../src/arena/cardStore");
const ai = require("../src/ai");
const { cacheKey } = require("../src/moment/diagnose");
const momentRouter = require("../src/routes/moment");

// recordProblemEvent is destructured at require-time in routes/moment.js (a
// whole-module stub from outside can't reach it — same note as
// moment-autoshrink.test.js), so it really does append a session-log.jsonl
// under these disposable fake ids on real disk. Clean them up.
const FAKE_IDS = ["zz-card-mint-1", "zz-card-mint-2", "zz-card-mint-3"];
test.after(async () => {
  await Promise.all(FAKE_IDS.map((id) => fs.rm(fileStore.problemDir(id), { recursive: true, force: true })));
});

function withServer(run) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/problems", momentRouter);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const port = server.address().port;
      try { resolve(await run(port)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

async function streamDiagnose(port, id, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/problems/${id}/moment-diagnose`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text.split("\n\n").filter(Boolean).map((chunk) => {
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    return line ? JSON.parse(line.slice(6)) : null;
  }).filter(Boolean);
  return { status: res.status, events };
}

function withStubs(stubs, fn) {
  const orig = stubs.map(([obj, key]) => obj[key]);
  stubs.forEach(([obj, key, value]) => { obj[key] = value; });
  return withServer(fn).finally(() => { stubs.forEach(([obj, key], i) => { obj[key] = orig[i]; }); });
}

// Give the fire-and-forget persistDiagnosis IIFE a tick to run before asserting.
const settle = () => new Promise((r) => setTimeout(r, 30));

function baseStubs(mintSpy) {
  return [
    [fileStore, "readJson", async () => null], // cache miss — always run the full pipeline
    [fileStore, "writeJson", async () => {}],
    [studentModel, "noteRecurringBug", async () => {}],
    [cardStore, "mint", mintSpy],
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "đề" : "int main(){}")],
  ];
}

test("a successful non-'khac' diagnosis mints a Bug Card with a moment/ evidence pointer", async () => {
  const calls = [];
  const mintSpy = async (file, tag, opts) => { calls.push({ file, tag, opts }); return { minted: true }; };
  await withStubs([
    ...baseStubs(mintSpy),
    [ai, "chat", async ({ onDelta }) => {
      const r = "TAG: bien-tran\nLINES: 3\nVISAO: tràn số nguyên.\nGOIY: thử giá trị lớn.";
      onDelta(r); return r;
    }],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, "zz-card-mint-1", {
      verdict: "WA", test: { testId: "t1", input: "1 2", expected: "3", actual: "4" },
    });
    assert.equal(status, 200);
    assert.ok(events.some((e) => e.done));
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tag, "bien-tran");
    assert.match(calls[0].opts.evidence, /^problems\/zz-card-mint-1\/moment\/\d+\.json$/);
  });
});

test("a diagnosis that resolves to 'khac' never mints a card (matches the Student Model skip rule)", async () => {
  const calls = [];
  const mintSpy = async (...args) => { calls.push(args); return { minted: false }; };
  await withStubs([
    ...baseStubs(mintSpy),
    [ai, "chat", async ({ onDelta }) => {
      const r = "TAG: khong-hop-le\nLINES: 1\nVISAO: chưa rõ.\nGOIY: xem lại.";
      onDelta(r); return r; // unknown tag -> parseDiagnosis normalizes to "khac"
    }],
  ], async (port) => {
    await streamDiagnose(port, "zz-card-mint-2", {
      verdict: "WA", test: { testId: "t1", input: "1", expected: "2", actual: "3" },
    });
    await settle();
    assert.equal(calls.length, 0);
  });
});

test("a cached diagnosis never re-mints (persistDiagnosis skips the whole evidence block on cache hit)", async () => {
  const calls = [];
  const mintSpy = async (...args) => { calls.push(args); return { minted: true }; };
  const cachedDiagnosis = { ok: true, tag: "off-by-one", tagLabel: "Lệch một đơn vị (off-by-one)", lines: [2], why: "vì", hint: "thử", raw: "" };
  // Match the EXACT cache key persistDiagnosis will compute for this request's
  // (code, testId, input, verdict) so this is a real, guaranteed cache hit —
  // not a coincidental one.
  const key = cacheKey({ code: "int main(){}", testId: "t1", input: "1", verdict: "WA" });
  await withStubs([
    ...baseStubs(mintSpy),
    [fileStore, "readJson", async () => ({ entries: { [key]: { diagnosis: cachedDiagnosis, savedAt: Date.now() } } })],
    [ai, "chat", async () => { throw new Error("must not be called on a cache hit"); }],
  ], async (port) => {
    const { events } = await streamDiagnose(port, "zz-card-mint-3", {
      verdict: "WA", test: { testId: "t1", input: "1", expected: "2", actual: "3" },
    });
    assert.ok(events.some((e) => e.cached === true));
    await settle();
    assert.equal(calls.length, 0, "a cache hit must never mint again");
  });
});
