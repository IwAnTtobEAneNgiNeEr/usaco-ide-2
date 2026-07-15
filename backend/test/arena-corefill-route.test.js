"use strict";

// Route-level test for routes/arena-corefill.js — real HTTP + real g++,
// ai.generateCoreFillDrill monkey-patched (no network/API key). Snapshot/
// restore the REAL data/arena-corefill-deck.json (same technique as
// arena-next-bet-route.test.js for its own real data file).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const ai = require("../src/ai");
const settingsStore = require("../src/settingsStore");
const { buildApp } = require("../server");

const DECK_FILE = path.join(config.DATA_DIR, "arena-corefill-deck.json");
let snapshot;
test.before(async () => {
  snapshot = await fsp.readFile(DECK_FILE, "utf8").catch(() => null);
});
test.after(async () => {
  if (snapshot == null) await fsp.rm(DECK_FILE, { force: true });
  else await fsp.writeFile(DECK_FILE, snapshot, "utf8");
});
async function resetDeck() { await fsp.rm(DECK_FILE, { force: true }); }

const GOOD_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){ int a,b; cin>>a>>b; int x=0;",
  "/*__LOI_BAT_DAU__*/", "x = a + b;", "/*__LOI_KET_THUC__*/",
  "cout << x << endl; }",
].join("\n");
const SAMPLE_TESTS = [
  { name: "t1", input: "2 3\n" }, { name: "t2", input: "10 20\n" },
  { name: "t3", input: "0 0\n" }, { name: "t4", input: "-5 5\n" },
];
function goodDrill() {
  return {
    title: "Cộng hai số", topic: "implementation", rating: 800,
    statement: "Đọc a,b. **Input**: 2 số. **Output**: tổng.\n## Ví dụ\n```\n2 3\n```\n```\n5\n```",
    gapContract: "x đã khai báo sẵn = 0; đoạn lõi phải gán x = tổng của a và b.",
    fullCode: GOOD_CODE, sampleTests: SAMPLE_TESTS,
  };
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
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("GET /corefill/next: no key configured refuses with NO_KEY instead of a confusing crash", async () => {
  await resetDeck();
  const orig = settingsStore.getAiSettings;
  settingsStore.getAiSettings = async () => ({ apiKey: "" });
  try {
    await withServer(async (base) => {
      const r = await getJson(base, "/api/arena/corefill/next");
      assert.equal(r.status, 400);
      assert.equal(r.json.code, "NO_KEY");
    });
  } finally {
    settingsStore.getAiSettings = orig;
  }
});

test("GET /corefill/next generates+verifies+persists a drill; scaffold never leaks the core", async () => {
  await resetDeck();
  const origGen = ai.generateCoreFillDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateCoreFillDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const r = await getJson(base, "/api/arena/corefill/next?topic=implementation");
      assert.equal(r.status, 200);
      assert.equal(r.json.drill.title, "Cộng hai số");
      assert.ok(r.json.drill.scaffold.includes("int a,b"));
      assert.ok(!r.json.drill.scaffold.includes("x = a + b"), "the core answer must never reach the client");
      assert.ok(r.json.drill.scaffold.includes("TODO"));
      assert.ok(r.json.drill.drillId);

      const deck = JSON.parse(await fsp.readFile(DECK_FILE, "utf8"));
      assert.equal(deck.drills.length, 1);
      assert.ok(!("core" in deck.drills[0]), "the persisted deck must never store the original core");
    });
  } finally {
    ai.generateCoreFillDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /corefill/:id/attempt: a correct fill judges AC against the real derived tests and marks solved", async () => {
  await resetDeck();
  const origGen = ai.generateCoreFillDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateCoreFillDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const next = await getJson(base, "/api/arena/corefill/next");
      const id = next.json.drill.drillId;

      const attempt = await postJson(base, `/api/arena/corefill/${id}/attempt`, { filledCode: "x = a + b;" });
      assert.equal(attempt.status, 200);
      assert.equal(attempt.json.verdict, "AC");
      assert.equal(attempt.json.summary.passed, 4);

      const deck = JSON.parse(await fsp.readFile(DECK_FILE, "utf8"));
      assert.ok(deck.drills[0].solvedAt, "solving must be persisted");

      // Solved drill must not be re-offered by /next.
      const again = await getJson(base, "/api/arena/corefill/next?topic=implementation");
      assert.notEqual(again.json.drill.drillId, id);
    });
  } finally {
    ai.generateCoreFillDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /corefill/:id/attempt: accepts the WHOLE edited program via `code` (what the IDE-style UI sends)", async () => {
  await resetDeck();
  const origGen = ai.generateCoreFillDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateCoreFillDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const next = await getJson(base, "/api/arena/corefill/next");
      const id = next.json.drill.drillId;
      // The client edits the full scaffold and sends the entire program back.
      const fullProgram = "#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int a,b; cin>>a>>b; int x=0; x = a + b; cout << x << endl; }";
      const attempt = await postJson(base, `/api/arena/corefill/${id}/attempt`, { code: fullProgram });
      assert.equal(attempt.status, 200);
      assert.equal(attempt.json.verdict, "AC");
      assert.equal(attempt.json.summary.passed, 4);
    });
  } finally {
    ai.generateCoreFillDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /corefill/:id/attempt: a wrong full program judges WA, does not mark solved", async () => {
  await resetDeck();
  const origGen = ai.generateCoreFillDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateCoreFillDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const next = await getJson(base, "/api/arena/corefill/next");
      const id = next.json.drill.drillId;
      const wrong = "#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int a,b; cin>>a>>b; int x=0; x = a - b; cout << x << endl; }";
      const attempt = await postJson(base, `/api/arena/corefill/${id}/attempt`, { code: wrong });
      assert.equal(attempt.json.verdict, "WA");
      const deck = JSON.parse(await fsp.readFile(DECK_FILE, "utf8"));
      assert.equal(deck.drills[0].solvedAt, null);
    });
  } finally {
    ai.generateCoreFillDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /corefill/:id/attempt: a wrong fill judges WA, does not mark solved", async () => {
  await resetDeck();
  const origGen = ai.generateCoreFillDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateCoreFillDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const next = await getJson(base, "/api/arena/corefill/next");
      const id = next.json.drill.drillId;

      const attempt = await postJson(base, `/api/arena/corefill/${id}/attempt`, { filledCode: "x = a - b;" });
      assert.equal(attempt.json.verdict, "WA");

      const deck = JSON.parse(await fsp.readFile(DECK_FILE, "utf8"));
      assert.equal(deck.drills[0].solvedAt, null);
    });
  } finally {
    ai.generateCoreFillDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /corefill/:id/attempt: unknown drill id 404s", async () => {
  await withServer(async (base) => {
    const r = await postJson(base, "/api/arena/corefill/does-not-exist/attempt", { filledCode: "x=1;" });
    assert.equal(r.status, 404);
  });
});
