"use strict";

// Tests for arena/weeklyStore.js — real fs read/write against a throwaway tmp
// file, same convention as arena-rating-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const weeklyStore = require("../src/arena/weeklyStore");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-weekly-"));
  return path.join(dir, "arena-weekly.json");
}

test("createSession rejects an empty problem list", async () => {
  const file = await tmpFile();
  await assert.rejects(() => weeklyStore.createSession(file, { problemIds: [], durationMin: 60, now: 0 }));
});

test("createSession persists with a computed cutoffAt, readable via getSession", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1", "p2"], durationMin: 120, now: 1000 });
  assert.equal(session.cutoffAt, 1000 + 120 * 60000);
  assert.deepEqual(session.problemIds, ["p1", "p2"]);
  const reloaded = await weeklyStore.getSession(file, session.id);
  assert.equal(reloaded.id, session.id);
});

test("durationMin is clamped to a sane [15,300] window", async () => {
  const file = await tmpFile();
  const tooShort = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 1, now: 0 });
  assert.equal(tooShort.durationMin, 15);
  const tooLong = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 100000, now: 0 });
  assert.equal(tooLong.durationMin, 300);
});

test("submit accepts a problem in the session before the cutoff", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 60, now: 0 });
  const result = await weeklyStore.submit(file, session.id, { problemId: "p1", verdict: "AC", now: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.session.submissions.length, 1);
});

test("submit rejects a problem NOT in the session", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 60, now: 0 });
  const result = await weeklyStore.submit(file, session.id, { problemId: "not-in-session", verdict: "AC", now: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-in-session");
});

test("submit rejects anything at/after the cutoff — the server clock decides, not the client", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 15, now: 0 });
  const result = await weeklyStore.submit(file, session.id, { problemId: "p1", verdict: "AC", now: session.cutoffAt + 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "closed");
});

test("submit rejects everything once the session is force-closed, even before its natural cutoff", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 60, now: 0 });
  await weeklyStore.closeSession(file, session.id, 500);
  const result = await weeklyStore.submit(file, session.id, { problemId: "p1", verdict: "AC", now: 600 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "closed");
});

test("submit against an unknown session id is rejected cleanly", async () => {
  const file = await tmpFile();
  const result = await weeklyStore.submit(file, "does-not-exist", { problemId: "p1", verdict: "AC", now: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-found");
});

test("closeSession is idempotent — a second close never moves closedAt backward", async () => {
  const file = await tmpFile();
  const session = await weeklyStore.createSession(file, { problemIds: ["p1"], durationMin: 60, now: 0 });
  const first = await weeklyStore.closeSession(file, session.id, 100);
  const second = await weeklyStore.closeSession(file, session.id, 999999);
  assert.equal(first.session.closedAt, second.session.closedAt);
});
