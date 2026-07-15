"use strict";

// Tests for the WA Autopsy orchestrator (README-LOOPS.md task A1).
// buildOracle/runAutopsy are exercised with FAKE runners (no compiler needed,
// mirrors shrink.test.js) so the state-machine logic is proven fast and
// deterministically. ensureReference is exercised against REAL g++ (this
// sandbox has it — judge-service.test.js already relies on that) with a
// monkey-patched ai.generateHelper standing in for the network call, so no
// API key or internet access is required to prove the compile+verify wiring.

const test = require("node:test");
const assert = require("node:assert/strict");

const orchestrator = require("../src/autopsy/orchestrator");
const ai = require("../src/ai");

function fixedRunner(map) {
  return async (input) => (input in map ? map[input] : map.default);
}

// ---- buildOracle -------------------------------------------------------------------

test("buildOracle: interesting when reference OK but outputs differ", async () => {
  const oracle = orchestrator.buildOracle({
    runStudent: fixedRunner({ default: { status: "OK", stdout: "1\n" } }),
    runReference: fixedRunner({ default: { status: "OK", stdout: "-3\n" } }),
  });
  assert.equal(await oracle("anything"), true);
});

test("buildOracle: not interesting when outputs match", async () => {
  const oracle = orchestrator.buildOracle({
    runStudent: fixedRunner({ default: { status: "OK", stdout: "6\n" } }),
    runReference: fixedRunner({ default: { status: "OK", stdout: "6\n" } }),
  });
  assert.equal(await oracle("anything"), false);
});

test("buildOracle: not interesting when the reference itself fails (untrustworthy candidate)", async () => {
  const oracle = orchestrator.buildOracle({
    runStudent: fixedRunner({ default: { status: "OK", stdout: "1\n" } }),
    runReference: fixedRunner({ default: { status: "TLE", stdout: "" } }),
  });
  assert.equal(await oracle("anything"), false);
});

test("buildOracle: interesting when student crashes but reference is fine", async () => {
  const oracle = orchestrator.buildOracle({
    runStudent: fixedRunner({ default: { status: "RE", stdout: "" } }),
    runReference: fixedRunner({ default: { status: "OK", stdout: "6\n" } }),
  });
  assert.equal(await oracle("anything"), true);
});

// ---- runAutopsy ---------------------------------------------------------------------

test("runAutopsy shrinks a real failing case down to a minimal certificate", async () => {
  // Student sums absolute values; reference sums correctly. Bug triggers on any negative.
  const values = [5, 8, 3, 12, 44, 7, 9, 2, 6, 11, -7, 13];
  const failingInput = `${values.length}\n${values.join("\n")}\n`;

  function parse(input) {
    const lines = input.trim().split("\n").filter((l) => l.length > 0);
    const n = Number(lines[0]);
    const vals = lines.slice(1, 1 + n).map(Number);
    return { vals, valid: Number.isInteger(n) && vals.length === n && vals.every(Number.isInteger) };
  }
  const runStudent = async (input) => {
    const { vals, valid } = parse(input);
    if (!valid) return { status: "RE", stdout: "" };
    return { status: "OK", stdout: `${vals.reduce((a, b) => a + Math.abs(b), 0)}\n` };
  };
  const runReference = async (input) => {
    const { vals, valid } = parse(input);
    if (!valid) return { status: "RE", stdout: "" };
    return { status: "OK", stdout: `${vals.reduce((a, b) => a + b, 0)}\n` };
  };

  const result = await orchestrator.runAutopsy({ failingInput, runStudent, runReference, maxShrinkRuns: 2000 });

  assert.equal(result.ok, true);
  assert.equal(result.minimalInput, "1\n-1");
  assert.equal(result.expectedOutput.trim(), "-1");
  assert.equal(result.studentOutput.trim(), "1");
  assert.ok(result.shrink.runs > 0);
  assert.ok(result.shrink.toBytes < result.shrink.fromBytes);
});

test("runAutopsy reports not-reproducible when the original input isn't actually interesting", async () => {
  const runStudent = async () => ({ status: "OK", stdout: "6\n" });
  const runReference = async () => ({ status: "OK", stdout: "6\n" });
  const result = await orchestrator.runAutopsy({ failingInput: "3\n1 2 3\n", runStudent, runReference });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-reproducible");
});

test("runAutopsy respects maxShrinkRuns", async () => {
  const failingInput = "10\n" + Array.from({ length: 10 }, (_, i) => i + 1).join("\n");
  const runStudent = async () => ({ status: "OK", stdout: "ANYTHING\n" });
  const runReference = async () => ({ status: "OK", stdout: "6\n" });
  const result = await orchestrator.runAutopsy({ failingInput, runStudent, runReference, maxShrinkRuns: 10 });
  assert.equal(result.ok, true);
  assert.ok(result.shrink.runs <= 10);
});

// ---- buildEvidencePack ----------------------------------------------------------------

test("buildEvidencePack assembles the v1 contract shape with diagnosis unset", () => {
  const pack = orchestrator.buildEvidencePack({
    problemId: "sum-two",
    trigger: "WA",
    minimalInput: "1\n-1",
    expectedOutput: "-1",
    studentOutput: "1",
    shrink: { runs: 72, fromBytes: 100, toBytes: 4, durationMs: 5 },
    reference: { kind: "ai-brute", verifiedOnSamples: true },
    studentCodeSnapshot: "int main(){}",
  });
  assert.equal(pack.version, 1);
  assert.equal(pack.problemId, "sum-two");
  assert.equal(pack.trigger, "WA");
  assert.equal(pack.diagnosis, null);
  assert.deepEqual(pack.generator, { kind: "existing-test", seed: null });
  assert.equal(pack.reference.verifiedOnSamples, true);
});

// ---- ensureReference (real g++, faked AI call) -----------------------------------------

test("ensureReference compiles a working brute, verifies it against samples, and can run it repeatedly", async () => {
  const original = ai.generateHelper;
  ai.generateHelper = async () => [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
  ].join("\n");
  try {
    const res = await orchestrator.ensureReference({
      aiSettings: { apiKey: "test" },
      judgeSettings: {},
      statement: "Sum n integers.",
      samples: [{ input: "3\n1 2 3\n", output: "6" }],
    });
    assert.equal(res.ok, true);
    assert.equal(res.trusted, true);
    assert.equal(res.samplesChecked, 1);
    const r1 = await res.run("2\n4 5\n");
    assert.equal(r1.stdout.trim(), "9");
    const r2 = await res.run("1\n-1\n");
    assert.equal(r2.stdout.trim(), "-1");
    await res.cleanup();
  } finally {
    ai.generateHelper = original;
  }
});

test("ensureReference flags an untrustworthy reference that disagrees with the official sample", async () => {
  const original = ai.generateHelper;
  ai.generateHelper = async () => [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<(s+1)<<endl;}", // off-by-one, wrong on purpose
  ].join("\n");
  try {
    const res = await orchestrator.ensureReference({
      aiSettings: { apiKey: "test" },
      judgeSettings: {},
      statement: "Sum n integers.",
      samples: [{ input: "3\n1 2 3\n", output: "6" }],
    });
    assert.equal(res.ok, true);
    assert.equal(res.trusted, false);
    await res.cleanup();
  } finally {
    ai.generateHelper = original;
  }
});

test("ensureReference surfaces a compile failure instead of throwing", async () => {
  const original = ai.generateHelper;
  ai.generateHelper = async () => "int main( { this is not valid c++";
  try {
    const res = await orchestrator.ensureReference({
      aiSettings: { apiKey: "test" },
      judgeSettings: {},
      statement: "Sum n integers.",
      samples: [{ input: "3\n1 2 3\n", output: "6" }],
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "compile-failed");
  } finally {
    ai.generateHelper = original;
  }
});

test("ensureReference surfaces a generation failure instead of throwing", async () => {
  const original = ai.generateHelper;
  ai.generateHelper = async () => { throw new Error("network down"); };
  try {
    const res = await orchestrator.ensureReference({
      aiSettings: { apiKey: "test" },
      judgeSettings: {},
      statement: "Sum n integers.",
      samples: [],
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "generate-failed");
    assert.match(res.note, /network down/);
  } finally {
    ai.generateHelper = original;
  }
});
