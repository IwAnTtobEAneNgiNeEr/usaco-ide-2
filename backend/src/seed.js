"use strict";

// seed.js — first-run sample problem.
//
// A fresh clone has an empty workspace/ (it is gitignored — it's user data).
// To let a new user verify the whole Run/Judge pipeline in one click, we seed
// one tiny, fully working problem the first time the server starts with an
// empty problem list. Never re-seeded after that: deleting it is a user choice.

const SAMPLE = {
  title: "Tổng hai số · Sum of Two Numbers",
  source: "USACO IDE",
  topic: "basics",
  difficulty: "easy",
  tags: ["sample", "io"],
  statement: [
    "# Tổng hai số · Sum of Two Numbers",
    "",
    "Cho hai số nguyên $a$ và $b$. In ra tổng $a + b$.",
    "",
    "*Given two integers $a$ and $b$, print their sum.*",
    "",
    "## Input",
    "Một dòng chứa hai số nguyên `a b` ( $|a|, |b| \\le 10^9$ ).",
    "",
    "## Output",
    "Một số nguyên duy nhất: `a + b`.",
    "",
    "## Sample",
    "```",
    "Input:  2 3",
    "Output: 5",
    "```",
    "",
    "> Bài mẫu này được tạo sẵn để bạn bấm **Run** (Ctrl+Enter) và **Judge All**",
    "> (Ctrl+Shift+Enter) kiểm tra ngay rằng g++ và bộ chấm hoạt động. Xóa nó bất",
    "> cứ lúc nào bạn muốn.",
    ""
  ].join("\n"),
  code: [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "",
    "int main() {",
    "    ios::sync_with_stdio(false);",
    "    cin.tie(nullptr);",
    "",
    "    long long a, b;",
    "    cin >> a >> b;",
    "    cout << a + b << '\\n';",
    "    return 0;",
    "}",
    ""
  ].join("\n"),
  input: "2 3\n",
  expected: "5\n",
  tests: [
    { name: "Sample", input: "2 3\n", expected: "5\n", reason: "Sample từ đề bài." },
    { name: "Số âm lớn", input: "-1000000000 -1000000000\n", expected: "-2000000000\n", reason: "Biên dưới — tổng tràn int 32-bit, cần long long." },
    { name: "Số không", input: "0 0\n", expected: "0\n", reason: "Trường hợp tầm thường." }
  ]
};

// Seed exactly one sample problem when the workspace has none.
// `store` needs listProblems() + createProblem() (problemStore satisfies this);
// injecting it keeps the function unit-testable without touching the real disk.
async function seedSampleIfEmpty(store, log = () => {}) {
  const existing = await store.listProblems();
  if (existing.length > 0) return null;
  const meta = await store.createProblem(SAMPLE);
  log(`Seeded sample problem "${SAMPLE.title}" (${meta.id}).`);
  return meta;
}

module.exports = { SAMPLE, seedSampleIfEmpty };
