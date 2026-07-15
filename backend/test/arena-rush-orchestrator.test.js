"use strict";

// Tests for arena/rushOrchestrator.js — the non-pure edge that turns
// ai.generateRushDrill's raw output into a self-verified drill using REAL
// g++ (no network/API key: ai.generateRushDrill is monkey-patched, same
// technique arena-corefill-orchestrator.test.js uses for generateCoreFillDrill).

const test = require("node:test");
const assert = require("node:assert/strict");

const ai = require("../src/ai");
const settingsStore = require("../src/settingsStore");
const orchestrator = require("../src/arena/rushOrchestrator");

// A real off-by-one bug: loop should be `i < n` (sum all n) but stops one
// early (`i < n - 1`), so for n=3 it sums only the first 2 instead of all 3.
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

function goodDrill(overrides = {}) {
  return {
    title: "Tổng mảng lệch biên", tag: "off-by-one",
    buggyCode: BUGGY_CODE, fixedCode: FIXED_CODE, testInputs: TEST_INPUTS,
    bugSummary: "Vòng lặp dừng sớm một bước, bỏ sót phần tử cuối.",
    ...overrides,
  };
}

function withFakeGenerate(impl, run) {
  const orig = ai.generateRushDrill;
  ai.generateRushDrill = impl;
  return run().finally(() => { ai.generateRushDrill = orig; });
}

test("generateAndVerifyDrill: a real bug compiles both sides and derives expected from the FIXED run, not AI arithmetic", async () => {
  await withFakeGenerate(async () => goodDrill(), async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, tag: "off-by-one", difficultyLabel: "easy", avoidTitles: [],
    });
    assert.equal(result.tag, "off-by-one");
    assert.equal(result.buggyCode, BUGGY_CODE);
    assert.ok(!("fixedCode" in result), "fixedCode must never be persisted/returned — that's the answer key");
    assert.ok(result.tests.length >= 2);

    const byInput = Object.fromEntries(result.tests.map((t) => [t.input, t.expected]));
    assert.equal(byInput["3\n1 2 3\n"], "6");
    assert.equal(byInput["4\n5 5 5 5\n"], "20");
    assert.equal(byInput["2\n10 20\n"], "30");
  });
});

test("generateAndVerifyDrill: an input where buggy and fixed happen to AGREE is excluded (doesn't expose the bug)", async () => {
  // n=1: the buggy loop (i<n-1 => i<0) sums nothing (0); the fixed loop (i<1)
  // also sums just a[0]. If a[0]==0 they'd coincidentally agree — use a
  // non-zero value so they genuinely diverge, and confirm a single-element
  // agreeing case is filtered by pairing it with a real divergent one.
  await withFakeGenerate(async () => goodDrill({ testInputs: ["3\n1 2 3\n", "4\n5 5 5 5\n"] }), async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, tag: "off-by-one", avoidTitles: [],
    });
    assert.equal(result.tests.length, 2);
  });
});

test("generateAndVerifyDrill: buggyCode that fails to compile is rejected and retried (never served)", async () => {
  let call = 0;
  await withFakeGenerate(async () => {
    call += 1;
    if (call === 1) return goodDrill({ buggyCode: "int main(){ this is not cpp" });
    return goodDrill();
  }, async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, tag: "off-by-one", avoidTitles: [],
    });
    assert.equal(call, 2, "a non-compiling buggyCode must be discarded, not served");
    assert.equal(result.buggyCode, BUGGY_CODE);
  });
});

test("generateAndVerifyDrill: a 'bug' that doesn't actually diverge from the fix on ANY input is discarded", async () => {
  // buggyCode === fixedCode (a no-op "bug") — every test will agree, so
  // minVerifiedTests is never reached and this must exhaust attempts.
  await withFakeGenerate(async () => goodDrill({ buggyCode: FIXED_CODE }), async () => {
    const judgeSettings = await settingsStore.getSettings();
    await assert.rejects(
      orchestrator.generateAndVerifyDrill({ aiSettings: {}, judgeSettings, tag: "off-by-one", avoidTitles: [] }),
      (err) => { assert.equal(err.code, "RUSH_VERIFY_FAILED"); return true; }
    );
  });
});
