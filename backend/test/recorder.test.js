"use strict";

// Tests for the Event Recorder (README-LOOPS.md §3.2, task B1).
// Contract: fire-and-forget JSONL append, never throws into the caller's hot
// path, rotates past a byte budget, and tolerates a crash-truncated last line
// when read back.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const recorder = require("../src/recorder");

async function tmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "usaco-recorder-"));
}

// ---- buildEventLine (pure) -------------------------------------------------------

test("buildEventLine rejects unknown event types", () => {
  assert.throws(() => recorder.buildEventLine("teleport", {}, 1), /unknown event type/i);
});

test("buildEventLine stamps t/type/data and ends with a newline", () => {
  const line = recorder.buildEventLine("run", { runId: "abc" }, 12345);
  assert.equal(line.endsWith("\n"), true);
  const parsed = JSON.parse(line.trim());
  assert.deepEqual(parsed, { t: 12345, type: "run", data: { runId: "abc" } });
});

test("buildEventLine rejects non-object data", () => {
  assert.throws(() => recorder.buildEventLine("tab", "nope", 1), /plain object/i);
  assert.throws(() => recorder.buildEventLine("tab", ["nope"], 1), /plain object/i);
});

test("buildEventLine rejects oversized payloads (no full-code snapshots)", () => {
  const huge = { blob: "x".repeat(recorder.MAX_EVENT_CHARS) };
  assert.throws(() => recorder.buildEventLine("edit-snapshot", huge, 1), /exceeds/i);
});

// ---- recordEvent / readEvents (fs-backed) ----------------------------------------

test("recordEvent creates the dir, appends a line, and readEvents reads it back", async () => {
  const dir = await tmpDir();
  try {
    const res = await recorder.recordEvent(dir, "verdict", { verdict: "AC", timeMs: 85 });
    assert.equal(res.ok, true);
    const events = await recorder.readEvents(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "verdict");
    assert.equal(events[0].data.verdict, "AC");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("recordEvent never rejects, even for invalid input", async () => {
  const dir = await tmpDir();
  try {
    const res = await recorder.recordEvent(dir, "not-a-real-type", {});
    assert.equal(res.ok, false);
    assert.match(res.error, /unknown event type/i);
    const events = await recorder.readEvents(dir);
    assert.equal(events.length, 0); // bad event never touched disk
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("sequential recordEvent calls append in call order", async () => {
  const dir = await tmpDir();
  try {
    await Promise.all([
      recorder.recordEvent(dir, "run", { i: 1 }),
      recorder.recordEvent(dir, "run", { i: 2 }),
      recorder.recordEvent(dir, "run", { i: 3 }),
    ]);
    const events = await recorder.readEvents(dir);
    assert.deepEqual(events.map((e) => e.data.i), [1, 2, 3]);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("readEvents returns [] for a directory with no log yet", async () => {
  const dir = await tmpDir();
  try {
    assert.deepEqual(await recorder.readEvents(dir), []);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("readEvents skips a crash-truncated final line", async () => {
  const dir = await tmpDir();
  try {
    await recorder.recordEvent(dir, "idle", { ms: 500 });
    const filePath = path.join(dir, recorder.LOG_FILENAME);
    await fsp.appendFile(filePath, '{"t":1,"type":"run","data":{truncat', "utf8");
    const events = await recorder.readEvents(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "idle");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// ---- rotation ---------------------------------------------------------------------

test("rotates the log to a .old file once it crosses maxBytes", async () => {
  const dir = await tmpDir();
  try {
    await recorder.recordEvent(dir, "run", { pad: "x".repeat(80) }, { maxBytes: 50 });
    // first write always lands in the live file regardless of budget (nothing to rotate yet)
    let events = await recorder.readEvents(dir);
    assert.equal(events.length, 1);

    await recorder.recordEvent(dir, "run", { i: "second" }, { maxBytes: 50 });
    const filePath = path.join(dir, recorder.LOG_FILENAME);
    const entries = await fsp.readdir(dir);
    const rotated = entries.filter((f) => f !== recorder.LOG_FILENAME);
    assert.equal(rotated.length, 1, "expected exactly one rotated .old file");

    events = await recorder.readEvents(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].data.i, "second");
    assert.equal((await fsp.stat(filePath)).size > 0, true);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// ---- recordProblemEvent wiring -----------------------------------------------------

test("recordProblemEvent writes under the configured problem workspace dir", async () => {
  const { problemDir } = require("../src/fileStore");
  const id = `recorder-wiring-test-${Date.now()}`;
  try {
    const res = await recorder.recordProblemEvent(id, "open-statement", {});
    assert.equal(res.ok, true);
    const events = await recorder.readEvents(problemDir(id));
    assert.equal(events.length, 1);
  } finally {
    await fsp.rm(problemDir(id), { recursive: true, force: true });
  }
});
