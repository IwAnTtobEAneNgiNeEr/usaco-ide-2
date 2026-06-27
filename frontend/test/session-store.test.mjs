import test from "node:test";
import assert from "node:assert/strict";
import { loadSession, saveSession, seedFromLegacy } from "../src/core/session-store.js";

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

test("missing envelope seeds free + pulls legacy lastProblem", () => {
  const s = loadSession(fakeStorage({ "usaco2.lastProblem": "p7" }));
  assert.equal(s.workspaceId, "free");
  assert.deepEqual(s.overrides, {});
  assert.equal(s.lastProblem, "p7");
  assert.ok(s.startedAt);
});

test("saveSession round-trips through loadSession", () => {
  const store = fakeStorage();
  saveSession(store, { workspaceId: "contest", overrides: { sounds: true }, lastProblem: "p1", startedAt: "t" });
  const s = loadSession(store);
  assert.equal(s.workspaceId, "contest");
  assert.deepEqual(s.overrides, { sounds: true });
});

test("corrupt JSON falls back to a seeded session, never throws", () => {
  const store = fakeStorage({ "usaco2.session.v1": "{not json" });
  let s;
  assert.doesNotThrow(() => { s = loadSession(store); });
  assert.equal(s.workspaceId, "free");
});

test("seedFromLegacy returns a free session when storage is empty", () => {
  const s = seedFromLegacy(fakeStorage());
  assert.equal(s.workspaceId, "free");
  assert.equal(s.lastProblem, null);
});
