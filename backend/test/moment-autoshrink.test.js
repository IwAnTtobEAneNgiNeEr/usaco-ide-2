"use strict";

// Tests for routes/moment.js's autoShrinkIfLarge (README-AUTOPILOT.md M4).
// Real g++ (this sandbox has it — autopsy-orchestrator.test.js already relies
// on that) with ai.generateHelper monkey-patched, mirroring that file's
// pattern exactly: no API key or network needed to prove the wiring.
//
// autoShrinkIfLarge isn't exported directly (it's route-local), so these
// tests drive it through the real express router end-to-end, the same way
// coach-chat.test.js exercises /api/ai/chat.
//
// Disk hygiene: fileStore.readJson/writeJson and studentModel.noteRecurringBug
// are stubbed (both are whole-module property calls in routes/moment.js, so
// stubbing here is visible there) to keep the cache/evidence/student-model
// writes out of real disk entirely. recordProblemEvent is destructured at
// require-time in routes/moment.js (can't be stubbed from outside), so it
// really does append a session-log.jsonl under a disposable fake problem id —
// cleaned up in this file's `after` hook.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const express = require("express");

const settingsStore = require("../src/settingsStore");
const problemStore = require("../src/problemStore");
const fileStore = require("../src/fileStore");
const studentModel = require("../src/studentModel");
const ai = require("../src/ai");
const momentRouter = require("../src/routes/moment");

const FAKE_IDS = ["mo-shrink-p1", "mo-shrink-p2", "mo-shrink-p3", "mo-shrink-p4", "mo-empty-provider"];

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

// Collect every SSE frame from the moment-diagnose stream.
async function streamDiagnose(port, id, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/problems/${id}/moment-diagnose`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

const noWrite = [
  [fileStore, "readJson", async () => null], // always a cache miss — every test wants the full pipeline to run
  [fileStore, "writeJson", async () => {}],
  [studentModel, "noteRecurringBug", async () => {}], // never touch the SHARED data/student-model.json from a test
];

test("small input (<=400 chars) is never touched — no shrunk stage emitted", async () => {
  await withStubs([
    ...noWrite,
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "s" : "int main(){}")],
    [ai, "chat", async ({ onDelta }) => { const r = "TAG: khac\nLINES: 1\nVISAO: ok.\nGOIY: thử lại."; onDelta(r); return r; }],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, FAKE_IDS[0], {
      verdict: "WA", test: { testId: "t1", input: "1 2", expected: "3", actual: "4" },
    });
    assert.equal(status, 200);
    assert.ok(!events.some((e) => e.stage === "shrunk"));
  });
});

test("RE on a large input shrinks WITHOUT needing an AI reference", async () => {
  // A program that segfaults past a threshold size — the classic "array index
  // way out of bounds" bug. isInteresting only needs status === "RE" to fire,
  // no ensureReference/generateHelper call should happen on this path.
  const crashy = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "int main(){ int n; cin>>n; vector<int> v(3); cout<<v.at(n)<<endl; }",
  ].join("\n");
  // cin>>n only ever reads the FIRST token — "500" guarantees .at() throws;
  // the other 200 numbers are unread noise, present only to push the input
  // past the shrink threshold and give ddmin something real to strip away.
  const bigInput = "500\n" + Array.from({ length: 200 }, (_, i) => i).join("\n");
  assert.ok(bigInput.length > 400, `fixture must exceed the shrink threshold, got ${bigInput.length}`);

  let generateHelperCalled = false;
  await withStubs([
    ...noWrite,
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "s" : "")],
    [ai, "generateHelper", async () => { generateHelperCalled = true; return "int main(){}"; }],
    [ai, "chat", async ({ onDelta }) => { const r = "TAG: tran-mang\nLINES: 1\nVISAO: đọc chỉ số ngoài mảng.\nGOIY: thử in kích thước mảng ra."; onDelta(r); return r; }],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, FAKE_IDS[1], {
      verdict: "RE", code: crashy, test: { testId: "t1", input: bigInput, expected: "", actual: "" },
    });
    assert.equal(status, 200);
    const shrunk = events.find((e) => e.stage === "shrunk");
    assert.ok(shrunk, "expected a shrunk stage event");
    assert.equal(shrunk.trustworthy, false);
    assert.ok(shrunk.toBytes < shrunk.fromBytes);
    assert.ok(shrunk.minimalInput.length < bigInput.length);
    assert.equal(generateHelperCalled, false, "RE path must not need a reference solution at all");
    const done = events.find((e) => e.done);
    assert.equal(done.diagnosis.ok, true);
  });
});

test("WA on a large input shrinks via a verified reference (ensureReference reused)", async () => {
  // Student: sums ABS values (bug — should sum plain values). Reference: correct sum.
  const buggy = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "int main(){int n;cin>>n;long long s=0;for(int i=0;i<n;i++){int x;cin>>x;s+=abs(x);}cout<<s<<endl;}",
  ].join("\n");
  const values = Array.from({ length: 200 }, (_, i) => (i % 7 === 3 ? -(i + 1) : i + 1));
  const bigInput = `${values.length}\n${values.join("\n")}\n`;
  assert.ok(bigInput.length > 400, `fixture must exceed the shrink threshold, got ${bigInput.length}`);

  await withStubs([
    ...noWrite,
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "Sum n integers." : "")],
    [ai, "generateHelper", async () => [
      "#include <bits/stdc++.h>", "using namespace std;",
      "int main(){int n;cin>>n;long long s=0;for(int i=0;i<n;i++){int x;cin>>x;s+=x;}cout<<s<<endl;}",
    ].join("\n")],
    [ai, "extractSamples", () => []], // no samples in this problem's statement — reference stays "not sample-verified" but is still usable
    [ai, "chat", async ({ onDelta }) => { const r = "TAG: sai-cong-thuc\nLINES: 1\nVISAO: dùng abs() thay vì cộng thẳng.\nGOIY: thử một test có số âm và so kết quả tay."; onDelta(r); return r; }],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, FAKE_IDS[2], {
      verdict: "WA", code: buggy, test: { testId: "t1", input: bigInput, expected: "", actual: "" },
    });
    assert.equal(status, 200);
    const shrunk = events.find((e) => e.stage === "shrunk");
    assert.ok(shrunk, "expected a shrunk stage event");
    assert.equal(shrunk.trustworthy, true);
    assert.ok(shrunk.minimalInput.length < bigInput.length);
    assert.ok(typeof shrunk.expectedOutput === "string" && shrunk.expectedOutput.length);
    assert.ok(typeof shrunk.studentOutput === "string" && shrunk.studentOutput.length);
    assert.notEqual(shrunk.expectedOutput.trim(), shrunk.studentOutput.trim(), "the shrunk input must still reproduce the mismatch");
  });
});

test("WA degrades gracefully to the original input when no reference can be built", async () => {
  const code = "#include <bits/stdc++.h>\nusing namespace std;\nint main(){cout<<1<<endl;}";
  const bigInput = "x".repeat(500);

  await withStubs([
    ...noWrite,
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "s" : "")],
    [ai, "generateHelper", async () => { throw new Error("model refused"); }], // ensureReference fails → degrade
    [ai, "chat", async ({ onDelta }) => { const r = "TAG: khac\nLINES: 1\nVISAO: chưa rõ.\nGOIY: kiểm tra lại đề."; onDelta(r); return r; }],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, FAKE_IDS[3], {
      verdict: "WA", code, test: { testId: "t1", input: bigInput, expected: "1", actual: "1" },
    });
    assert.equal(status, 200);
    assert.ok(!events.some((e) => e.stage === "shrunk"), "no shrunk event — must fall back to diagnosing the original input");
    const done = events.find((e) => e.done);
    assert.equal(done.diagnosis.ok, true); // the diagnosis step itself still proceeds normally
  });
});

test("empty Moment provider response returns and persists an evidence-only fallback", async () => {
  const writes = [];
  await withStubs([
    [fileStore, "readJson", async () => null],
    [fileStore, "writeJson", async (file, value) => { writes.push({ file, value }); }],
    [studentModel, "noteRecurringBug", async () => { throw new Error("must not create inferred weakness"); }],
    [settingsStore, "getAiSettings", async () => ({ apiKey: "test-key", model: "stub" })],
    [settingsStore, "getSettings", async () => ({ timeMs: 2000 })],
    [problemStore, "problemExists", async () => true],
    [problemStore, "readMeta", async () => ({})],
    [problemStore, "getFile", async (_id, kind) => (kind === "statement" ? "s" : "int main(){}")],
    [ai, "chat", async () => ""],
  ], async (port) => {
    const { status, events } = await streamDiagnose(port, FAKE_IDS[4], {
      verdict: "WA",
      test: { testId: "t-empty", input: "1\n", expected: "2\n", actual: "3\n" },
    });
    assert.equal(status, 200);
    const done = events.find((event) => event.done);
    assert.equal(done.diagnosis.ok, false);
    assert.equal(done.diagnosis.status, "evidence-only");
    assert.equal(done.diagnosis.reason, "provider-output-empty");
    assert.equal(done.diagnosis.evidence.testId, "t-empty");
    assert.equal("tag" in done.diagnosis, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const evidenceWrite = writes.find(({ file, value }) => /moment[\\/].+\.json$/.test(file) && value.diagnosis);
    assert.ok(evidenceWrite, "fallback must leave an auditable evidence file");
    assert.equal(evidenceWrite.value.diagnosis.status, "evidence-only");
  });
});
