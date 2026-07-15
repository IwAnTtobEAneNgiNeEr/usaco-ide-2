"use strict";

// Route-level test for routes/ai.js's POST /hint — proves it increments
// problemStore's hintsUsed counter when a problemId is given (arena/seal.js's
// Tinh Luyện tier needs an honest "did the student ever ask for a hint?").
// ai.getHint is monkey-patched so no real API key/network is required, same
// technique as arena-reference-route.test.js's ai.generateHelper stub.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const settingsStore = require("../src/settingsStore");
const ai = require("../src/ai");
const { buildApp } = require("../server");

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-hint-tracking", ...input });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
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
function withStubbedAi(run) {
  const originalGetAi = settingsStore.getAiSettings;
  const originalGetHint = ai.getHint;
  settingsStore.getAiSettings = async () => ({ apiKey: "test-key" });
  ai.getHint = async () => ({ technique: "hai con trỏ", hint: "thử hai chỉ số", difficulty: "Easy" });
  return Promise.resolve(run()).finally(() => {
    settingsStore.getAiSettings = originalGetAi;
    ai.getHint = originalGetHint;
  });
}

test("POST /api/ai/hint with a problemId increments that problem's hintsUsed", async () => {
  await withProblem({ statement: "đề bài", }, async (id) => {
    await withStubbedAi(() => withServer(async (base) => {
      const res = await fetch(`${base}/api/ai/hint`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: id, level: 1 }),
      });
      assert.equal(res.status, 200);
      const meta = await problemStore.readMeta(id);
      assert.equal(meta.hintsUsed, 1);
    }));
  });
});

test("POST /api/ai/hint twice on the same problem accumulates to 2", async () => {
  await withProblem({ statement: "đề bài" }, async (id) => {
    await withStubbedAi(() => withServer(async (base) => {
      const call = () => fetch(`${base}/api/ai/hint`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: id, level: 1 }),
      });
      await call();
      await call();
      const meta = await problemStore.readMeta(id);
      assert.equal(meta.hintsUsed, 2);
    }));
  });
});

test("POST /api/ai/hint WITHOUT a problemId never touches any counter (nothing to increment)", async () => {
  await withStubbedAi(() => withServer(async (base) => {
    const res = await fetch(`${base}/api/ai/hint`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ statement: "đề bài ngoài luồng", level: 1 }),
    });
    assert.equal(res.status, 200);
  }));
});
