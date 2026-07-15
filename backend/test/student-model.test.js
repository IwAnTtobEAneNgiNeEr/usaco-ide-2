"use strict";

// Tests for the Student Model store (README-LOOPS.md §3.3, task B2).
// Every fact recorded here must carry a `count` and `evidence` — this is the
// codebase's "no vibes, only evidence" rule, enforced in code so no writer
// (Autopsy, Game Review, judge) can slip an un-evidenced claim in.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const studentModel = require("../src/studentModel");

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-student-model-"));
  return path.join(dir, "student-model.json");
}

// ---- empty / read -----------------------------------------------------------------

test("load returns a v1 skeleton when no file exists yet", async () => {
  const file = await tmpFile();
  const model = await studentModel.load(file);
  assert.equal(model.version, 1);
  assert.deepEqual(model.recurringBugs, []);
  assert.deepEqual(model.paceByTopic, []);
  assert.deepEqual(model.habits, []);
});

// ---- recurring bugs: create then bump -----------------------------------------------

test("noteRecurringBug creates a tag on first sighting with count 1", async () => {
  const file = await tmpFile();
  await studentModel.noteRecurringBug(file, {
    tag: "long-long-overflow",
    seenAt: "2026-06-28",
    evidence: "autopsy/2026-06-28T10-00.json",
  });
  const model = await studentModel.load(file);
  assert.equal(model.recurringBugs.length, 1);
  assert.equal(model.recurringBugs[0].tag, "long-long-overflow");
  assert.equal(model.recurringBugs[0].count, 1);
  assert.equal(model.recurringBugs[0].lastSeen, "2026-06-28");
  assert.deepEqual(model.recurringBugs[0].evidence, ["autopsy/2026-06-28T10-00.json"]);
});

test("noteRecurringBug bumps count and lastSeen on repeat sightings, keeps prior evidence", async () => {
  const file = await tmpFile();
  await studentModel.noteRecurringBug(file, { tag: "off-by-one", seenAt: "2026-06-01", evidence: "e1" });
  await studentModel.noteRecurringBug(file, { tag: "off-by-one", seenAt: "2026-06-15", evidence: "e2" });
  await studentModel.noteRecurringBug(file, { tag: "off-by-one", seenAt: "2026-06-10", evidence: "e3" }); // out of order arrival
  const model = await studentModel.load(file);
  assert.equal(model.recurringBugs.length, 1);
  assert.equal(model.recurringBugs[0].count, 3);
  assert.equal(model.recurringBugs[0].lastSeen, "2026-06-15"); // max, not most-recent-call
  assert.deepEqual(model.recurringBugs[0].evidence, ["e1", "e2", "e3"]);
});

test("noteRecurringBug caps stored evidence to the most recent 20 entries", async () => {
  const file = await tmpFile();
  for (let i = 0; i < 25; i += 1) {
    await studentModel.noteRecurringBug(file, { tag: "x", seenAt: `2026-01-${String(i + 1).padStart(2, "0")}`, evidence: `e${i}` });
  }
  const model = await studentModel.load(file);
  assert.equal(model.recurringBugs[0].count, 25);
  assert.equal(model.recurringBugs[0].evidence.length, 20);
  assert.equal(model.recurringBugs[0].evidence[19], "e24");
});

test("noteRecurringBug rejects calls missing tag or evidence", async () => {
  const file = await tmpFile();
  await assert.rejects(() => studentModel.noteRecurringBug(file, { seenAt: "2026-06-01", evidence: "e" }), /tag/i);
  await assert.rejects(() => studentModel.noteRecurringBug(file, { tag: "x", seenAt: "2026-06-01" }), /evidence/i);
});

// ---- pace by topic: running median-ish aggregate ------------------------------------

test("noteSolveTime accumulates samples and recomputes medianSolveMin", async () => {
  const file = await tmpFile();
  await studentModel.noteSolveTime(file, { topic: "graph", minutes: 40 });
  await studentModel.noteSolveTime(file, { topic: "graph", minutes: 20 });
  await studentModel.noteSolveTime(file, { topic: "graph", minutes: 60 });
  const model = await studentModel.load(file);
  const entry = model.paceByTopic.find((p) => p.topic === "graph");
  assert.equal(entry.samples, 3);
  assert.equal(entry.medianSolveMin, 40);
});

test("noteSolveTime keeps separate entries per topic", async () => {
  const file = await tmpFile();
  await studentModel.noteSolveTime(file, { topic: "graph", minutes: 40 });
  await studentModel.noteSolveTime(file, { topic: "dp", minutes: 15 });
  const model = await studentModel.load(file);
  assert.equal(model.paceByTopic.length, 2);
});

// ---- habits ------------------------------------------------------------------------

test("noteHabit creates then bumps like recurring bugs, with evidence required", async () => {
  const file = await tmpFile();
  await assert.rejects(() => studentModel.noteHabit(file, { tag: "fix-before-reread" }), /evidence/i);
  await studentModel.noteHabit(file, { tag: "fix-before-reread", evidence: "session:abc#3" });
  await studentModel.noteHabit(file, { tag: "fix-before-reread", evidence: "session:abc#7" });
  const model = await studentModel.load(file);
  assert.equal(model.habits.length, 1);
  assert.equal(model.habits[0].count, 2);
  assert.deepEqual(model.habits[0].evidence, ["session:abc#3", "session:abc#7"]);
});

// ---- concurrency: interleaved writers must not clobber each other -------------------

test("concurrent writers to the same file never lose an update", async () => {
  const file = await tmpFile();
  await Promise.all([
    studentModel.noteRecurringBug(file, { tag: "a", seenAt: "2026-01-01", evidence: "e-a" }),
    studentModel.noteRecurringBug(file, { tag: "b", seenAt: "2026-01-01", evidence: "e-b" }),
    studentModel.noteHabit(file, { tag: "h", evidence: "e-h" }),
    studentModel.noteSolveTime(file, { topic: "dp", minutes: 10 }),
  ]);
  const model = await studentModel.load(file);
  assert.equal(model.recurringBugs.length, 2);
  assert.equal(model.habits.length, 1);
  assert.equal(model.paceByTopic.length, 1);
});

// ---- mastery is a read-through pointer, not a duplicated source of truth ------------

test("mastery is always an empty array from the store itself (read from /api/stats/skills instead)", async () => {
  const file = await tmpFile();
  await studentModel.noteHabit(file, { tag: "h", evidence: "e" });
  const model = await studentModel.load(file);
  assert.deepEqual(model.mastery, []);
});
