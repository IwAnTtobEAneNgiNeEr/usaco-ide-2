"use strict";

// Tests for arena/coreFill.js — pure marker split/assemble/pick core of
// "Điền Lõi". No fs, no AI, no compiling.

const test = require("node:test");
const assert = require("node:assert/strict");

const coreFill = require("../src/arena/coreFill");
const { COREFILL_MARKER_START, COREFILL_MARKER_END } = require("../src/ai");

function marked(before, core, after) {
  return `${before}${COREFILL_MARKER_START}${core}${COREFILL_MARKER_END}${after}`;
}

// ---- splitOnMarkers ---------------------------------------------------------

test("splitOnMarkers: a well-formed single pair splits cleanly", () => {
  const code = marked("int main(){\n", "int x = a + b;\n", "return 0;\n}");
  const r = coreFill.splitOnMarkers(code);
  assert.equal(r.ok, true);
  assert.equal(r.before, "int main(){\n");
  assert.equal(r.core, "int x = a + b;\n");
  assert.equal(r.after, "return 0;\n}");
});

test("splitOnMarkers: missing start marker fails", () => {
  const r = coreFill.splitOnMarkers(`int main(){}${COREFILL_MARKER_END}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /start marker/);
});

test("splitOnMarkers: missing end marker fails", () => {
  const r = coreFill.splitOnMarkers(`${COREFILL_MARKER_START}int main(){}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /end marker/);
});

test("splitOnMarkers: duplicate start marker fails", () => {
  const r = coreFill.splitOnMarkers(`${COREFILL_MARKER_START}a${COREFILL_MARKER_START}b${COREFILL_MARKER_END}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly 1 start marker/);
});

test("splitOnMarkers: duplicate end marker fails", () => {
  const r = coreFill.splitOnMarkers(`${COREFILL_MARKER_START}a${COREFILL_MARKER_END}b${COREFILL_MARKER_END}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly 1 end marker/);
});

test("splitOnMarkers: end marker before start marker fails", () => {
  const r = coreFill.splitOnMarkers(`${COREFILL_MARKER_END}a${COREFILL_MARKER_START}`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /before end marker/);
});

test("splitOnMarkers: empty core between markers fails", () => {
  const r = coreFill.splitOnMarkers(`before${COREFILL_MARKER_START}   ${COREFILL_MARKER_END}after`);
  assert.equal(r.ok, false);
  assert.match(r.reason, /core span.*empty/);
});

test("splitOnMarkers: no markers at all fails cleanly, never throws", () => {
  const r = coreFill.splitOnMarkers("int main(){ return 0; }");
  assert.equal(r.ok, false);
});

// ---- assemble / renderScaffold -----------------------------------------------

test("assemble: reassembling with the ORIGINAL core reproduces the source (markers stripped)", () => {
  const code = marked("int main(){\n", "int x = a + b;", "\nreturn 0;\n}");
  const split = coreFill.splitOnMarkers(code);
  const reassembled = coreFill.assemble(split.before, split.core, split.after);
  assert.equal(reassembled, "int main(){\nint x = a + b;\nreturn 0;\n}");
});

test("assemble: a student's fill replaces the core exactly", () => {
  const split = coreFill.splitOnMarkers(marked("A(", "core", ")B"));
  assert.equal(coreFill.assemble(split.before, "STUDENT_CODE", split.after), "A(STUDENT_CODE)B");
});

test("renderScaffold: never leaks the core, always has the TODO stub", () => {
  const split = coreFill.splitOnMarkers(marked("before\n", "SECRET_ANSWER", "\nafter"));
  const scaffold = coreFill.renderScaffold(split.before, split.after);
  assert.ok(scaffold.includes("before"));
  assert.ok(scaffold.includes("after"));
  assert.ok(!scaffold.includes("SECRET_ANSWER"));
  assert.ok(scaffold.includes(coreFill.STUB_COMMENT));
});

// ---- pickCandidate ------------------------------------------------------------

function drill(overrides = {}) {
  return { id: "d1", title: "T", topic: "dp", rating: 1200, solvedAt: null, ...overrides };
}

test("pickCandidate: solved drills are never picked", () => {
  const out = coreFill.pickCandidate([drill({ solvedAt: "2026-01-01" })], {});
  assert.equal(out, null);
});

test("pickCandidate: empty deck returns null, never throws", () => {
  assert.equal(coreFill.pickCandidate([], {}), null);
  assert.equal(coreFill.pickCandidate(null, {}), null);
});

test("pickCandidate: matching topic is preferred over any-topic", () => {
  const list = [drill({ id: "other", topic: "graph" }), drill({ id: "match", topic: "dp" })];
  const out = coreFill.pickCandidate(list, { topic: "dp" });
  assert.equal(out.id, "match");
});

test("pickCandidate: within rating band preferred over out-of-band, ties broken by lowest rating", () => {
  const list = [
    drill({ id: "far", topic: "dp", rating: 2000 }),
    drill({ id: "near-a", topic: "dp", rating: 1100 }),
    drill({ id: "near-b", topic: "dp", rating: 1050 }),
  ];
  const out = coreFill.pickCandidate(list, { topic: "dp", minRating: 1000, maxRating: 1300 });
  assert.equal(out.id, "near-b");
});

test("pickCandidate: no topic given falls back to lowest-rating unsolved overall", () => {
  const list = [drill({ id: "hard", rating: 1800 }), drill({ id: "easy", rating: 900 })];
  assert.equal(coreFill.pickCandidate(list, {}).id, "easy");
});
