"use strict";

// Integration test for POST /api/ai/chat — the AI Coach "deep context" wiring.
// Guards that the route pulls recent run snapshots (with their stdout/stderr)
// from problemStore.listHistory, truncates the logs, and forwards them to
// ai.chatProblem as `runHistory` — preferring backend data over the client's
// fallback array. The model itself is stubbed (no key / no network needed).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

// The router accesses these singletons via property at call-time, so replacing
// methods on the required objects is enough to stub them.
const settingsStore = require("../src/settingsStore");
const problemStore = require("../src/problemStore");
const fileStore = require("../src/fileStore");
const ai = require("../src/ai");
const aiRouter = require("../src/routes/ai");

function withServer(handlerSetup, run) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/ai", aiRouter);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const port = server.address().port;
      try {
        const result = await run(port);
        resolve(result);
      } catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

async function postChat(port, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

test("POST /chat builds runHistory from listHistory (with truncated logs) and forwards it", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblem: ai.chatProblem
  };

  let captured = null;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "đề bài" : (kind === "chat" ? "" : "int main(){}");
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.setFile = async () => {};
  problemStore.listHistory = async () => ([
    { verdict: "WA", passed: 2, total: 5, timeMs: 8, stdout: "w".repeat(500), stderr: "" },
    { verdict: "RE", passed: 0, total: 5, timeMs: 3, stdout: "", stderr: "e".repeat(800) },
    { verdict: "AC", passed: 5, total: 5, timeMs: 4, stdout: "ok", stderr: "" }
  ]);
  ai.chatProblem = async (args) => { captured = args; return "phản hồi coach"; };

  try {
    const { status, json } = await withServer(null, (port) => postChat(port, {
      problemId: "p1",
      message: "vì sao sai?",
      // a client fallback that should be IGNORED because backend history exists
      runHistory: [{ verdict: "CE", error: "should be ignored" }]
    }));

    assert.equal(status, 200);
    assert.equal(json.reply, "phản hồi coach");
    assert.ok(Array.isArray(captured.runHistory));
    assert.equal(captured.runHistory.length, 3);

    const [wa, re, ac] = captured.runHistory;
    assert.equal(wa.verdict, "WA");
    assert.equal(wa.stdout.length, 300);          // truncated to 300 for a failure
    assert.equal(re.stderr.length, 400);          // truncated to 400
    assert.equal(ac.stdout, "");                  // AC output dropped (not diagnostic)
    // backend data wins over the client fallback
    assert.ok(!captured.runHistory.some((h) => h.verdict === "CE"));
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblem = orig.chatProblem;
  }
});

test("POST /chat falls back to client-sent runHistory when no detailed history exists", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblem: ai.chatProblem
  };

  let captured = null;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "đề" : (kind === "chat" ? "" : "code");
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.setFile = async () => {};
  problemStore.listHistory = async () => [];     // nothing recorded yet
  ai.chatProblem = async (args) => { captured = args; return "ok"; };

  try {
    const { status } = await withServer(null, (port) => postChat(port, {
      problemId: "p1",
      message: "?",
      runHistory: [{ verdict: "WA", passed: 1, total: 3 }]
    }));
    assert.equal(status, 200);
    assert.equal(captured.runHistory.length, 1);
    assert.equal(captured.runHistory[0].verdict, "WA");
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblem = orig.chatProblem;
  }
});

// README-AUTOPILOT.md M3 — Coach reads the latest Khoảnh Khắc diagnosis (this
// is task A4, done via the moment/ evidence trail instead of the old,
// never-filled Evidence Pack.diagnosis).
test("POST /chat folds the latest moment/ diagnosis into context, capped, most-recent-wins", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblem: ai.chatProblem,
    listFiles: fileStore.listFiles,
    readJson: fileStore.readJson
  };

  let captured = null;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "đề" : (kind === "chat" ? "" : "code");
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.setFile = async () => {};
  problemStore.listHistory = async () => [];
  ai.chatProblem = async (args) => { captured = args; return "ok"; };
  fileStore.listFiles = async () => ["cache.json", "1000.json", "3000.json", "2000.json"]; // cache.json must be filtered out
  fileStore.readJson = async (p) => {
    if (p.endsWith("3000.json")) {
      return {
        verdict: "WA", diagnosis: {
          ok: true, tag: "sai-cong-thuc", tagLabel: "Sai công thức / logic",
          lines: [6], why: "dùng phép trừ thay vì phép cộng.".repeat(30) // force the 600-char cap
        }
      };
    }
    throw new Error(`readJson should only be called for the newest file (3000.json), got ${p}`);
  };

  try {
    const { status } = await withServer(null, (port) => postChat(port, { problemId: "p1", message: "?" }));
    assert.equal(status, 200);
    assert.ok(captured.momentDiagnosis.includes("Verdict WA"));
    assert.ok(captured.momentDiagnosis.includes("Sai công thức / logic"));
    assert.ok(captured.momentDiagnosis.includes("dòng 6"));
    assert.ok(captured.momentDiagnosis.length <= 600);
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblem = orig.chatProblem;
    fileStore.listFiles = orig.listFiles;
    fileStore.readJson = orig.readJson;
  }
});

test("POST /chat omits momentDiagnosis cleanly when no moment/ evidence exists yet", async () => {
  const orig = {
    getAiSettings: settingsStore.getAiSettings,
    problemExists: problemStore.problemExists,
    getFile: problemStore.getFile,
    readMeta: problemStore.readMeta,
    listHistory: problemStore.listHistory,
    setFile: problemStore.setFile,
    chatProblem: ai.chatProblem
  };

  let captured = null;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key", model: "stub" });
  problemStore.problemExists = async () => true;
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "đề" : (kind === "chat" ? "" : "code");
  problemStore.readMeta = async () => ({ history: [] });
  problemStore.setFile = async () => {};
  problemStore.listHistory = async () => [];
  ai.chatProblem = async (args) => { captured = args; return "ok"; };
  // No fileStore stubbing — moment/ genuinely doesn't exist for this fresh problem.

  try {
    const { status } = await withServer(null, (port) => postChat(port, { problemId: "does-not-exist-on-disk", message: "?" }));
    assert.equal(status, 200);
    assert.equal(captured.momentDiagnosis, "");
  } finally {
    Object.assign(settingsStore, { getAiSettings: orig.getAiSettings });
    Object.assign(problemStore, {
      problemExists: orig.problemExists, getFile: orig.getFile, readMeta: orig.readMeta,
      listHistory: orig.listHistory, setFile: orig.setFile
    });
    ai.chatProblem = orig.chatProblem;
  }
});
