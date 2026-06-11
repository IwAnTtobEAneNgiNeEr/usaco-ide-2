"use strict";

// Unit tests for the pure grading/normalization logic that decides AC vs WA,
// plus the slug + sample-extraction helpers. Run with: npm test (node:test).
// These guard the judge so a refactor (e.g. deduping the judge path) can't
// silently change verdicts.

const test = require("node:test");
const assert = require("node:assert/strict");

const runCpp = require("../src/runCpp");
const { slugify } = require("../src/fileStore");
const { extractSamples, looksGarbled, formatRunHistory } = require("../src/ai");
const { toProblemInput, deriveSource } = require("../src/companion");

const FENCE = "```"; // keep template literals below readable

// ---------------------------------------------------------------------------
// normalizeLoose / normalizeStrict
// ---------------------------------------------------------------------------

test("normalizeLoose folds CRLF, strips trailing line whitespace and trailing newlines", () => {
  assert.equal(runCpp.normalizeLoose("a \r\nb\t\n\n"), "a\nb");
  assert.equal(runCpp.normalizeLoose("1 2 3\n"), "1 2 3");
  assert.equal(runCpp.normalizeLoose("\r\n"), "");
  assert.equal(runCpp.normalizeLoose(null), "");
});

test("normalizeStrict folds CRLF but preserves trailing whitespace/newlines", () => {
  assert.equal(runCpp.normalizeStrict("a\r\nb"), "a\nb");
  assert.equal(runCpp.normalizeStrict("a\n"), "a\n");
  assert.notEqual(runCpp.normalizeStrict("a "), runCpp.normalizeStrict("a"));
});

// ---------------------------------------------------------------------------
// compareOutput
// ---------------------------------------------------------------------------

test("loose compare ignores trailing newline and trailing spaces", () => {
  assert.equal(runCpp.compareOutput("3\n", "3", "loose").ok, true);
  assert.equal(runCpp.compareOutput("1 2 3", "1 2 3   \n", "loose").ok, true);
  assert.equal(runCpp.compareOutput("a\nb\n", "a\nb", "loose").ok, true);
});

test("loose compare still catches a real difference", () => {
  const r = runCpp.compareOutput("a\nb", "a\nc", "loose");
  assert.equal(r.ok, false);
  assert.equal(r.diff.line, 2);
  assert.equal(r.diff.expected, "b");
  assert.equal(r.diff.actual, "c");
});

test("strict compare fails on a trailing-newline difference that loose accepts", () => {
  assert.equal(runCpp.compareOutput("a\n", "a", "strict").ok, false);
  assert.equal(runCpp.compareOutput("a", "a", "strict").ok, true);
});

test("compareOutput defaults to loose when no mode given", () => {
  assert.equal(runCpp.compareOutput("5\n", "5").ok, true);
});

test("diff reports line counts and missing lines", () => {
  const r = runCpp.compareOutput("a\nb\nc", "a\nb", "loose");
  assert.equal(r.ok, false);
  assert.equal(r.diff.line, 3);
  assert.equal(r.diff.expected, "c");
  assert.equal(r.diff.actual, "(no line)");
  assert.equal(r.diff.expectedLineCount, 3);
  assert.equal(r.diff.actualLineCount, 2);
});

test("token compare ignores extra/whitespace differences but counts tokens", () => {
  assert.equal(runCpp.compareOutput("1 2 3", "1\n2\n3\n", "token").ok, true);
  assert.equal(runCpp.compareOutput("a  b", "a b", "token").ok, true);
  assert.equal(runCpp.compareOutput("1 2", "1 2 3", "token").ok, false); // extra token
  assert.equal(runCpp.compareOutput("1 2", "1 3", "token").ok, false);   // value differs
});

test("float compare accepts numbers within epsilon, rejects beyond", () => {
  assert.equal(runCpp.compareOutput("3.14159", "3.141590001", "float", { epsilon: 1e-6 }).ok, true);
  // fails both absolute and relative tolerance (2 / 1000002 ≈ 2e-6 > 1e-6)
  assert.equal(runCpp.compareOutput("1000000", "1000002", "float", { epsilon: 1e-6 }).ok, false);
  assert.equal(runCpp.compareOutput("2.0", "2.000001", "float", { epsilon: 1e-3 }).ok, true);
  // relative tolerance accepts tiny relative error at large magnitude
  assert.equal(runCpp.compareOutput("1e9", "1000000001", "float", { epsilon: 1e-6 }).ok, true);
});

test("float compare still matches non-numeric tokens exactly", () => {
  assert.equal(runCpp.compareOutput("YES 3.0", "YES 3.0000001", "float", { epsilon: 1e-6 }).ok, true);
  assert.equal(runCpp.compareOutput("YES 3.0", "NO 3.0", "float", { epsilon: 1e-6 }).ok, false);
});

test("float compare defaults epsilon to 1e-6 when unset", () => {
  assert.equal(runCpp.compareOutput("1.0000001", "1.0000002", "float").ok, true);
  assert.equal(runCpp.compareOutput("1.1", "1.2", "float").ok, false);
});

// ---------------------------------------------------------------------------
// overallVerdict — worst-status-wins aggregation
// ---------------------------------------------------------------------------

test("overallVerdict returns AC for empty and all-AC lists", () => {
  assert.equal(runCpp.overallVerdict([]), "AC");
  assert.equal(runCpp.overallVerdict(["AC", "AC"]), "AC");
});

test("overallVerdict respects CE > TLE > RE > WA priority", () => {
  assert.equal(runCpp.overallVerdict(["AC", "WA"]), "WA");
  assert.equal(runCpp.overallVerdict(["WA", "RE"]), "RE");
  assert.equal(runCpp.overallVerdict(["RE", "TLE"]), "TLE");
  assert.equal(runCpp.overallVerdict(["TLE", "CE"]), "CE");
  assert.equal(runCpp.overallVerdict(["AC", "TLE", "WA"]), "TLE");
});

// ---------------------------------------------------------------------------
// slugify — folder ids, incl. Vietnamese
// ---------------------------------------------------------------------------

test("slugify lowercases and hyphenates", () => {
  assert.equal(slugify("Hello World"), "hello-world");
  assert.equal(slugify("USACO 2021 — Milk"), "usaco-2021-milk");
});

test("slugify strips Vietnamese diacritics and maps đ", () => {
  assert.equal(slugify("Đường đi"), "duong-di");
  assert.equal(slugify("Số phần tử"), "so-phan-tu");
});

test("slugify falls back to 'problem' for empty/punctuation-only input", () => {
  assert.equal(slugify("***"), "problem");
  assert.equal(slugify(""), "problem");
  assert.equal(slugify(null), "problem");
});

test("slugify caps length at 60 chars", () => {
  assert.ok(slugify("a".repeat(200)).length <= 60);
});

// ---------------------------------------------------------------------------
// extractSamples — pull Sample Input/Output pairs from a statement
// ---------------------------------------------------------------------------

test("extractSamples pairs labelled input/output fenced blocks", () => {
  const md = [
    "## Sample Input 1", FENCE, "1 2", FENCE,
    "## Sample Output 1", FENCE, "3", FENCE
  ].join("\n");
  const s = extractSamples(md);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "1 2");
  assert.equal(s[0].output, "3");
});

test("extractSamples falls back to pairing bare consecutive code blocks", () => {
  const md = [FENCE, "5", FENCE, "", FENCE, "120", FENCE].join("\n");
  const s = extractSamples(md);
  assert.equal(s.length, 1);
  assert.equal(s[0].input, "5");
  assert.equal(s[0].output, "120");
});

test("extractSamples returns [] for empty input", () => {
  assert.deepEqual(extractSamples(""), []);
  assert.deepEqual(extractSamples(null), []);
});

// ---------------------------------------------------------------------------
// Competitive Companion payload mapping
// ---------------------------------------------------------------------------

test("deriveSource maps known judges by URL, else falls back to group prefix", () => {
  assert.equal(deriveSource("https://codeforces.com/contest/4/problem/A", "Codeforces - Round 4"), "Codeforces");
  assert.equal(deriveSource("https://atcoder.jp/contests/abc/tasks/abc_a", ""), "AtCoder");
  assert.equal(deriveSource("https://cses.fi/problemset/task/1068", ""), "CSES");
  assert.equal(deriveSource("https://example.edu/x", "MyJudge - Set 1"), "MyJudge");
});

test("toProblemInput converts a Competitive Companion payload to createProblem input", () => {
  const payload = {
    name: "A. Watermelon",
    group: "Codeforces - Round 4",
    url: "https://codeforces.com/contest/4/problem/A",
    timeLimit: 1000,
    memoryLimit: 256,
    tests: [{ input: "8\n", output: "YES\n" }, { input: "3\n", output: "NO\n" }]
  };
  const inp = toProblemInput(payload);
  assert.equal(inp.title, "A. Watermelon");
  assert.equal(inp.source, "Codeforces");
  assert.equal(inp.tests.length, 2);
  assert.equal(inp.tests[0].input, "8\n");
  assert.equal(inp.tests[0].expected, "YES\n");
  assert.equal(inp.input, "8\n");       // first sample pre-loaded into scratch
  assert.equal(inp.expected, "YES\n");
  assert.match(inp.statement, /Watermelon/);
});

test("toProblemInput drops empty tests and handles a missing tests array", () => {
  const inp = toProblemInput({ name: "X", tests: [{ input: "", output: "" }] });
  assert.equal(inp.tests.length, 0);
  assert.equal(toProblemInput({ name: "Y" }).tests.length, 0);
  assert.equal(toProblemInput(null), null);
});

// ---------------------------------------------------------------------------
// looksGarbled — guard so OCR cleanup doesn't hallucinate from corrupt text
// ---------------------------------------------------------------------------

test("looksGarbled passes clean Vietnamese prose (lots of accented LETTERS)", () => {
  const vn = "Cho dãy số nguyên gồm n phần tử. Hãy tính tổng các phần tử trong dãy. " +
    "Ràng buộc: 1 ≤ n ≤ 100000, mỗi phần tử không vượt quá 10^9. In ra một số nguyên.";
  assert.equal(looksGarbled(vn), false);
});

test("looksGarbled passes a normal English statement with numbers/constraints", () => {
  const en = "Given an array of n integers, output the maximum subarray sum. " +
    "Constraints: 1 <= n <= 2*10^5, -10^9 <= a_i <= 10^9. Print one integer.";
  assert.equal(looksGarbled(en), false);
});

test("looksGarbled flags heavy replacement-character (encoding) garbage", () => {
  assert.equal(looksGarbled("���� ��� �������� ���� ��� ������ ���� ������ ��� ����"), true);
});

test("looksGarbled flags mostly-symbol noise", () => {
  assert.equal(looksGarbled("@#$%^&*()_+{}|:<>?~`-=[];',./@#$%^&*()_+{}|:<>?~`-=[];',./"), true);
});

test("looksGarbled lets very short text through (too little to judge)", () => {
  assert.equal(looksGarbled("a + b"), false);
  assert.equal(looksGarbled(""), false);
});

// ---------------------------------------------------------------------------
// formatRunHistory — Coach deep-context block (attempt count + truncated logs)
// ---------------------------------------------------------------------------

test("formatRunHistory returns empty string when there is no history", () => {
  assert.equal(formatRunHistory([]), "");
  assert.equal(formatRunHistory(null), "");
  assert.equal(formatRunHistory(undefined), "");
});

test("formatRunHistory renders verdict, score and time newest-first", () => {
  const out = formatRunHistory([
    { verdict: "WA", passed: 3, total: 5, timeMs: 12 },
    { verdict: "TLE", passed: 4, total: 5, timeMs: 1000 }
  ]);
  assert.match(out, /LỊCH SỬ NỘP BÀI GẦN ĐÂY .*2 lần/);
  assert.match(out, /#1 WA 3\/5 · 12ms/);
  assert.match(out, /#2 TLE 4\/5 · 1000ms/);
});

test("formatRunHistory includes stderr (from stderr or error) and truncates to 400 chars", () => {
  const longErr = "x".repeat(800);
  const out = formatRunHistory([{ verdict: "RE", stderr: longErr }]);
  assert.match(out, /stderr: x{400}(?!x)/);     // exactly 400 x's, no 401st
  // falls back to .error when stderr is absent
  const out2 = formatRunHistory([{ verdict: "CE", error: "compile boom" }]);
  assert.match(out2, /stderr: compile boom/);
});

test("formatRunHistory shows stdout only for failures, not AC, truncated to 300", () => {
  const wa = formatRunHistory([{ verdict: "WA", stdout: "wrong\noutput" }]);
  assert.match(wa, /stdout\(thực tế\): wrong/);
  const ac = formatRunHistory([{ verdict: "AC", stdout: "should-not-appear" }]);
  assert.doesNotMatch(ac, /should-not-appear/);
  const big = formatRunHistory([{ verdict: "WA", stdout: "y".repeat(500) }]);
  assert.match(big, /stdout\(thực tế\): y{300}(?!y)/);
});

test("formatRunHistory caps at the 5 most recent runs", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ verdict: "WA", passed: i, total: 9 }));
  const out = formatRunHistory(many);
  assert.match(out, /5 lần/);
  assert.ok(out.includes("#5"));
  assert.ok(!out.includes("#6"));
});
