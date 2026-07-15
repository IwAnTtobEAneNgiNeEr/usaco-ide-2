"use strict";

// Tests for arena/arbitration.js (S12) — pure "test sai hay code sai?" logic.
// Fake compare/results only, no fs — mirrors autopsy-orchestrator.test.js's
// buildOracle tests (fixedRunner-style fakes).

const test = require("node:test");
const assert = require("node:assert/strict");
const arbitration = require("../src/arena/arbitration");

function exactCompare(a, b) { return { ok: String(a).trim() === String(b).trim() }; }

test("no trusted reference → UNVERIFIABLE, never rules blind", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: false, referenceResult: null, studentResult: null, expectedFromTest: "6", compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.UNVERIFIABLE);
});

test("reference fails to run on this input → UNVERIFIABLE (an untrustworthy candidate proves nothing)", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: true, referenceResult: { status: "TLE", stdout: "" }, studentResult: { status: "OK", stdout: "6" },
    expectedFromTest: "6", compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.UNVERIFIABLE);
});

test("reference disagrees with the test's own recorded expected → BAD_TEST, with the correction attached", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: true,
    referenceResult: { status: "OK", stdout: "6" },
    studentResult: { status: "OK", stdout: "5" },
    expectedFromTest: "999", // the test itself claims 999 — reference disagrees
    compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.BAD_TEST);
  assert.equal(r.correctedExpected, "6");
});

test("reference matches the test, student ALSO matches the reference → BAD_TEST (student was right all along)", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: true,
    referenceResult: { status: "OK", stdout: "6" },
    studentResult: { status: "OK", stdout: "6" },
    expectedFromTest: "6", // test's expected matches reference — but somehow judge said WA (e.g. formatting bug elsewhere)
    compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.BAD_TEST);
});

test("reference matches the test, student disagrees → STUDENT_WRONG", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: true,
    referenceResult: { status: "OK", stdout: "6" },
    studentResult: { status: "OK", stdout: "5" },
    expectedFromTest: "6",
    compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.STUDENT_WRONG);
  assert.equal(r.correctedExpected, undefined);
});

test("student crashing counts as disagreeing with a matching reference → STUDENT_WRONG, never BAD_TEST", () => {
  const r = arbitration.judgeArbitration({
    referenceTrusted: true,
    referenceResult: { status: "OK", stdout: "6" },
    studentResult: { status: "RE", stdout: "" },
    expectedFromTest: "6",
    compare: exactCompare,
  });
  assert.equal(r.verdict, arbitration.VERDICTS.STUDENT_WRONG);
});
