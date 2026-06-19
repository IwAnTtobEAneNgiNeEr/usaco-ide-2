// snippet-table.js — Tab-expanded C++ snippets. $0 marks the final caret
// position. Single source of truth for BOTH editors (the CodeMirror mount in
// editor-cm.js and the plain-textarea fallback in editor.js) — keep additions
// here so the two never drift apart. The README "Editor" section lists these.
export const SNIPPETS = {
  fastio: "ios::sync_with_stdio(false);\ncin.tie(nullptr);$0",
  fori: "for (int i = 0; i < $0; i++) {\n    \n}",
  forj: "for (int j = 0; j < $0; j++) {\n    \n}",
  rep: "for (int i = 0; i < $0; i++) {\n    \n}",
  forn: "for (int i = 0; i < n; i++) {\n    $0\n}",
  pb: "push_back($0)",
  eb: "emplace_back($0)",
  all: "begin($0), end($0)",
  vi: "vector<int> $0",
  vll: "vector<long long> $0",
  vvi: "vector<vector<int>> $0",
  pii: "pair<int, int>$0",
  pll: "pair<long long, long long>$0",
  ll: "long long $0",
  ld: "long double $0",
  sortv: "sort($0.begin(), $0.end());",
  mod: "const long long MOD = 1e9 + 7;$0",
  inf: "const long long INF = 1e18;$0",
  readn: "int n; cin >> n;$0",
  yes: 'cout << "YES\\n";$0',
  no: 'cout << "NO\\n";$0',
  main: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    $0\n    return 0;\n}"
};
