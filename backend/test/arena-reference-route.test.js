"use strict";

// Route-level test for routes/arena-reference.js — proves the HTTP wiring
// (vault status, manual save, gauntlet trigger) actually works end-to-end,
// same withServer/withProblem convention as problems-event.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const problemStore = require("../src/problemStore");
const ai = require("../src/ai");
const { buildApp } = require("../server");

// The Gauntlet's Boss Case bookkeeping hits the REAL data/arena-boss-cases.json
// (routes/arena-reference.js hardcodes that path by design, same as
// arena-cards.js) — snapshot/restore, same technique as arena-cards-route.test.js.
const BOSS_FILE = path.join(config.DATA_DIR, "arena-boss-cases.json");
let bossSnapshot;
test.before(async () => { bossSnapshot = await fsp.readFile(BOSS_FILE, "utf8").catch(() => null); });
test.after(async () => {
  if (bossSnapshot == null) await fsp.rm(BOSS_FILE, { force: true });
  else await fsp.writeFile(BOSS_FILE, bossSnapshot, "utf8");
});

const STATEMENT = ["# Sum", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "6", "```"].join("\n");
const REFERENCE_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-arena-route-test", ...input });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
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

async function getJson(base, p) {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, json: await res.json() };
}
async function putJson(base, p, body) {
  const res = await fetch(`${base}${p}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
async function postJson(base, p, body) {
  const res = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: res.status, json: await res.json() };
}

test("GET reference on a fresh problem reports an empty, unusable vault", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const r = await getJson(base, `/api/problems/${id}/reference`);
    assert.equal(r.status, 200);
    assert.equal(r.json.vault.reference.present, false);
    assert.equal(r.json.trust.usable, false);
  }));
});

test("PUT reference with code that matches the sample marks it trusted", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT }, async (id) => {
    const r = await putJson(base, `/api/problems/${id}/reference`, { code: REFERENCE_CODE });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.trusted, true);
    assert.equal(r.json.samplesChecked, 1);

    const status = await getJson(base, `/api/problems/${id}/reference`);
    assert.equal(status.json.trust.usable, true);
  }));
});

test("PUT reference with code that disagrees with the sample is saved but flagged untrusted", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT }, async (id) => {
    const wrong = [
      "#include <bits/stdc++.h>", "using namespace std;",
      "int main(){int n; cin>>n; cout<<0<<endl;}", // always prints 0 — wrong on the sample
    ].join("\n");
    const r = await putJson(base, `/api/problems/${id}/reference`, { code: wrong });
    assert.equal(r.status, 200);
    assert.equal(r.json.trusted, false);
  }));
});

test("PUT reference rejects code that doesn't compile", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT }, async (id) => {
    const r = await putJson(base, `/api/problems/${id}/reference`, { code: "int main( { not valid" });
    assert.equal(r.status, 400);
    assert.equal(r.json.ok, false);
  }));
});

test("POST gauntlet with no API key and empty vault reports a friendly non-throwing failure", async () => {
  const settingsStore = require("../src/settingsStore");
  const original = settingsStore.getAiSettings;
  settingsStore.getAiSettings = async () => ({ apiKey: "" }); // this dev machine's real data/ai-settings.json may have a key — force the no-key path
  try {
    await withServer((base) => withProblem({ statement: STATEMENT }, async (id) => {
      const r = await postJson(base, `/api/problems/${id}/gauntlet`, {});
      assert.equal(r.status, 400); // noKey() gate — same shape as every other AI route
      assert.equal(r.json.code, "NO_KEY");
    }));
  } finally {
    settingsStore.getAiSettings = original;
  }
});

const BUGGY_STUDENT_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; cin>>n; vector<int> a(n); for(auto&x:a) cin>>x; long long s=0; for(int i=0;i<n-1;i++) s+=a[i]; cout<<s<<endl;}",
].join("\n");
const DETERMINISTIC_GENERATOR_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(int argc,char**argv){int s=atoi(argv[1]); printf(\"3\\n%d %d %d\\n\", s, s+1, s+2);}",
].join("\n");

async function seedVault(id) {
  const referenceStore = require("../src/arena/referenceStore");
  const { statementHash } = require("../src/trustLayer");
  await referenceStore.setReference(id, REFERENCE_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
  await referenceStore.setGenerator(id, DETERMINISTIC_GENERATOR_CODE, { source: "manual" });
}

test("POST gauntlet: a broken result records a Boss Case, not yet promoted on the first break", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT, title: "zz-boss-case-first-break" }, async (id) => {
    await seedVault(id);
    const r = await postJson(base, `/api/problems/${id}/gauntlet`, { code: BUGGY_STUDENT_CODE, seeds: 5 });
    assert.equal(r.status, 200);
    assert.equal(r.json.survived, false);
    assert.ok(r.json.boss, "gauntlet response should surface the boss-case bookkeeping");
    assert.equal(r.json.boss.count, 1);
    assert.equal(r.json.boss.promoted, false);

    const list = await getJson(base, `/api/problems/${id}/boss-cases`);
    assert.equal(list.json.cases.length, 1);
  }));
});

test("POST gauntlet: the SAME counterexample recurring on a second attempt promotes the Boss", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT, title: "zz-boss-case-recurring" }, async (id) => {
    await seedVault(id);
    await postJson(base, `/api/problems/${id}/gauntlet`, { code: BUGGY_STUDENT_CODE, seeds: 5 });
    const second = await postJson(base, `/api/problems/${id}/gauntlet`, { code: BUGGY_STUDENT_CODE, seeds: 5 });
    assert.equal(second.json.boss.count, 2);
    assert.equal(second.json.boss.promoted, true);

    const globalBosses = await getJson(base, `/api/arena/boss-cases`);
    const mine = globalBosses.json.bosses.find((b) => b.problemId === id);
    assert.ok(mine, "promoted boss should show up in the global roster");
    assert.equal(mine.count, 2);
  }));
});

test("POST gauntlet/stream: emits phase progress via SSE and a final done frame matching the JSON route", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT, title: "zz-boss-case-stream-survive" }, async (id) => {
    await seedVault(id);
    const res = await fetch(`${base}/api/problems/${id}/gauntlet/stream`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: CORRECT_STUDENT_CODE_FOR_STREAM, seeds: 5 }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const text = await res.text();
    const events = text.split("\n\n").filter(Boolean).map((chunk) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      return line ? JSON.parse(line.slice(6)) : null;
    }).filter(Boolean);

    assert.ok(events.some((e) => e.stage === "start"));
    assert.ok(events.some((e) => e.stage === "progress"), "must stream at least one real progress frame, not just a single blocking response");
    const done = events.find((e) => e.done);
    assert.ok(done, "must end with a done frame");
    assert.equal(done.survived, true);
    await new Promise((r) => setTimeout(r, 50)); // let fire-and-forget recordProblemEvent land before cleanup
  }));
});

const CORRECT_STUDENT_CODE_FOR_STREAM = REFERENCE_CODE;

test("POST gauntlet/stream: a broken solution's done frame reports the phase it died in and records a boss case", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT, title: "zz-boss-case-stream-broken" }, async (id) => {
    await seedVault(id);
    const res = await fetch(`${base}/api/problems/${id}/gauntlet/stream`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: BUGGY_STUDENT_CODE, seeds: 5 }),
    });
    const text = await res.text();
    const events = text.split("\n\n").filter(Boolean).map((chunk) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      return line ? JSON.parse(line.slice(6)) : null;
    }).filter(Boolean);
    const done = events.find((e) => e.done);
    assert.equal(done.survived, false);
    assert.ok(done.phase);
    assert.ok(done.boss);
    assert.equal(done.boss.count, 1);
    await new Promise((r) => setTimeout(r, 50)); // let fire-and-forget recordProblemEvent land before cleanup
  }));
});

test("POST gauntlet: with a pre-populated trusted vault + faked generator, survives a correct solution", async () => {
  await withServer((base) => withProblem({ statement: STATEMENT }, async (id) => {
    // Fake having an API key configured server-side is out of scope for a route
    // test (settings live in data/ai-settings.json); instead prove the vault-first
    // path by pre-seeding the vault reference/generator directly and monkey-
    // patching ai.generateHelper as a safety net (should NOT be called at all).
    const referenceStore = require("../src/arena/referenceStore");
    const { statementHash } = require("../src/trustLayer");
    const settingsStore = require("../src/settingsStore");
    await referenceStore.setReference(id, REFERENCE_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
    const generatorCode = [
      "#include <bits/stdc++.h>", "using namespace std;",
      "int main(int argc,char**argv){int s=atoi(argv[1]);printf(\"3\\n%d %d %d\\n\",s,s+1,s+2);}",
    ].join("\n");
    await referenceStore.setGenerator(id, generatorCode, { source: "manual" });

    const originalGetAi = settingsStore.getAiSettings;
    settingsStore.getAiSettings = async () => ({ apiKey: "test-key" });
    const originalHelper = ai.generateHelper;
    ai.generateHelper = async () => { throw new Error("must not be called — vault is already populated"); };
    try {
      const r = await postJson(base, `/api/problems/${id}/gauntlet`, { code: REFERENCE_CODE, seeds: 5 });
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, true);
      assert.equal(r.json.survived, true);
      // recordProblemEvent is fire-and-forget (same convention as problems-event.test.js)
      // — give it a tick to land before withProblem's finally deletes the directory.
      await new Promise((r2) => setTimeout(r2, 50));
    } finally {
      ai.generateHelper = originalHelper;
      settingsStore.getAiSettings = originalGetAi;
    }
  }));
});
