"use strict";

// Tests for ai.js's findSpoilerComment — the mechanical backstop against a
// real content-quality bug found during manual E2E verification: an AI-
// generated Rush drill's buggyCode contained a comment that literally named
// the fix ("// sai công thức, nên dùng (a+b-1)/b"), handing the answer to
// the player before they'd even read the code. Pure, no chat()/network
// dependency, so it's unit-testable directly (unlike generateRushDrill's
// full flow, which needs a real or route-level mocked model call).

const test = require("node:test");
const assert = require("node:assert/strict");

const { findSpoilerComment } = require("../src/ai");

test("findSpoilerComment: catches the exact real-world failure (nên dùng X thay vì Y)", () => {
  const code = [
    "int main(){",
    "  long long result = (a + b) / b; // sai công thức, nên dùng (a+b-1)/b",
    "  cout << result;",
    "}",
  ].join("\n");
  assert.ok(findSpoilerComment(code));
});

test("findSpoilerComment: catches block comments too", () => {
  const code = "int x = a + b; /* should be a + b - 1 */";
  assert.ok(findSpoilerComment(code));
});

test("findSpoilerComment: catches English phrasing (instead of / should use)", () => {
  assert.ok(findSpoilerComment("int x = f(a); // should use g(a) instead of f(a)"));
  assert.ok(findSpoilerComment("int x = f(a); // instead of g(a), this uses f(a)"));
});

test("findSpoilerComment: a normal, non-spoiler comment is NOT flagged", () => {
  const code = [
    "int main(){",
    "  int n; cin >> n; // đọc số phần tử",
    "  long long sum = 0; // tổng chạy",
    "  for (int i = 0; i < n; i++) sum += i;",
    "  cout << sum;",
    "}",
  ].join("\n");
  assert.equal(findSpoilerComment(code), null);
});

test("findSpoilerComment: generic words like 'sai'/'lỗi'/'bug' alone do NOT false-positive", () => {
  // These are common in totally innocent CP comments and must NOT trigger a
  // reject-and-retry (that would burn real API calls on valid drills).
  const code = "// kiểm tra input có sai định dạng không\nint x = 1; // tránh lỗi tràn số ở bug case lớn";
  assert.equal(findSpoilerComment(code), null);
});

test("findSpoilerComment: no comments at all returns null", () => {
  assert.equal(findSpoilerComment("int main(){ return 0; }"), null);
});

test("findSpoilerComment: empty/null input never throws", () => {
  assert.equal(findSpoilerComment(""), null);
  assert.equal(findSpoilerComment(null), null);
  assert.equal(findSpoilerComment(undefined), null);
});

// ---- normalizeCodeString: the double-escape guard -------------------------------

const { normalizeCodeString } = require("../src/ai");

test("normalizeCodeString: unescapes a double-escaped single-line program", () => {
  // The double-escaped payload as JSON.parse delivers it: literal backslash-n
  // pairs instead of real newlines (built with join to keep this file's own
  // escaping readable).
  const BSLASH_N = "\\" + "n";
  const broken = ["#include <bits/stdc++.h>", "using namespace std;", "int main(){", '  cout << 1;', "}"].join(BSLASH_N);
  const fixed = normalizeCodeString(broken);
  assert.ok(fixed.includes("\n"), "must contain real newlines");
  assert.ok(!fixed.includes(BSLASH_N), "no literal backslash-n left");
  assert.equal(fixed.split("\n").length, 5);
});

test("normalizeCodeString: leaves healthy multi-line code alone (even with escaped newlines inside string literals)", () => {
  const healthy = '#include <bits/stdc++.h>\nint main(){\n  printf("%d' + "\\" + 'n", 1);\n}\n';
  assert.equal(normalizeCodeString(healthy), healthy);
});

test("normalizeCodeString: keeps C++ escapes inside string literals while restoring line breaks", () => {
  const BSLASH_N = "\\" + "n";
  // Double-escaped program whose code ALSO prints "\n" — the in-string escape
  // must survive verbatim or the unescape itself creates a CE.
  const broken = ["#include <bits/stdc++.h>", "int main(){", '  std::cout << 1 << "' + BSLASH_N + '";', "}"].join(BSLASH_N);
  const fixed = normalizeCodeString(broken);
  assert.equal(fixed.split("\n").length, 4, "statement-level breaks must become real newlines");
  assert.ok(fixed.includes('<< "' + BSLASH_N + '";'), "the cout escape must stay a literal backslash-n");
});

test("normalizeCodeString: empty/null never throws", () => {
  assert.equal(normalizeCodeString(""), "");
  assert.equal(normalizeCodeString(null), "");
});

// ---- safeParseJson: hai bug thật tìm ra khi verify Điền Lõi live ----------------

const { safeParseJson } = require("../src/ai");

test("safeParseJson: valid JSON containing inner markdown fences must NOT be fence-stripped", () => {
  const payload = { title: "Demo", statement: "## Vi du\n```\n5 5\n1 2 3\n```\nxong" };
  const parsed = safeParseJson(JSON.stringify(payload));
  assert.equal(parsed.title, "Demo");
  assert.ok(parsed.statement.includes("1 2 3"));
});

test("safeParseJson: valid JSON is returned verbatim (no control-char repair corruption)", () => {
  const payload = { code: 'cout << "a\nb";', note: "dòng 2" };
  const parsed = safeParseJson(JSON.stringify(payload));
  assert.equal(parsed.code, 'cout << "a\nb";');
});

test("safeParseJson: a fence-WRAPPED payload still unwraps", () => {
  const inner = JSON.stringify({ ok: 1 });
  const parsed = safeParseJson("```json\n" + inner + "\n```");
  assert.equal(parsed.ok, 1);
});
