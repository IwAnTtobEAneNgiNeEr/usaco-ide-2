"use strict";

// Tests for statementSamples.js — CJS port of frontend/src/core/sample-
// extract.js's extractSamples(). Same test intent as the frontend's
// sample-extract.test.mjs, ported to node:test/CJS, PLUS the specific
// real-workspace case that motivated this file (2026-07-06): a statement
// using plain "Input 01"/"Output 01" labels with no fences at all.

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractSamples } = require("../src/statementSamples");

test("extractSamples pairs labelled fenced Input/Output blocks", () => {
  const s = "## Input\n```\n3\n1 2 3\n```\n## Output\n```\n6\n```";
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

test("extractSamples returns [] for prose with no examples at all", () => {
  assert.deepEqual(extractSamples("Just a description, no I/O anywhere."), []);
});

test("extractSamples caps at 6 pairs", () => {
  const parts = [];
  for (let i = 0; i < 10; i += 1) parts.push(`## Input\n\`\`\`\n${i}\n\`\`\`\n## Output\n\`\`\`\n${i * 2}\n\`\`\``);
  assert.equal(extractSamples(parts.join("\n\n")).length, 6);
});

// ---- THE real-workspace bug this file fixes --------------------------------

test("extractSamples reads the plain Input/Output label format with NO fences (real judge-page paste)", () => {
  const s = [
    "Cho một bàn cờ kích thước N x M.",
    "",
    "Đầu vào",
    "Dòng đầu tiên chứa 2 số nguyên dương N và M.",
    "",
    "Giới hạn",
    "1 ≤ N, M ≤ 1000",
    "",
    "Đầu ra",
    "In ra số bước ít nhất.",
    "",
    "Ví dụ :",
    "Input 01",
    "8 8",
    "1 1 2 3",
    "Output 01",
    "1",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "8 8\n1 1 2 3", output: "1" }]);
});

test("extractSamples reads Vietnamese Dữ liệu vào / Kết quả ra labels", () => {
  const s = ["Đề bài gì đó.", "", "Ví dụ", "Dữ liệu vào", "3", "1 2 3", "Kết quả ra", "6"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

test("extractSamples reads multiple numbered Sample Input/Output pairs", () => {
  const s = [
    "Ví dụ",
    "Sample Input 1", "1", "Sample Output 1", "2",
    "Sample Input 2", "3", "Sample Output 2", "4",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "1", output: "2" }, { input: "3", output: "4" }]);
});

test("extractSamples accepts a label with inline data after a colon", () => {
  const s = ["Ví dụ", "Input: 5", "Output: 25"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "5", output: "25" }]);
});

test("extractSamples does NOT fabricate a sample from an Input/Output FORMAT section (pure prose, no data)", () => {
  const s = [
    "Input", "The first line contains an integer describing the size of the array given in the problem.",
    "Output", "Print a single integer representing the answer to the given problem statement.",
  ].join("\n");
  assert.deepEqual(extractSamples(s), []);
});

test("extractSamples strips accidental Copy-button chrome sitting inside the sample block", () => {
  const s = ["Ví dụ", "Input", "Copy", "3", "1 2 3", "Output", "Copy", "6"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

test("extractSamples prefers the explicit Examples section over an earlier Input/Output FORMAT description", () => {
  const s = [
    "Input", "n and the array (format only, no data here).",
    "Output", "the answer (format only, no data here).",
    "",
    "Ví dụ",
    "Input", "3\n1 2 3",
    "Output", "6",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

test("fenced blocks still win when both a fence AND a plausible plain label exist in the same section", () => {
  const s = "Ví dụ\n## Input\n```\n3\n1 2 3\n```\n## Output\n```\n6\n```";
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

// ---- three real bugs found + fixed 2026-07-07 (workspace audit after user
// report "mọi thứ vẫn giao hữu") — each reproduced on an actual pasted statement.

test("extractSamples handles Codeforces' glued 'InputCopy'/'OutputCopy' paste artifact", () => {
  // The 'Copy' button's text sits with NO whitespace after the label — a real
  // CF-pasted statement in this exact shape returned [] before the fix.
  const s = [
    "Examples", "InputCopy", "5 6", "1 2 2", "OutputCopy", "1 4 3 5",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "5 6\n1 2 2", output: "1 4 3 5" }]);
});

test("extractSamples: an Output-side label INSIDE an examples section never ends that section", () => {
  // Before the fix, '**Kết quả**' (recognized as a generic Output-family key)
  // terminated the 'Ví dụ' section early, silently discarding the expected
  // output that followed it — a real statement lost its whole sample this way.
  const s = ["# Ví dụ", "", "```", "5", "1 2 2 7 9", "```", "**Kết quả**", "```", "6", "```", "**Giải thích**:", "vì abc"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "5\n1 2 2 7 9", output: "6" }]);
});

test("extractSamples: 'Ví dụ' directly followed by raw input data (no explicit Input label) still works", () => {
  // "Ví dụ\n4 5\n1 2 1\n...\nĐầu ra\n6" — the example header itself introduces
  // the input; only the output side carries an explicit label. Before the
  // fix, the input lines (seen before any recognized label) were dropped.
  const s = ["Ví dụ", "4 5", "1 2 1", "1 3 4", "2 3 2", "Đầu ra", "6"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "4 5\n1 2 1\n1 3 4\n2 3 2", output: "6" }]);
});

test("extractSamples strips a stray fence-language hint line ('text'/'plaintext') left by a naive markdown converter", () => {
  const s = ["Ví dụ:", "Input 01:", "", "text", "6 7", "0 3 6", "Output 01:", "text", "28"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "6 7\n0 3 6", output: "28" }]);
});

test("extractSamples: the implicit-input heuristic never fabricates a sample from real prose", () => {
  // A statement whose Input/Output are pure FORMAT descriptions (no 'Ví dụ'
  // section, no real numbers) must still return [] — isProseBlock must keep
  // guarding the new implicit-input path exactly like it already guards the
  // explicit-label path.
  const s = [
    "Đề bài không có ví dụ nào cả, chỉ mô tả định dạng mà thôi cho rõ ràng hơn nhé bạn.",
    "Output", "In ra một số nguyên duy nhất là kết quả bài toán yêu cầu ở trên.",
  ].join("\n");
  assert.deepEqual(extractSamples(s), []);
});

test("extractSamples: an unrecognized '## heading' appended right after the last example still closes it (Synthesizer 'nâng cấp' bug, 2026-07-07)", () => {
  // Real bug found via live end-to-end test: the Synthesizer's "upgrade this
  // problem" flow appends a new section (its own arbitrary title, e.g. "##
  // Bản nâng cấp của: X") straight after the original statement so the
  // upgraded problem keeps its worked example. Because that heading isn't a
  // recognized section keyword, the trailing example's output block ran to
  // EOF and swallowed the whole appended section into the sample's expected
  // output — corrupting eligibility/reference-trust checks downstream.
  const s = [
    "Ví dụ", "Input", "3\n1 2 3", "Output", "6",
    "", "## Bản nâng cấp của: Something", "Ràng buộc mới rất khó.",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});

test("extractSamples returns [] on empty/whitespace-only input", () => {
  assert.deepEqual(extractSamples(""), []);
  assert.deepEqual(extractSamples("   \n  "), []);
  assert.deepEqual(extractSamples(null), []);
});
