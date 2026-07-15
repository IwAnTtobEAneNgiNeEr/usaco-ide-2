"use strict";

// Route-level tests for routes/arena-upgrade.js — real g++, real AC history
// produced by the ACTUAL judge route (not a hand-seeded vault), zero AI
// calls anywhere in this file. Throwaway zz-* problems.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-arena-upgrade-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const { buildApp } = require("../server");

test.after(async () => { await fsp.rm(TEST_ROOT, { recursive: true, force: true }); });

const STATEMENT = ["# Sum (upgrade E2E)", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "6", "```"].join("\n");
const CORRECT_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){long long x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

async function withProblem(overrides, run) {
  const meta = await problemStore.createProblem({
    title: "zz-arena-upgrade-test", statement: STATEMENT, input: "3\n1 2 3\n", expected: "6\n", ...overrides,
  });
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
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

// Judges CORRECT_CODE for real, so problemStore.history actually has an AC
// entry with a code snapshot — the exact same path a real student takes.
async function judgeToAc(base, id) {
  const r = await postJson(base, `/api/problems/${id}/judge`, { code: CORRECT_CODE });
  assert.equal(r.json.verdict, "AC");
}

test("a fresh unsolved problem never appears in upgrade-candidates", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    const r = await getJson(base, "/api/arena/upgrade-candidates");
    assert.equal(r.json.candidates.some((c) => c.id === id), false);
  }));
});

test("an AC'd problem with a sample but no vault shows up as a promote candidate", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    await judgeToAc(base, id);
    const r = await getJson(base, "/api/arena/upgrade-candidates");
    const mine = r.json.candidates.find((c) => c.id === id);
    assert.ok(mine, "AC'd problem must appear");
    assert.equal(mine.evaluation.canPromoteReference, true);
  }));
});

test("POST promote-from-ac on an unsolved problem is rejected", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    const r = await postJson(base, `/api/problems/${id}/reference/promote-from-ac`);
    assert.equal(r.status, 400);
  }));
});

test("POST promote-from-ac uses the student's OWN AC'd code — zero AI, real trust established", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    await judgeToAc(base, id);
    const r = await postJson(base, `/api/problems/${id}/reference/promote-from-ac`);
    assert.equal(r.status, 200);
    assert.equal(r.json.referencePromoted, true);

    const vault = await referenceStore.readMeta(id);
    assert.equal(vault.reference.present, true);
    assert.equal(vault.reference.source, "ac-code");
    assert.equal(vault.reference.trusted, true);

    // Re-running is a harmless no-op — already fully promoted.
    const again = await postJson(base, `/api/problems/${id}/reference/promote-from-ac`);
    assert.equal(again.json.reason, "already-done");
  }));
});

test("POST promote-from-ac also confirms rating when a cfRating estimate exists", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    await judgeToAc(base, id);
    await problemStore.updateProblem(id, { analysis: { cfRating: 1400 } });
    const r = await postJson(base, `/api/problems/${id}/reference/promote-from-ac`);
    assert.equal(r.json.referencePromoted, true);
    assert.equal(r.json.ratingConfirmed, true);
    const meta = await problemStore.readMeta(id);
    assert.equal(meta.analysis.ratingConfirmed, true);
  }));
});

// GUARDRAIL: routes/arena-upgrade.js's bulk endpoints call problemStore.
// listProblems() with NO id filter and no injectable path (unlike the global
// arena-*.json stores, which every OTHER test file here points at a tmp file).
// A bulk-mutating test that doesn't stub this WILL walk the REAL live
// workspace on every `npm test` run — it happened once during this feature's
// own development (ratingConfirmed set + reference.cpp written across ~60-100
// real problems) before this guardrail existed. Stub listProblems to ONLY the
// two throwaway ids so this can never repeat.
test("POST promote-all bulk-promotes across the workspace and reports honest counts", async () => {
  await withProblem({ title: "zz-arena-upgrade-bulk-a" }, (idA) => withProblem({ title: "zz-arena-upgrade-bulk-b" }, (idB) => withServer(async (base) => {
    await judgeToAc(base, idA);
    await judgeToAc(base, idB);
    await problemStore.updateProblem(idB, { analysis: { cfRating: 1200 } });

    const originalListProblems = problemStore.listProblems;
    problemStore.listProblems = async () => [{ id: idA }, { id: idB }];
    let r;
    try {
      r = await postJson(base, "/api/arena/upgrade-candidates/promote-all", {});
    } finally {
      problemStore.listProblems = originalListProblems;
    }
    assert.equal(r.status, 200);
    assert.ok(r.json.processed >= 2);
    assert.ok(r.json.referencePromoted >= 2);
    assert.ok(r.json.ratingConfirmed >= 1);

    const [vaultA, vaultB] = await Promise.all([referenceStore.readMeta(idA), referenceStore.readMeta(idB)]);
    assert.equal(vaultA.reference.trusted, true);
    assert.equal(vaultB.reference.trusted, true);
    assert.equal((await problemStore.readMeta(idB)).analysis.ratingConfirmed, true);

    // Idempotent — a second bulk run finds nothing left actionable for these two.
    // Same stub, same reason (see GUARDRAIL above).
    problemStore.listProblems = async () => [{ id: idA }, { id: idB }];
    let again;
    try {
      again = await postJson(base, "/api/arena/upgrade-candidates/promote-all", {});
    } finally {
      problemStore.listProblems = originalListProblems;
    }
    const stillOurs = (await getJson(base, "/api/arena/upgrade-candidates")).json.candidates
      .filter((c) => c.id === idA || c.id === idB);
    assert.equal(stillOurs.length, 0);
    assert.ok(again.json.ok);
  })));
});

test("promote-from-ac refuses (sample-mismatch) when the AC'd code no longer matches an edited statement", async () => {
  await withProblem({}, (id) => withServer(async (base) => {
    await judgeToAc(base, id);
    // Statement edited afterward to expect a different answer — the OLD AC
    // code must NOT be rubber-stamped as a trusted reference for the new one.
    const EDITED = ["# Sum (edited)", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "999", "```"].join("\n");
    await problemStore.setFile(id, "statement", EDITED);
    const r = await postJson(base, `/api/problems/${id}/reference/promote-from-ac`);
    assert.equal(r.json.referencePromoted, false);
    assert.equal(r.json.reason, "sample-mismatch");
  }));
});
