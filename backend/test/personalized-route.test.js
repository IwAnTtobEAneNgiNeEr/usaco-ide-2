"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { buildApp } = require("../server");
const problemStore = require("../src/problemStore");
const settingsStore = require("../src/settingsStore");
const ratingStore = require("../src/arena/ratingStore");
const ai = require("../src/ai");
const verifyTests = require("../src/verifyTests");

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); }
      catch (error) { reject(error); }
      finally { server.close(); }
    });
  });
}

async function post(base, path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return { status: response.status, json: await response.json() };
}

function sourceMeta() {
  return {
    id: "recent-bfs-source",
    title: "Mê cung gần đây",
    source: "test",
    topic: "bfs",
    tags: ["graph"],
    status: "solved",
    lastVerdict: "AC",
    analysis: { cfRating: 1100, tomTat: "Tìm đường ngắn nhất trên lưới." },
    updatedAt: "2026-07-10T10:00:00.000Z"
  };
}

function generatedProblem() {
  return {
    topic: "bfs",
    warnings: [],
    problem: {
      title: "Đèn hiệu trong hang",
      rating: 1200,
      tags: ["bfs", "graph"],
      statement: "Có một hang động dạng lưới. Hãy tìm số bước ít nhất từ cửa vào tới đèn hiệu, tránh các ô bị chặn.",
      inputFormat: "Dòng đầu chứa n, m; tiếp theo là n dòng lưới.",
      outputFormat: "In số bước ít nhất, hoặc -1 nếu không thể tới.",
      constraints: ["1 ≤ n, m ≤ 20"],
      solutionSketchPrivate: "Dùng BFS từ cửa vào, mỗi cạnh có trọng số 1.",
      samples: [{ input: "1 2\nST\n", expected: "1\n", explanation: "Hai ô kề nhau." }],
      verifiedTests: [
        { name: "edge", input: "1 1\nT\n", expected: "0\n", reason: "đã ở đích" },
        { name: "blocked", input: "1 3\nS#T\n", expected: "-1\n", reason: "bị chặn" },
        { name: "line", input: "1 4\nS..T\n", expected: "3\n", reason: "đường thẳng" },
        { name: "grid", input: "2 2\nS.\n.T\n", expected: "2\n", reason: "lưới nhỏ" }
      ]
    }
  };
}

function patchDependencies({ withKey }) {
  const original = {
    listProblems: problemStore.listProblems,
    readMeta: problemStore.readMeta,
    getFile: problemStore.getFile,
    getAiSettings: settingsStore.getAiSettings,
    getSettings: settingsStore.getSettings,
    ratingLoad: ratingStore.load,
    generate: ai.generatePersonalizedProblem,
    verify: verifyTests.verifyWithReference
  };
  problemStore.listProblems = async () => [sourceMeta()];
  problemStore.readMeta = async () => sourceMeta();
  problemStore.getFile = async (_id, kind) => kind === "statement" ? "Tìm đường ngắn nhất bằng BFS." : "";
  settingsStore.getAiSettings = async () => ({ apiKey: withKey ? "fake" : "" });
  settingsStore.getSettings = async () => ({ timeMs: 1000, compareMode: "loose" });
  ratingStore.load = async () => ({ rating: 1137, gamesPlayed: 8 });
  ai.generatePersonalizedProblem = async () => generatedProblem();
  verifyTests.verifyWithReference = async ({ tests }) => ({ tests, note: "verified in test" });
  return () => {
    problemStore.listProblems = original.listProblems;
    problemStore.readMeta = original.readMeta;
    problemStore.getFile = original.getFile;
    settingsStore.getAiSettings = original.getAiSettings;
    settingsStore.getSettings = original.getSettings;
    ratingStore.load = original.ratingLoad;
    ai.generatePersonalizedProblem = original.generate;
    verifyTests.verifyWithReference = original.verify;
  };
}

test("POST /api/problems/personalized requires an AI key after deriving real history", async () => {
  const restore = patchDependencies({ withKey: false });
  try {
    await withServer(async (base) => {
      const result = await post(base, "/api/problems/personalized", { recentWindow: 8 });
      assert.equal(result.status, 400);
      assert.equal(result.json.code, "NO_KEY");
    });
  } finally { restore(); }
});
test("POST /api/problems/personalized creates a normal problem with rationale and tests", async () => {
  const restore = patchDependencies({ withKey: true });
  let createdId = null;
  try {
    await withServer(async (base) => {
      const result = await post(base, "/api/problems/personalized", { recentWindow: 8 });
      assert.equal(result.status, 201);
      assert.equal(result.json.rationale.topic, "bfs");
      assert.equal(result.json.rationale.playerRating, 1137);
      assert.equal(result.json.problem.source, "Bài cá nhân hóa");
      assert.equal(result.json.problem.analysis.cfRating, 1200);
      createdId = result.json.problem.id;
      const tests = await problemStore.listTests(createdId);
      assert.ok(tests.length >= 4);
    });
  } finally {
    restore();
    if (createdId) await problemStore.deleteProblem(createdId).catch(() => {});
  }
});
