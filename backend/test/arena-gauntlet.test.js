"use strict";

// Tests for arena/gauntlet.js (S1 — the post-AC Đấu Trường).
//
//   huntFailingSeed  — pure seed-search core, exercised with FAKE runners
//                       (mirrors autopsy-orchestrator.test.js's buildOracle tests).
//   runPostAcGauntlet — the real thing: real g++, a real throwaway zz-* problem
//                       via problemStore, with ai.generateHelper monkey-patched
//                       (same technique autopsy-orchestrator.test.js uses for
//                       ensureReference) so no API key / network is required.

const test = require("node:test");
const assert = require("node:assert/strict");

const gauntlet = require("../src/arena/gauntlet");
const referenceStore = require("../src/arena/referenceStore");
const ai = require("../src/ai");
const problemStore = require("../src/problemStore");

// ---- huntFailingSeed (pure) -------------------------------------------------

function fakeGen(map) {
  return async (seed) => (seed in map ? map[seed] : map.default) || { status: "OK", stdout: `${seed}\n` };
}
function fakeRunner(fn) {
  return async (input) => fn(input);
}

test("huntFailingSeed: finds the first seed where student and reference disagree", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: `ref:${input}` }));
  const runStudent = fakeRunner(async (input) => {
    const seed = Number(input.trim());
    return { status: "OK", stdout: seed === 3 ? "WRONG" : `ref:${input}` };
  });
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 10 });
  assert.equal(result.found, true);
  assert.equal(result.seed, 3);
  assert.equal(result.kind, "WA");
});

test("huntFailingSeed: student always agrees → survived, ran == maxSeeds", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: input }));
  const runStudent = fakeRunner(async (input) => ({ status: "OK", stdout: input }));
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 15 });
  assert.equal(result.found, false);
  assert.equal(result.ran, 15);
});

test("huntFailingSeed: a crashing student counts as found even when stdout matches nothing", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async () => ({ status: "OK", stdout: "6\n" }));
  const runStudent = fakeRunner(async (input) => (input.trim() === "5" ? { status: "RE", stdout: "" } : { status: "OK", stdout: "6\n" }));
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 10 });
  assert.equal(result.found, true);
  assert.equal(result.seed, 5);
  assert.equal(result.kind, "RE");
});

test("huntFailingSeed: reference failing on a candidate never counts as a find (untrustworthy candidate)", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async () => ({ status: "TLE", stdout: "" }));
  const runStudent = fakeRunner(async () => ({ status: "OK", stdout: "anything" }));
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 5 });
  assert.equal(result.found, false);
  assert.equal(result.ran, 5);
});

test("huntFailingSeed: a broken generator run is skipped, not fatal", async () => {
  const runGenerator = fakeGen({ 1: { status: "RE", stdout: "" }, 2: { status: "OK", stdout: "2\n" } });
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: input }));
  const runStudent = fakeRunner(async (input) => ({ status: "OK", stdout: input === "2\n" ? "WRONG" : input }));
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 5 });
  assert.equal(result.found, true);
  assert.equal(result.seed, 2);
});

test("huntFailingSeed: respects the wall-clock budget independent of maxSeeds", async () => {
  let calls = 0;
  const runGenerator = async () => { calls += 1; return { status: "OK", stdout: "1\n" }; };
  const runReference = fakeRunner(async () => ({ status: "OK", stdout: "1\n" }));
  const runStudent = fakeRunner(async () => ({ status: "OK", stdout: "1\n" }));
  let fakeNow = 0;
  const now = () => { fakeNow += 100; return fakeNow; }; // advances 100ms per call, faster than a real clock
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 100000, budgetMs: 500, now });
  assert.equal(result.found, false);
  assert.equal(result.budgetHit, true);
  assert.ok(calls < 100000);
});

// ---- phaseForSeed + onProgress (Sealed Gauntlet progressive reveal) --------

test("phaseForSeed: buckets a 60-seed hunt into boundary (~20%) / random (~50%) / adversarial (~30%)", () => {
  assert.equal(gauntlet.phaseForSeed(1, 60), "boundary");
  assert.equal(gauntlet.phaseForSeed(12, 60), "boundary");
  assert.equal(gauntlet.phaseForSeed(13, 60), "random");
  assert.equal(gauntlet.phaseForSeed(42, 60), "random");
  assert.equal(gauntlet.phaseForSeed(43, 60), "adversarial");
  assert.equal(gauntlet.phaseForSeed(60, 60), "adversarial");
});

test("phaseForSeed: never returns an empty bucket even for a tiny maxSeeds", () => {
  assert.equal(gauntlet.phaseForSeed(1, 1), "boundary");
  for (let s = 1; s <= 3; s += 1) {
    assert.ok(["boundary", "random", "adversarial"].includes(gauntlet.phaseForSeed(s, 3)));
  }
});

test("huntFailingSeed: onProgress fires once per seed actually attempted, in order, then stops at the find", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: `ref:${input}` }));
  const runStudent = fakeRunner(async (input) => {
    const seed = Number(input.trim());
    return { status: "OK", stdout: seed === 3 ? "WRONG" : `ref:${input}` };
  });
  const seen = [];
  const result = await gauntlet.huntFailingSeed({
    runGenerator, runStudent, runReference, maxSeeds: 10,
    onProgress: (evt) => seen.push(evt),
  });
  assert.equal(result.found, true);
  assert.deepEqual(seen.map((e) => e.seed), [1, 2, 3]); // stops exactly at the find, never over-fires
  assert.ok(seen.every((e) => e.maxSeeds === 10));
  assert.equal(seen[2].outcome, "found");
  assert.equal(seen[0].outcome, "survived-seed");
});

test("huntFailingSeed: the found result reports which phase it died in", async () => {
  const runGenerator = fakeGen({});
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: `ref:${input}` }));
  const runStudent = fakeRunner(async (input) => {
    const seed = Number(input.trim());
    return { status: "OK", stdout: seed === 50 ? "WRONG" : `ref:${input}` };
  });
  const result = await gauntlet.huntFailingSeed({ runGenerator, runStudent, runReference, maxSeeds: 60 });
  assert.equal(result.found, true);
  assert.equal(result.seed, 50);
  assert.equal(result.phase, "adversarial");
});

test("huntFailingSeed: a broken generator run reports outcome skipped-bad-generator to onProgress", async () => {
  const runGenerator = fakeGen({ 1: { status: "RE", stdout: "" } });
  const runReference = fakeRunner(async (input) => ({ status: "OK", stdout: input }));
  const runStudent = fakeRunner(async (input) => ({ status: "OK", stdout: input }));
  const seen = [];
  await gauntlet.huntFailingSeed({
    runGenerator, runStudent, runReference, maxSeeds: 3,
    onProgress: (evt) => seen.push(evt),
  });
  assert.equal(seen[0].outcome, "skipped-bad-generator");
});

// ---- runPostAcGauntlet (real g++, faked AI) ---------------------------------

const STATEMENT = [
  "# Sum",
  "## Input",
  "```",
  "3",
  "1 2 3",
  "```",
  "## Output",
  "```",
  "6",
  "```",
].join("\n");

const REFERENCE_CODE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

const GENERATOR_CODE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "int main(int argc,char**argv){int seed=atoi(argv[1]); int n=3; printf(\"%d\\n\", n); for(int i=0;i<n;i++) printf(\"%d \", seed+i); printf(\"\\n\");}",
].join("\n");

// Deliberately buggy: sums only the first n-1 elements (off-by-one loop bound).
// The generator above always makes the last element nonzero, so seed=1 fails immediately.
const BUGGY_STUDENT_CODE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "int main(){int n; cin>>n; vector<int> a(n); for(auto&x:a) cin>>x; long long s=0; for(int i=0;i<n-1;i++) s+=a[i]; cout<<s<<endl;}",
].join("\n");

const CORRECT_STUDENT_CODE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-gauntlet-test", statement: STATEMENT });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
}

function withGeneratedAi(byKind) {
  const original = ai.generateHelper;
  ai.generateHelper = async ({ kind }) => byKind[kind];
  return () => { ai.generateHelper = original; };
}

test("runPostAcGauntlet: breaks a genuinely buggy solution, persists reference+generator to the vault", async () => {
  await withProblem(async (id) => {
    const restore = withGeneratedAi({ brute: REFERENCE_CODE, generator: GENERATOR_CODE });
    try {
      const result = await gauntlet.runPostAcGauntlet({
        id, aiSettings: { apiKey: "test" }, judgeSettings: {}, statement: STATEMENT,
        code: BUGGY_STUDENT_CODE, samples: [{ input: "3\n1 2 3\n", output: "6" }],
        maxSeeds: 20, budgetMs: 8000,
      });
      assert.equal(result.ok, true);
      assert.equal(result.survived, false);
      assert.ok(result.minimalInput);
      assert.ok(result.expectedOutput.trim().length > 0);

      // Vault should now hold BOTH assets for next time — no more AI calls needed.
      const vault = await referenceStore.readMeta(id);
      assert.equal(vault.reference.present, true);
      assert.equal(vault.reference.trusted, true);
      assert.equal(vault.generator.present, true);
      assert.equal(vault.gauntlet.lastResult, "broken");
    } finally {
      restore();
    }
  });
});

test("runPostAcGauntlet: a correct solution survives and the vault records it", async () => {
  await withProblem(async (id) => {
    const restore = withGeneratedAi({ brute: REFERENCE_CODE, generator: GENERATOR_CODE });
    try {
      const result = await gauntlet.runPostAcGauntlet({
        id, aiSettings: { apiKey: "test" }, judgeSettings: {}, statement: STATEMENT,
        code: CORRECT_STUDENT_CODE, samples: [{ input: "3\n1 2 3\n", output: "6" }],
        maxSeeds: 10, budgetMs: 8000,
      });
      assert.equal(result.ok, true);
      assert.equal(result.survived, true);
      assert.ok(result.ran > 0);

      const vault = await referenceStore.readMeta(id);
      assert.equal(vault.gauntlet.lastResult, "survived");
    } finally {
      restore();
    }
  });
});

test("runPostAcGauntlet: second run reuses the vault and never calls the AI again", async () => {
  await withProblem(async (id) => {
    let calls = 0;
    const original = ai.generateHelper;
    ai.generateHelper = async ({ kind }) => { calls += 1; return kind === "brute" ? REFERENCE_CODE : GENERATOR_CODE; };
    try {
      await gauntlet.runPostAcGauntlet({
        id, aiSettings: { apiKey: "test" }, judgeSettings: {}, statement: STATEMENT,
        code: CORRECT_STUDENT_CODE, samples: [{ input: "3\n1 2 3\n", output: "6" }],
        maxSeeds: 10, budgetMs: 8000,
      });
      const callsAfterFirst = calls;
      assert.ok(callsAfterFirst > 0);

      await gauntlet.runPostAcGauntlet({
        id, aiSettings: { apiKey: "test" }, judgeSettings: {}, statement: STATEMENT,
        code: CORRECT_STUDENT_CODE, samples: [{ input: "3\n1 2 3\n", output: "6" }],
        maxSeeds: 10, budgetMs: 8000,
      });
      assert.equal(calls, callsAfterFirst, "second run must not call ai.generateHelper again — vault-first");
    } finally {
      ai.generateHelper = original;
    }
  });
});

test("runPostAcGauntlet: degrades to ok:false when there is no API key and no vault (never throws)", async () => {
  await withProblem(async (id) => {
    const result = await gauntlet.runPostAcGauntlet({
      id, aiSettings: { apiKey: "" }, judgeSettings: {}, statement: STATEMENT,
      code: CORRECT_STUDENT_CODE, samples: [{ input: "3\n1 2 3\n", output: "6" }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.reason, "must report SOME reason, not silently no-op");
    assert.ok(result.note);
  });
});
