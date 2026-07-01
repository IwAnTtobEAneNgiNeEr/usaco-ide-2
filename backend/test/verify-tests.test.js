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

test("reference outputs are verified only after matching official samples", async (t) => {
  mockReference(t);
  const tests = [{ input: "3", expected: "wrong", expectedKnown: true }];
  const result = await verifyTests.verifyWithReference({
    aiSettings: {}, judgeSettings: {}, statement: "double", code: "", tests,
    samples: [{ input: "1", output: "2" }]
  });
  assert.equal(result.referenceTrusted, true);
  assert.equal(tests[0].expected, "6");
  assert.equal(tests[0].provenance, PROVENANCE.VERIFIED_REFERENCE);
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
