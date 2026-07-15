"use strict";

// Tests for arena/coreFillOrchestrator.js — the non-pure edge that turns
// ai.generateCoreFillDrill's raw output into a self-verified drill using REAL
// g++ (no network/API key: ai.generateCoreFillDrill is monkey-patched, same
// technique arena-gauntlet.test.js uses for ai.generateHelper).

const test = require("node:test");
const assert = require("node:assert/strict");

const ai = require("../src/ai");
const settingsStore = require("../src/settingsStore");
const orchestrator = require("../src/arena/coreFillOrchestrator");

const GOOD_CODE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "int main(){",
  "  int a,b; cin>>a>>b;",
  "  int x = 0;",
  "  /*__LOI_BAT_DAU__*/",
  "  x = a + b;",
  "  /*__LOI_KET_THUC__*/",
  "  cout << x << endl;",
  "}",
].join("\n");

const SAMPLE_TESTS = [
  { name: "t1", input: "2 3\n" },
  { name: "t2", input: "10 20\n" },
  { name: "t3", input: "0 0\n" },
  { name: "t4", input: "-5 5\n" },
];

function goodDrill(overrides = {}) {
  return {
    title: "Cộng hai số", topic: "implementation", rating: 800,
    statement: "Đọc a,b. **Input**: 2 số. **Output**: tổng.\n## Ví dụ\n```\n2 3\n```\n```\n5\n```",
    gapContract: "x đã khai báo sẵn = 0; đoạn lõi phải gán x = tổng của a và b.",
    fullCode: GOOD_CODE, sampleTests: SAMPLE_TESTS,
    ...overrides,
  };
}

function withFakeGenerate(impl, run) {
  const orig = ai.generateCoreFillDrill;
  ai.generateCoreFillDrill = impl;
  return run().finally(() => { ai.generateCoreFillDrill = orig; });
}

test("generateAndVerifyDrill: a valid drill compiles and every sample test gets a REAL derived expected", async () => {
  await withFakeGenerate(async () => goodDrill(), async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, topic: "implementation", minRating: 800, maxRating: 1200, avoidTitles: [],
    });
    assert.equal(result.title, "Cộng hai số");
    assert.equal(result.tests.length, 4);
    assert.ok(!("core" in result), "the original core must never be returned/persisted");
    // v2 shape: skeleton segments + pre-rendered scaffold, never before/after.
    assert.ok(result.parts[0].includes("int a,b"));
    assert.ok(result.parts[1].includes("cout"));
    assert.ok(result.scaffold.includes("TODO"));
    assert.ok(!result.scaffold.includes("x = a + b"), "the scaffold must never leak the core");

    const byName = Object.fromEntries(result.tests.map((t) => [t.name, t.expected]));
    assert.equal(byName.t1, "5");
    assert.equal(byName.t2, "30");
    assert.equal(byName.t3, "0");
    assert.equal(byName.t4, "0");
  });
});

test("generateAndVerifyDrill: a MULTI-GAP drill keeps every labeled gap and hides every core", async () => {
  const multiGapCode = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "int main(){",
    "  int n; cin>>n; vector<long long> a(n);",
    "  for (auto &x : a) cin>>x;",
    "  /*__LOI_BAT_DAU_1__*/",
    "  vector<long long> pre(n+1, 0);",
    "  for (int i = 0; i < n; i++) pre[i+1] = pre[i] + a[i];",
    "  /*__LOI_KET_THUC_1__*/",
    "  long long best = LLONG_MIN;",
    "  /*__LOI_BAT_DAU_2__*/",
    "  for (int i = 1; i <= n; i++) for (int j = 0; j < i; j++) best = max(best, pre[i] - pre[j]);",
    "  /*__LOI_KET_THUC_2__*/",
    "  cout << best << endl;",
    "}",
  ].join("\n");
  await withFakeGenerate(async () => goodDrill({
    title: "Đoạn con tổng lớn nhất",
    fullCode: multiGapCode,
    gaps: [
      { index: 1, label: "Dựng mảng cộng dồn pre từ a" },
      { index: 2, label: "Duyệt mọi đoạn [j, i) và cập nhật tổng lớn nhất" },
    ],
    sampleTests: [
      { name: "t1", input: "3\n1 -2 3\n" }, { name: "t2", input: "1\n-7\n" },
      { name: "t3", input: "4\n2 2 2 2\n" }, { name: "t4", input: "2\n-1 -1\n" },
    ],
  }), async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, topic: "prefix sum", minRating: 800, maxRating: 1600, avoidTitles: [],
    });
    assert.equal(result.gaps.length, 2);
    assert.equal(result.gaps[0].label, "Dựng mảng cộng dồn pre từ a");
    assert.ok(result.scaffold.includes("[1] TODO"));
    assert.ok(result.scaffold.includes("[2] TODO"));
    assert.ok(!result.scaffold.includes("pre[i+1] = pre[i] + a[i]"), "gap 1 core must be hidden");
    assert.ok(!result.scaffold.includes("best = max(best"), "gap 2 core must be hidden");
    assert.equal(result.tests.length, 4);
    const byName = Object.fromEntries(result.tests.map((t) => [t.name, t.expected]));
    assert.equal(byName.t1, "3");
    assert.equal(byName.t2, "-7");
    assert.equal(byName.t3, "8");
  });
});

test("generateAndVerifyDrill: bad markers on attempt 1, valid on attempt 2 — retries and succeeds", async () => {
  let call = 0;
  await withFakeGenerate(async () => {
    call += 1;
    if (call === 1) return goodDrill({ fullCode: "int main(){ /* no markers here */ }" });
    return goodDrill();
  }, async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, topic: "implementation", minRating: 800, maxRating: 1200, avoidTitles: [],
    });
    assert.equal(call, 2);
    assert.equal(result.tests.length, 4);
  });
});

test("generateAndVerifyDrill: code that never compiles exhausts attempts and throws COREFILL_VERIFY_FAILED", async () => {
  await withFakeGenerate(async () => goodDrill({ fullCode: "/*__LOI_BAT_DAU__*/ this is not cpp /*__LOI_KET_THUC__*/" }), async () => {
    const judgeSettings = await settingsStore.getSettings();
    await assert.rejects(
      orchestrator.generateAndVerifyDrill({ aiSettings: {}, judgeSettings, topic: "x", avoidTitles: [] }),
      (err) => {
        assert.equal(err.code, "COREFILL_VERIFY_FAILED");
        return true;
      }
    );
  });
});

test("generateAndVerifyDrill: fewer than minTests sample inputs run cleanly → discarded, retried", async () => {
  // Only 2 of 4 inputs are well-formed for this program (the others crash it) —
  // below config.COREFILL.minTests (4), so this attempt must be rejected.
  const flakyCode = [
    "#include <bits/stdc++.h>", "using namespace std;",
    "int main(){ int a,b; cin>>a>>b; if(b==0) exit(1); int x=0;",
    "/*__LOI_BAT_DAU__*/", "x = a / b;", "/*__LOI_KET_THUC__*/",
    "cout << x << endl; }",
  ].join("\n");
  let call = 0;
  await withFakeGenerate(async () => {
    call += 1;
    if (call === 1) {
      return goodDrill({ fullCode: flakyCode, sampleTests: [
        { name: "ok1", input: "10 2\n" }, { name: "ok2", input: "9 3\n" },
        { name: "bad1", input: "5 0\n" }, { name: "bad2", input: "1 0\n" },
      ] });
    }
    return goodDrill(); // second attempt: fully healthy
  }, async () => {
    const judgeSettings = await settingsStore.getSettings();
    const result = await orchestrator.generateAndVerifyDrill({
      aiSettings: {}, judgeSettings, topic: "x", avoidTitles: [],
    });
    assert.equal(call, 2, "the under-verified first attempt must be discarded, not served");
    assert.equal(result.title, "Cộng hai số");
  });
});
