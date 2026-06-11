"use strict";

// Integration test for POST /api/ai/chat-stream — the streaming Coach endpoint.
// Stubs ai.chatProblemStream to emit two deltas, then asserts the SSE body
// carries both deltas plus the final {done,reply,history} event, and that the
// completed turn is persisted to chat.json (setFile called with both turns).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const settingsStore = require("../src/settingsStore");
const problemStore = require("../src/problemStore");
const ai = require("../src/ai");
const aiRouter = require("../src/routes/ai");

function withServer(run) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/ai", aiRouter);
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

test("POST /chat-stream emits SSE deltas, a final done event, and persists the turn", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblemStream: ai.chatProblemStream
  };

  let savedChat = null;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "đề bài" : (kind === "chat" ? "" : "int main(){}");
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.listHistory = async () => [];
  problemStore.setFile = async (_id, kind, raw) => { if (kind === "chat") savedChat = raw; };
  ai.chatProblemStream = async ({ onDelta }) => {
    onDelta("Xin ");
    onDelta("chào");
    return "Xin chào";
  };

  try {
    const { status, ctype, body } = await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai/chat-stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: "p1", message: "chào coach" })
      });
      return { status: res.status, ctype: res.headers.get("content-type") || "", body: await res.text() };
    });

    assert.equal(status, 200);
    assert.ok(ctype.includes("text/event-stream"));

    const events = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5).trim()));
    const deltas = events.filter((e) => e.delta).map((e) => e.delta);
    assert.deepEqual(deltas, ["Xin ", "chào"]);

    const done = events.find((e) => e.done);
    assert.ok(done, "missing final done event");
    assert.equal(done.reply, "Xin chào");
    assert.ok(Array.isArray(done.history) && done.history.length === 2);

    // The completed turn was persisted (user + assistant).
    assert.ok(savedChat, "chat.json was not written");
    const saved = JSON.parse(savedChat);
    assert.equal(saved.turns.length, 2);
    assert.equal(saved.turns[1].content, "Xin chào");
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblemStream = orig.chatProblemStream;
  }
});

test("POST /chat-stream reports model failure as an SSE error event (not a hung response)", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblemStream: ai.chatProblemStream
  };

  let wroteChat = false;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async () => "";
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.listHistory = async () => [];
  problemStore.setFile = async (_id, kind) => { if (kind === "chat") wroteChat = true; };
  ai.chatProblemStream = async ({ onDelta }) => {
    onDelta("một nửa ");
    throw new Error("upstream died");
  };

  try {
    const body = await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai/chat-stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: "p1", message: "?" })
      });
      return res.text();
    });
    const events = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5).trim()));
    assert.ok(events.some((e) => e.delta === "một nửa "));
    const errEvt = events.find((e) => e.error);
    assert.ok(errEvt && /upstream died/.test(errEvt.error));
    assert.ok(!events.some((e) => e.done));
    assert.equal(wroteChat, false, "an aborted/failed reply must NOT be persisted");
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblemStream = orig.chatProblemStream;
  }
});
