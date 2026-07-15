"use strict";

// Tests for backend/src/moment/diagnose.js — the pure core of the Khoảnh Khắc
// autopilot (README-AUTOPILOT.md). No AI, no fs: prompt building, reply
// parsing, taxonomy discipline and cache identity are all deterministic.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TAXONOMY,
  tagLabel,
  middleTruncate,
  numberCode,
  buildDiagnoseMessages,
  parseDiagnosis,
  cacheKey,
} = require("../src/moment/diagnose");

test("taxonomy is closed, unique, and always includes the escape hatch", () => {
  const tags = TAXONOMY.map((t) => t.tag);
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(tags.includes("khac"));
  assert.equal(tagLabel("bien-tran"), "Tràn số (overflow)");
  assert.equal(tagLabel("khong-ton-tai"), "Khác");
});

test("middleTruncate keeps head and tail and marks the cut", () => {
  const s = "a".repeat(300) + "XYZ";
  const out = middleTruncate(s, 100);
  assert.ok(out.length < s.length);
  assert.ok(out.startsWith("a"));
  assert.ok(out.endsWith("XYZ"));
  assert.ok(out.includes("cắt bớt"));
  assert.equal(middleTruncate("ngắn", 100), "ngắn");
});

test("numberCode numbers every line and reports the true line count", () => {
  const { numbered, lineCount } = numberCode("int main() {\n  return 0;\n}");
  assert.equal(lineCount, 3);
  assert.match(numbered, /^1\| int main\(\) \{/m);
  assert.match(numbered, /^3\| \}/m);
});

test("numberCode caps huge files but keeps the real count", () => {
  const big = Array.from({ length: 500 }, (_, i) => `line${i}`).join("\n");
  const { numbered, lineCount } = numberCode(big, { maxLines: 400 });
  assert.equal(lineCount, 500);
  assert.ok(numbered.includes("còn 100 dòng bị cắt"));
});

test("buildDiagnoseMessages carries verdict, numbered code and the failing test", () => {
  const { messages, lineCount } = buildDiagnoseMessages({
    statement: "Cho n, in tổng 1..n.",
    code: "#include <bits/stdc++.h>\nint main(){int n;std::cin>>n;std::cout<<n*(n+1)/2;}",
    verdict: "WA",
    test: { input: "100000", expected: "5000050000", actual: "705082704" },
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /TAG: <một trong: bien-tran\|/);
  assert.match(messages[1].content, /VERDICT: WA/);
  assert.match(messages[1].content, /2\| int main/);
  assert.match(messages[1].content, /705082704/);
  assert.equal(lineCount, 2);
});

test("buildDiagnoseMessages: system prompt forbids GOIY from stating the concrete fix (README-AUTOPILOT.md M2)", () => {
  const { messages } = buildDiagnoseMessages({
    statement: "s", code: "int x;", verdict: "WA", test: { input: "1", expected: "1", actual: "2" },
  });
  const sys = messages[0].content;
  assert.match(sys, /cấm nêu phép sửa cụ thể/);
  assert.match(sys, /thay X bằng Y/);
  // The rule must show a concrete forbidden example, not just an abstract ban —
  // abstract rules alone didn't stop the leak in practice (verified session).
  assert.match(sys, /Thay dấu trừ bằng dấu cộng/);
});

test("parseDiagnosis still parses cleanly even if a reply leaks a fix (prompt discipline, not parser's job)", () => {
  const leaky = "TAG: sai-cong-thuc\nLINES: 6\nVISAO: dùng trừ thay vì cộng.\nGOIY: thay dấu trừ bằng dấu cộng ở dòng 6.";
  const d = parseDiagnosis(leaky, 10);
  assert.equal(d.ok, true);
  assert.equal(d.hint, "thay dấu trừ bằng dấu cộng ở dòng 6.");
});

test("buildDiagnoseMessages: TLE carries timing, RE carries stderr", () => {
  const tle = buildDiagnoseMessages({
    statement: "s", code: "c", verdict: "TLE", timeMs: 2100, limitMs: 1000, test: {},
  });
  assert.match(tle.messages[1].content, /chạy 2100ms \/ giới hạn 1000ms/);

  const re = buildDiagnoseMessages({
    statement: "s", code: "c", verdict: "RE",
    test: { input: "1", expected: "1", actual: "", stderr: "Segmentation fault" },
  });
  assert.match(re.messages[1].content, /Segmentation fault/);

  const wa = buildDiagnoseMessages({
    statement: "s", code: "c", verdict: "WA",
    test: { stderr: "noise" },
  });
  assert.ok(!wa.messages[1].content.includes("noise"), "WA must not carry stderr");
});

test("parseDiagnosis reads the clean 4-line contract", () => {
  const d = parseDiagnosis(
    "TAG: bien-tran\nLINES: 2\nVISAO: n*(n+1) tràn int trước khi chia.\nGOIY: In thử giá trị n*(n+1) với n lớn xem nó còn dương không.",
    2
  );
  assert.equal(d.ok, true);
  assert.equal(d.tag, "bien-tran");
  assert.equal(d.tagLabel, "Tràn số (overflow)");
  assert.deepEqual(d.lines, [2]);
  assert.match(d.why, /tràn int/);
  assert.match(d.hint, /In thử/);
});

test("parseDiagnosis survives markdown fences, prose and shuffled casing", () => {
  const messy = [
    "Đây là chẩn đoán của tôi:",
    "```",
    "tag: OFF-BY-ONE",
    "Lines: 5, 12, 5, 999",
    "visao: Vòng for chạy tới n-1 nên bỏ phần tử cuối.",
    "goiy: Đếm xem vòng lặp chạy bao nhiêu lần với n=3.",
    "```",
  ].join("\n");
  const d = parseDiagnosis(messy, 50);
  assert.equal(d.ok, true);
  assert.equal(d.tag, "off-by-one");
  assert.deepEqual(d.lines, [5, 12], "dedupe + drop out-of-range, keep order");
});

test("parseDiagnosis: unknown tag falls back to khac; missing VISAO = not ok", () => {
  const d = parseDiagnosis("TAG: vũ-trụ\nLINES: 1\nVISAO: có lý do.\nGOIY: thử đi.", 10);
  assert.equal(d.tag, "khac");
  assert.equal(d.ok, true);

  const bad = parseDiagnosis("TAG: khac\nLINES: 1\nGOIY: chỉ có gợi ý.", 10);
  assert.equal(bad.ok, false);
  assert.ok(bad.raw.length > 0, "raw preserved for the evidence trail");
});

test("parseDiagnosis clamps line numbers to the numbered range and caps at 3", () => {
  const d = parseDiagnosis("TAG: khac\nLINES: 0, 1, 2, 3, 4, 99\nVISAO: x.\nGOIY: y.", 4);
  assert.deepEqual(d.lines, [1, 2, 3]);
});

test("cacheKey: same evidence = same key, any field change = new key", () => {
  const base = { code: "int main(){}", testId: "t1", input: "5", verdict: "WA" };
  assert.equal(cacheKey(base), cacheKey({ ...base }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, code: "int main(){ }" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, testId: "t2" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, input: "6" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, verdict: "TLE" }));
});
