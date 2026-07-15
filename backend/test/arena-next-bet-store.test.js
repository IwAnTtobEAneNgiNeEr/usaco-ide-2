"use strict";

// Tests for arena/nextBetStore.js — real fs read/write against a throwaway
// tmp file, same convention as arena-card-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const nextBetStore = require("../src/arena/nextBetStore");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-arena-next-bet-"));
  return path.join(dir, "arena-next-bet.json");
}

test("load returns no committed pick when no file exists yet", async () => {
  const file = await tmpFile();
  const state = await nextBetStore.load(file);
  assert.equal(state.mysteryPick, null);
  assert.equal(state.lastRerollAt, null);
});

test("commitPick persists a fresh, unopened pick", async () => {
  const file = await tmpFile();
  const pick = await nextBetStore.commitPick(file, "bai-a", "t1");
  assert.equal(pick.problemId, "bai-a");
  assert.equal(pick.committedAt, "t1");
  assert.equal(pick.openedAt, null);

  const reloaded = await nextBetStore.getPick(file);
  assert.deepEqual(reloaded, pick);
});

test("openPick marks the committed pick as opened, idempotently", async () => {
  const file = await tmpFile();
  await nextBetStore.commitPick(file, "bai-a", "t1");
  const opened = await nextBetStore.openPick(file, "t2");
  assert.equal(opened.openedAt, "t2");

  const openedAgain = await nextBetStore.openPick(file, "t3");
  assert.equal(openedAgain.openedAt, "t2", "re-opening must not move the original openedAt");
});

test("openPick on an empty store is a documented no-op", async () => {
  const file = await tmpFile();
  const result = await nextBetStore.openPick(file, "t1");
  assert.equal(result, null);
});

test("clearPick removes the committed pick (used after the opened problem is solved)", async () => {
  const file = await tmpFile();
  await nextBetStore.commitPick(file, "bai-a", "t1");
  await nextBetStore.clearPick(file);
  assert.equal(await nextBetStore.getPick(file), null);
});

test("reroll: allowed with no prior reroll, commits a new pick and stamps lastRerollAt", async () => {
  const file = await tmpFile();
  await nextBetStore.commitPick(file, "bai-a", "t1");
  const result = await nextBetStore.reroll(file, "bai-b", "t2", { cooldownMs: 86400000 });
  assert.equal(result.ok, true);
  assert.equal(result.mysteryPick.problemId, "bai-b");
  assert.equal(result.mysteryPick.openedAt, null);
});

test("reroll: refused once the current pick has already been opened", async () => {
  const file = await tmpFile();
  await nextBetStore.commitPick(file, "bai-a", "t1");
  await nextBetStore.openPick(file, "t2");
  const result = await nextBetStore.reroll(file, "bai-b", "t3", { cooldownMs: 86400000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "already-opened");
});

test("reroll: refused inside the cooldown window, allowed once it elapses", async () => {
  const file = await tmpFile();
  await nextBetStore.commitPick(file, "bai-a", "2026-07-07T00:00:00.000Z");
  const first = await nextBetStore.reroll(file, "bai-b", "2026-07-07T00:30:00.000Z", { cooldownMs: 86400000 });
  assert.equal(first.ok, true); // spends the "free" first reroll — lastRerollAt is now stamped

  const tooSoon = await nextBetStore.reroll(file, "bai-c", "2026-07-07T01:00:00.000Z", { cooldownMs: 86400000 });
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, "cooldown");

  const later = await nextBetStore.reroll(file, "bai-d", "2026-07-08T01:00:00.000Z", { cooldownMs: 86400000 });
  assert.equal(later.ok, true);
  assert.equal(later.mysteryPick.problemId, "bai-d");
});
