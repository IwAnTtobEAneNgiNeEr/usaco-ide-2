"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runCpp = require("../src/runCpp");
const ai = require("../src/ai");
const verifyTests = require("../src/verifyTests");
const { PROVENANCE } = require("../src/trustLayer");

function mockReference(t) {
  const originals = {
    checkCompiler: runCpp.checkCompiler,
    compileStandalone: runCpp.compileStandalone,
    runBinary: runCpp.runBinary,
    cleanupWorkdir: runCpp.cleanupWorkdir,
    generateHelper: ai.generateHelper
  };
  runCpp.checkCompiler = async () => ({ available: true });
  runCpp.compileStandalone = async () => ({ ok: true, binaryPath: "fake", workdir: "fake-dir" });
  runCpp.runBinary = async ({ input }) => ({ status: "OK", stdout: String(Number(String(input).trim()) * 2) + "\n" });
  runCpp.cleanupWorkdir = async () => {};
  ai.generateHelper = async () => "int main(){}";
  t.after(() => {
    runCpp.checkCompiler = originals.checkCompiler;
    runCpp.compileStandalone = originals.compileStandalone;
    runCpp.runBinary = originals.runBinary;
    runCpp.cleanupWorkdir = originals.cleanupWorkdir;
    ai.generateHelper = originals.generateHelper;
  });
}

test("sample-matching AI reference is self-consistency evidence, not an independent oracle", async (t) => {
  mockReference(t);
  const tests = [{ input: "3", expected: "wrong", expectedKnown: true }];
  const result = await verifyTests.verifyWithReference({
    aiSettings: {}, judgeSettings: {}, statement: "double", code: "", tests,
    samples: [{ input: "1", output: "2" }]
  });
  assert.equal(result.referenceTrusted, false);
  assert.equal(result.samplesMatched, true);
  assert.equal(tests[0].expected, "6");
  assert.equal(tests[0].provenance, PROVENANCE.GENERATED_SELF_CHECK);
  assert.equal(tests[0].expectedKnown, false);
  assert.equal(tests[0].oracleState, "candidate");
});

test("a generated reference without official samples is only self-consistency evidence", async (t) => {
  mockReference(t);
  const tests = [{ input: "3", expected: "6", expectedKnown: true }];
  const result = await verifyTests.verifyWithReference({
    aiSettings: {}, judgeSettings: {}, statement: "double", code: "", tests, samples: []
  });
  assert.equal(result.referenceTrusted, false);
  assert.equal(tests[0].provenance, PROVENANCE.GENERATED_SELF_CHECK);
});

for (const failure of ["CE", "sample-mismatch", "no-compiler", "helper-error"]) {
  test("AI oracle remains candidate after " + failure, async (t) => {
    mockReference(t);
    if (failure === "CE") runCpp.compileStandalone = async () => ({ ok: false, stderr: "reference CE", workdir: "fake" });
    if (failure === "no-compiler") runCpp.checkCompiler = async () => ({ available: false });
    if (failure === "helper-error") ai.generateHelper = async () => { throw Error("reference unavailable"); };
    const tests = [{ input: "3", expected: "999", expectedKnown: true }];
    const result = await verifyTests.verifyWithReference({
      aiSettings: {}, judgeSettings: {}, statement: "double", tests,
      samples: [{ input: "1", output: failure === "sample-mismatch" ? "999" : "2" }]
    });
    assert.equal(result.referenceTrusted, false);
    assert.equal(tests[0].expectedKnown, false);
    assert.equal(tests[0].oracleState, "candidate");
    assert.equal(tests[0].expected, "999");
  });
}
test("reference budget exhaustion never promotes unexecuted AI outputs", async t => {
  mockReference(t);
  const originalNow = Date.now; let tick = 0;
  Date.now = () => tick++ * 21001;
  t.after(() => { Date.now = originalNow; });
  const tests = [{ input: "3", expected: "999", expectedKnown: true }];
  const result = await verifyTests.verifyWithReference({ aiSettings: {}, judgeSettings: {}, statement: "double", tests, samples: [] });
  assert.equal(result.verifiedCount, 0);
  assert.equal(tests[0].expectedKnown, false);
  assert.equal(tests[0].oracleState, "candidate");
  assert.equal(tests[0].expected, "999");
});
