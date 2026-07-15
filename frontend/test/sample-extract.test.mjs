// Unit tests for the pure sample-extraction / noise-cleaning / provenance core.
// Pure (no DOM), so it runs under `node --test` per the frontend convention.

import test from "node:test";
import assert from "node:assert/strict";

import { provenanceLabel, extractSamples, cleanStatementNoise, normalizeStatementStructure } from "../src/core/sample-extract.js";

// ---- Task 2: compact provenance labels ------------------------------------

test("provenanceLabel maps each known provenance to its compact label", () => {
  const cases = {
    "official-sample": "Official",
    "user-provided": "User",
    "generated-unverified": "AI ?",
    "generated-self-consistency-check": "AI ✓",
    "verified-by-reference-solution": "Verified",
    "cross-checked-independent-oracle": "Oracle",
    "stale-after-statement-change": "Stale",
    "invalid-or-duplicate": "Duplicate"
  };
  for (const [full, short] of Object.entries(cases)) {
    const r = provenanceLabel(full);
    assert.ok(r, `expected a label object for ${full}`);
    assert.equal(r.short, short, `short label for ${full}`);
    assert.equal(r.full, full, `full string preserved for tooltip on ${full}`);
    assert.ok(typeof r.tone === "string" && r.tone, `tone class for ${full}`);
  }
});

test("provenanceLabel returns null for empty/missing provenance (no chip)", () => {
  assert.equal(provenanceLabel(""), null);
  assert.equal(provenanceLabel(null), null);
  assert.equal(provenanceLabel(undefined), null);
});

test("provenanceLabel falls back gracefully for an unknown provenance", () => {
  const r = provenanceLabel("some-future-provenance");
  assert.ok(r, "unknown provenance still yields a chip");
  assert.equal(r.full, "some-future-provenance", "full string preserved");
  assert.ok(r.short && r.short.length <= 14, "short label stays compact");
});

// ---- Task 1: extract samples from fenced ```code``` blocks (existing format) -

test("extractSamples pairs labelled fenced Input/Output blocks", () => {
  const md = [
    "Some prose describing the problem.",
    "",
    "### Sample Input 1",
    "```",
    "5",
    "1 2 3 4 5",
    "```",
    "### Sample Output 1",
    "```",
    "15",
    "```"
  ].join("\n");
  const s = extractSamples(md);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5\n1 2 3 4 5");
  assert.equal(s[0].output, "15");
});

test("extractSamples pairs bare consecutive fenced blocks when unlabelled", () => {
  const md = "```\n3\nabc\n```\n```\nyes\n```";
  const s = extractSamples(md);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "3\nabc");
  assert.equal(s[0].output, "yes");
});

test("extractSamples returns [] for text with no examples", () => {
  assert.deepEqual(extractSamples("just a paragraph of prose, nothing else"), []);
  assert.deepEqual(extractSamples(""), []);
  assert.deepEqual(extractSamples(null), []);
});

test("extractSamples caps the number of returned pairs at 6", () => {
  let md = "";
  for (let i = 1; i <= 9; i++) md += `Input\n\`\`\`\n${i}\n\`\`\`\nOutput\n\`\`\`\n${i * 2}\n\`\`\`\n`;
  const s = extractSamples(md);
  assert.equal(s.length, 6);
});

// ---- Task 1: extract samples from plain "Input / Output" labels (webpage paste) -

test("extractSamples reads the plain Input/Output label format with no fences", () => {
  const txt = [
    "Given an array, print its sum.",
    "",
    "Input",
    "5",
    "1 2 3 4 5",
    "Output",
    "15"
  ].join("\n");
  const s = extractSamples(txt);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5\n1 2 3 4 5");
  assert.equal(s[0].output, "15");
});

test("extractSamples reads Vietnamese Dữ liệu vào / Kết quả ra labels", () => {
  const txt = "Dữ liệu vào\n3\nKết quả ra\n9";
  const s = extractSamples(txt);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "3");
  assert.equal(s[0].output, "9");
});

test("extractSamples reads multiple numbered Sample Input/Output pairs", () => {
  const txt = [
    "Sample Input 1", "2", "1 1", "Sample Output 1", "2",
    "Sample Input 2", "3", "1 2 3", "Sample Output 2", "6"
  ].join("\n");
  const s = extractSamples(txt);
  assert.equal(s.length, 2);
  assert.equal(s[0].input, "2\n1 1");
  assert.equal(s[0].output, "2");
  assert.equal(s[1].input, "3\n1 2 3");
  assert.equal(s[1].output, "6");
});

test("extractSamples accepts a label with inline data after a colon", () => {
  const s = extractSamples("Input: 5\nOutput: 25");
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5");
  assert.equal(s[0].output, "25");
});

// ---- Task 1: clean accidental webpage chrome out of pasted text -------------

test("cleanStatementNoise drops standalone chrome lines (Copy / copied / page / actions)", () => {
  const dirty = [
    "Input", "Copy", "5", "1 2 3", "Output", "copied", "6",
    "Trang 1 / 5", "Bình luận", "Gửi bài giải", "Báo cáo vấn đề", "C++ Java Python"
  ].join("\n");
  const clean = cleanStatementNoise(dirty);
  const lines = clean.split("\n");
  for (const junk of ["Copy", "copied", "Trang 1 / 5", "Bình luận", "Gửi bài giải", "Báo cáo vấn đề", "C++ Java Python"]) {
    assert.ok(!lines.includes(junk), `chrome line "${junk}" should be removed`);
  }
  // Real content survives.
  for (const keep of ["Input", "5", "1 2 3", "Output", "6"]) {
    assert.ok(lines.includes(keep), `real line "${keep}" must be preserved`);
  }
});

test("cleanStatementNoise never removes real content that merely contains a keyword", () => {
  const text = [
    "Copy the array into B.",       // sentence, not a Copy button
    "Copyright (c) 2024 USACO",      // not the word "copy"
    "Output the maximum value.",     // a real instruction sentence
    "5 1 2 3 4 5"                    // data that is not a language list
  ].join("\n");
  assert.equal(cleanStatementNoise(text), text, "no real lines should be dropped");
});

test("extractSamples does NOT fabricate a sample from Input/Output format sections", () => {
  // A statement whose Input/Output are *format descriptions* (with a Giới hạn
  // section between them), not sample data — must yield no examples, like the
  // old fenced-only extractor did. (Regression guard.)
  const fmt = [
    "Cho số nguyên N. In YES nếu đẹp.",
    "Input",
    "Dòng duy nhất chứa số nguyên dương N",
    "Giới hạn",
    "10 <= N <= 10^18",
    "Output",
    "In ra YES nếu N là số đẹp, ngược lại in ra NO"
  ].join("\n");
  assert.deepEqual(extractSamples(fmt), []);
});

test("extractSamples truncates a sample block at a trailing Notes/section header", () => {
  const txt = [
    "Sample Input 1", "5", "Sample Output 1", "15",
    "Notes", "N is at most 100."
  ].join("\n");
  const s = extractSamples(txt);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5");
  assert.equal(s[0].output, "15"); // "Notes / N is at most 100." must not leak in
});

test("extractSamples strips Copy-button noise that sits between label and data", () => {
  // Exactly what copying from 28Tech/LeetCode pastes: a "Copy" button line
  // wedged under each Input/Output header.
  const pasted = [
    "Cho mảng, in ra tổng.",
    "Input",
    "Copy",
    "5",
    "1 2 3 4 5",
    "Output",
    "Copy",
    "15",
    "Bình luận"
  ].join("\n");
  const s = extractSamples(pasted);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5\n1 2 3 4 5");
  assert.equal(s[0].output, "15");
});

test("extractSamples prefers the explicit example section over top-level input/output format", () => {
  const txt = [
    "Bài toán tổ hợp.",
    "Dữ liệu vào",
    "2 số nguyên dương N và K.",
    "Kết quả ra",
    "In ra mỗi tập con trên 1 dòng",
    "Ràng buộc",
    "1<=K<=N<=20",
    "Ví dụ mẫu",
    "Input 1",
    "5 2",
    "Output 1",
    "12",
    "13",
    "14",
    "15"
  ].join("\n");
  const s = extractSamples(txt);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5 2");
  assert.equal(s[0].output, "12\n13\n14\n15");
});

test("normalizeStatementStructure splits compressed inline section/sample markers", () => {
  const raw = "Mô tả ngắn. 2. Dữ liệu vào (Input) gồm 3 số. 3. Kết quả ra (Output) in đáp án. 5. Ví dụ mẫuVÍ DỤ 1: Chạy thử INPUT:plaintext08 29 58 OUTPUT:plaintext08:29:58";
  const fixed = normalizeStatementStructure(raw);
  assert.match(fixed, /\n2\. Dữ liệu vào \(Input\)/);
  assert.match(fixed, /\n3\. Kết quả ra \(Output\)/);
  assert.match(fixed, /\n5\. Ví dụ mẫu/);
  assert.match(fixed, /\nVÍ DỤ 1:/);
  assert.match(fixed, /\nINPUT/);
  assert.doesNotMatch(fixed, /plaintext08/);
});

test("extractSamples reads compressed AI example blocks after structure normalization", () => {
  const txt = [
    "Đồng hồ điện tử.",
    "2. Dữ liệu vào (Input) gồm 3 số.",
    "3. Kết quả ra (Output) in kết quả.",
    "5. Ví dụ mẫuVÍ DỤ 1: Chạy trong cùng một ngàyINPUT:plaintext08 29 58",
    "08 30 02",
    "OUTPUT:plaintext08:29:58",
    "08:29:59",
    "08:30:00"
  ].join("\n");
  const s = extractSamples(txt);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "08 29 58\n08 30 02");
  assert.equal(s[0].output, "08:29:58\n08:29:59\n08:30:00");
});

// ---- three real bugs found + fixed 2026-07-07 (workspace audit after user
// report "mọi thứ vẫn giao hữu") — each reproduced on an actual pasted statement.

test("extractSamples handles Codeforces' glued 'InputCopy'/'OutputCopy' paste artifact", () => {
  const s = ["Examples", "InputCopy", "5 6", "1 2 2", "OutputCopy", "1 4 3 5"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "5 6\n1 2 2", output: "1 4 3 5" }]);
});

test("extractSamples: an Output-side label INSIDE an examples section never ends that section", () => {
  const s = ["# Ví dụ", "", "```", "5", "1 2 2 7 9", "```", "**Kết quả**", "```", "6", "```", "**Giải thích**:", "vì abc"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "5\n1 2 2 7 9", output: "6" }]);
});

test("extractSamples: 'Ví dụ' directly followed by raw input data (no explicit Input label) still works", () => {
  const s = ["Ví dụ", "4 5", "1 2 1", "1 3 4", "2 3 2", "Đầu ra", "6"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "4 5\n1 2 1\n1 3 4\n2 3 2", output: "6" }]);
});

test("extractSamples strips a stray fence-language hint line ('text'/'plaintext') left by a naive markdown converter", () => {
  const s = ["Ví dụ:", "Input 01:", "", "text", "6 7", "0 3 6", "Output 01:", "text", "28"].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "6 7\n0 3 6", output: "28" }]);
});

test("extractSamples: the implicit-input heuristic never fabricates a sample from real prose", () => {
  const s = [
    "Đề bài không có ví dụ nào cả, chỉ mô tả định dạng mà thôi cho rõ ràng hơn nhé bạn.",
    "Output", "In ra một số nguyên duy nhất là kết quả bài toán yêu cầu ở trên.",
  ].join("\n");
  assert.deepEqual(extractSamples(s), []);
});

test("extractSamples: an unrecognized '## heading' appended right after the last example still closes it (Synthesizer 'nâng cấp' bug, 2026-07-07)", () => {
  // Real bug: the Synthesizer's "upgrade this problem" flow appends a new
  // section (its own arbitrary title, e.g. "## Bản nâng cấp của: X") straight
  // after the original statement. Because that heading isn't a recognized
  // section keyword, the trailing example's output block ran to EOF and
  // swallowed the whole appended section into the sample's expected output.
  const s = [
    "Ví dụ", "Input", "3\n1 2 3", "Output", "6",
    "", "## Bản nâng cấp của: Something", "Ràng buộc mới rất khó.",
  ].join("\n");
  assert.deepEqual(extractSamples(s), [{ input: "3\n1 2 3", output: "6" }]);
});
