"use strict";

// Route-level test for routes/arena-rush.js — real HTTP + real g++,
// ai.generateRushDrill monkey-patched (no network/API key). Snapshot/restore
// the REAL data/arena-rush-run.json, data/arena-rush-deck.json, and
// data/arena-cards.json (submit's card-training tie-in touches the real
// cards file — same technique as arena-corefill-route.test.js).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const ai = require("../src/ai");
const settingsStore = require("../src/settingsStore");
const arenaRushRoute = require("../src/routes/arena-rush");
const { buildApp } = require("../server");

const RUN_FILE = path.join(config.DATA_DIR, "arena-rush-run.json");
const DECK_FILE = path.join(config.DATA_DIR, "arena-rush-deck.json");
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");

const FILES = [RUN_FILE, DECK_FILE, CARDS_FILE];
let snapshots;
let origMaybeRefillDeck;
test.before(async () => {
  snapshots = await Promise.all(FILES.map((f) => fsp.readFile(f, "utf8").catch(() => null)));
  // The real background top-up is fire-and-forget and can keep running AFTER
  // a given test's own try/finally has already restored ai.generateRushDrill
  // to the REAL implementation — left alone, that stray call would hit the
  // actual configured API key with real network/tokens. No-op it for this
  // whole file; arena-rush-orchestrator.test.js already covers the refill
  // logic itself directly, with no HTTP/background timing involved.
  origMaybeRefillDeck = arenaRushRoute.maybeRefillDeck;
  arenaRushRoute.maybeRefillDeck = () => {};
});
test.after(async () => {
  arenaRushRoute.maybeRefillDeck = origMaybeRefillDeck;
  await Promise.all(FILES.map((f, i) => (
    snapshots[i] == null ? fsp.rm(f, { force: true }) : fsp.writeFile(f, snapshots[i], "utf8")
  )));
});
async function resetAll() { await Promise.all(FILES.map((f) => fsp.rm(f, { force: true }))); }

const BUGGY_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){ int n; cin>>n; vector<int> a(n); for(auto&x:a) cin>>x;",
  "int s=0; for(int i=0;i<n-1;i++) s+=a[i];",
  "cout<<s<<endl; }",
].join("\n");
const FIXED_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){ int n; cin>>n; vector<int> a(n); for(auto&x:a) cin>>x;",
  "int s=0; for(int i=0;i<n;i++) s+=a[i];",
  "cout<<s<<endl; }",
].join("\n");
const TEST_INPUTS = ["3\n1 2 3\n", "4\n5 5 5 5\n", "2\n10 20\n"];

function goodDrill() {
  return {
    title: "Tổng mảng lệch biên", tag: "off-by-one",
    buggyCode: BUGGY_CODE, fixedCode: FIXED_CODE, testInputs: TEST_INPUTS,
    bugSummary: "Vòng lặp dừng sớm một bước, bỏ sót phần tử cuối.",
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

function withFakeGenerate(impl, run) {
  const origGen = ai.generateRushDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateRushDrill = impl;
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  return run().finally(() => { ai.generateRushDrill = origGen; settingsStore.getAiSettings = origAiSettings; });
}

test("POST /rush/start: no key configured refuses with NO_KEY", async () => {
  await resetAll();
  const orig = settingsStore.getAiSettings;
  settingsStore.getAiSettings = async () => ({ apiKey: "" });
  try {
    await withServer(async (base) => {
      const r = await postJson(base, "/api/arena/rush/start");
      assert.equal(r.status, 400);
      assert.equal(r.json.code, "NO_KEY");
    });
  } finally {
    settingsStore.getAiSettings = orig;
  }
});

test("POST /rush/start: never leaks buggyCode's answer — no tests/bugSummary/tag in the response", async () => {
  await resetAll();
  await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
    const r = await postJson(base, "/api/arena/rush/start");
    assert.equal(r.status, 200);
    assert.equal(r.json.run.state, "active");
    assert.equal(r.json.run.lives, 3);
    assert.ok(r.json.run.drill.buggyCode.includes("i<n-1"));
    assert.ok(r.json.run.deadlineAt > Date.now());
    assert.equal(JSON.stringify(r.json.run).includes("bugSummary"), false);
    assert.equal(JSON.stringify(r.json.run).includes("off-by-one"), false);
  }));
});

test("POST /rush/submit: a correct fix scores, escalates, trains the card, and serves the next drill", async () => {
  await resetAll();
  await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
    await postJson(base, "/api/arena/rush/start");
    const r = await postJson(base, "/api/arena/rush/submit", { code: FIXED_CODE });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "correct");
    assert.equal(r.json.result.tag, "off-by-one");
    assert.ok(r.json.result.bugSummary.length > 0, "bugSummary IS revealed once resolved");
    assert.equal(r.json.run.score, 1);
    assert.equal(r.json.run.level, 2);
    assert.equal(r.json.run.lives, 3);
    assert.ok(r.json.run.drill, "a new drill must be ready immediately, no extra round-trip");

    const cards = JSON.parse(await fsp.readFile(CARDS_FILE, "utf8"));
    assert.equal(cards.cards["off-by-one"].count, 1, "a real squash mints/trains the card");
  }));
});

test("POST /rush/submit: a wrong fix costs a life, does not touch the card, still serves a next drill", async () => {
  await resetAll();
  await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
    await postJson(base, "/api/arena/rush/start");
    const r = await postJson(base, "/api/arena/rush/submit", { code: BUGGY_CODE }); // unfixed — still wrong
    assert.equal(r.json.outcome, "wrong");
    assert.equal(r.json.run.lives, 2);
    assert.equal(r.json.run.score, 0);
    assert.ok(r.json.run.drill);

    const cardsRaw = await fsp.readFile(CARDS_FILE, "utf8").catch(() => null);
    assert.equal(cardsRaw, null, "a miss must never mint/train a card");
  }));
});

test("POST /rush/submit: three misses end the run and update the high score", async () => {
  await resetAll();
  await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
    await postJson(base, "/api/arena/rush/start");
    await postJson(base, "/api/arena/rush/submit", { code: FIXED_CODE }); // correct — score 1
    await postJson(base, "/api/arena/rush/submit", { code: BUGGY_CODE }); // wrong — lives 2
    await postJson(base, "/api/arena/rush/submit", { code: BUGGY_CODE }); // wrong — lives 1
    const last = await postJson(base, "/api/arena/rush/submit", { code: BUGGY_CODE }); // wrong — lives 0

    assert.equal(last.json.run.state, "over");
    assert.equal(last.json.run.lives, 0);
    assert.equal(last.json.run.drill, null);
    assert.equal(last.json.run.highScore, 1);
    assert.equal(last.json.run.totalRunsPlayed, 1);
  }));
});

test("POST /rush/submit: submitting after a fresh 400-guard when no run is active", async () => {
  await resetAll();
  await withServer(async (base) => {
    const r = await postJson(base, "/api/arena/rush/submit", { code: "int main(){}" });
    assert.equal(r.status, 400);
  });
});

test("router.maybeRefillDeck is overridable — regression guard against the background-leak bug", async () => {
  // If a future edit ever calls the bare local function instead of
  // router.maybeRefillDeck(...), this override would silently stop taking
  // effect and the REAL background top-up would run during every other test
  // in this file (burning real API tokens once ai.js gets restored to the
  // real implementation outside any single test's monkey-patch window).
  await resetAll();
  let called = 0;
  const orig = arenaRushRoute.maybeRefillDeck;
  arenaRushRoute.maybeRefillDeck = () => { called += 1; };
  try {
    await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
      await postJson(base, "/api/arena/rush/start");
      assert.equal(called, 1, "the route must call router.maybeRefillDeck, not a bare local reference");
    }));
  } finally {
    arenaRushRoute.maybeRefillDeck = orig;
  }
});

test("GET /rush/state: reflects whatever the last saved run was, without needing a fresh start", async () => {
  await resetAll();
  await withFakeGenerate(async () => goodDrill(), async () => withServer(async (base) => {
    await postJson(base, "/api/arena/rush/start");
    const r = await getJson(base, "/api/arena/rush/state");
    assert.equal(r.json.run.state, "active");
    assert.ok(r.json.run.drill);
  }));
});

// ---- hint route + sealed reveal (Debug tốc độ redesign) ------------------------

test("POST /rush/submit: a WRONG attempt with lives left keeps the drill, seals the reveal", async () => {
  await resetAll();
  const origGen = ai.generateRushDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateRushDrill = async () => goodDrill();
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      const start = await postJson(base, "/api/arena/rush/start");
      const firstDrillId = start.json.run.drill.drillId;

      // Submit the still-buggy code — a genuinely wrong attempt.
      const wrong = await postJson(base, "/api/arena/rush/submit", { code: BUGGY_CODE });
      assert.equal(wrong.json.outcome, "wrong");
      assert.equal(wrong.json.result, null, "bugSummary must stay sealed while the drill is alive");
      assert.equal(wrong.json.run.lives, 2);
      assert.equal(wrong.json.run.drill.drillId, firstDrillId, "the same drill must stay in play");

      // Fixing it afterwards resolves the SAME drill and earns the reveal.
      const right = await postJson(base, "/api/arena/rush/submit", { code: FIXED_CODE });
      assert.equal(right.json.outcome, "correct");
      assert.ok(right.json.result && right.json.result.bugSummary, "a resolved drill reveals its bugSummary");
    });
  } finally {
    ai.generateRushDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /rush/hint: level 1 free, level 2 costs 1 điểm, never leaks bugSummary", async () => {
  await resetAll();
  const origGen = ai.generateRushDrill;
  const origAiSettings = settingsStore.getAiSettings;
  ai.generateRushDrill = async () => ({ ...goodDrill(), hint1: "Để ý tổng khi mảng có phần tử cuối lớn.", hint2: "Điều kiện dừng của vòng for cộng dồn đang lệch một." });
  settingsStore.getAiSettings = async () => ({ apiKey: "fake-key-for-test" });
  try {
    await withServer(async (base) => {
      // Bank a point first so the level-2 cost is observable.
      await postJson(base, "/api/arena/rush/start");
      await postJson(base, "/api/arena/rush/submit", { code: FIXED_CODE });

      const h1 = await postJson(base, "/api/arena/rush/hint");
      assert.equal(h1.json.level, 1);
      assert.equal(h1.json.hint, "Để ý tổng khi mảng có phần tử cuối lớn.");
      assert.equal(h1.json.run.score, 1, "hint 1 must be free");
      assert.ok(!JSON.stringify(h1.json).includes("bỏ sót phần tử cuối"), "hints must never carry the bugSummary");

      const h2 = await postJson(base, "/api/arena/rush/hint");
      assert.equal(h2.json.level, 2);
      assert.equal(h2.json.run.score, 0, "hint 2 must cost 1 điểm");

      const h3 = await postJson(base, "/api/arena/rush/hint");
      assert.equal(h3.json.level, 2, "hints cap at level 2");
      assert.equal(h3.json.run.score, 0, "the cap must not charge again");
    });
  } finally {
    ai.generateRushDrill = origGen;
    settingsStore.getAiSettings = origAiSettings;
  }
});

test("POST /rush/hint: 400 when no run is active", async () => {
  await resetAll();
  await withServer(async (base) => {
    const r = await postJson(base, "/api/arena/rush/hint");
    assert.equal(r.status, 400);
  });
});
