// highlight.js — tiny, fast C++ tokenizer → highlighted HTML (VS Code Dark+ vibe).
// No dependencies. Designed to run on every keystroke (single linear scan).

const CONTROL = new Set([
  "if", "else", "for", "while", "do", "return", "break", "continue",
  "switch", "case", "default", "goto"
]);

const KEYWORD = new Set([
  "using", "namespace", "const", "constexpr", "static", "struct", "class",
  "public", "private", "protected", "template", "typename", "typedef", "auto",
  "new", "delete", "sizeof", "this", "true", "false", "nullptr", "operator",
  "friend", "virtual", "override", "inline", "explicit", "enum", "union",
  "try", "catch", "throw", "noexcept", "volatile", "register", "extern", "mutable"
]);

const TYPE = new Set([
  "int", "long", "short", "char", "bool", "float", "double", "void",
  "unsigned", "signed", "wchar_t", "size_t", "string", "wstring",
  "vector", "map", "unordered_map", "set", "unordered_set", "multiset",
  "pair", "tuple", "queue", "deque", "stack", "priority_queue", "list",
  "array", "bitset", "ll", "ull", "ld", "uint", "int64_t", "uint64_t",
  "int32_t", "complex"
]);

const STL = new Set([
  "sort", "stable_sort", "lower_bound", "upper_bound", "binary_search",
  "push_back", "emplace_back", "pop_back", "push", "pop", "top", "front",
  "back", "begin", "end", "rbegin", "rend", "size", "empty", "clear",
  "insert", "erase", "find", "count", "max", "min", "max_element",
  "min_element", "swap", "reverse", "unique", "accumulate", "fill",
  "memset", "abs", "sqrt", "pow", "gcd", "lcm", "__gcd", "make_pair",
  "make_tuple", "next_permutation", "prev_permutation", "to_string",
  "stoi", "stoll", "substr", "printf", "scanf", "cout", "cin", "cerr",
  "endl", "first", "second", "move", "tie", "ignore", "assign", "resize"
]);

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function classify(word) {
  if (CONTROL.has(word)) return "tok-ctrl";
  if (KEYWORD.has(word)) return "tok-kw";
  if (TYPE.has(word)) return "tok-type";
  if (STL.has(word)) return "tok-fn";
  return null;
}

const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdent = (c) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c) => /[0-9]/.test(c);

export function highlightCpp(src) {
  let out = "";
  const n = src.length;
  let i = 0;
  let atLineStart = true;

  while (i < n) {
    const c = src[i];

    // Preprocessor directive (e.g. #include <bits/stdc++.h>)
    if (atLineStart && (c === "#" || (/[ \t]/.test(c) && /^[ \t]*#/.test(src.slice(i, src.indexOf("\n", i) === -1 ? n : src.indexOf("\n", i)))))) {
      let j = i;
      while (j < n && src[j] !== "\n") j += 1;
      out += `<span class="tok-pre">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      atLineStart = false;
      continue;
    }

    // Line comment
    if (c === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j += 1;
      out += `<span class="tok-cmt">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    // Block comment
    if (c === "/" && src[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
      j = Math.min(n, j + 2);
      out += `<span class="tok-cmt">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      atLineStart = false;
      continue;
    }
    // String / char literal
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\") j += 1;
        if (src[j] === "\n") break;
        j += 1;
      }
      j = Math.min(n, j + 1);
      const cls = quote === '"' ? "tok-str" : "tok-char";
      out += `<span class="${cls}">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      atLineStart = false;
      continue;
    }
    // Number
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxXbBoO._eE+'-]/.test(src[j])) {
        // stop a trailing +/- that isn't part of an exponent
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1])) break;
        j += 1;
      }
      out += `<span class="tok-num">${escapeHtml(src.slice(i, j))}</span>`;
      i = j;
      atLineStart = false;
      continue;
    }
    // Identifier / keyword
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdent(src[j])) j += 1;
      const word = src.slice(i, j);
      const cls = classify(word);
      // function call colouring: identifier immediately followed by '('
      let k = j;
      while (k < n && /[ \t]/.test(src[k])) k += 1;
      const isCall = src[k] === "(";
      if (cls) out += `<span class="${cls}">${word}</span>`;
      else if (isCall) out += `<span class="tok-fn">${word}</span>`;
      else out += escapeHtml(word);
      i = j;
      atLineStart = false;
      continue;
    }
    // Whitespace / newline
    if (c === "\n") { out += "\n"; i += 1; atLineStart = true; continue; }
    if (/[ \t]/.test(c)) { out += c; i += 1; continue; }

    // Any other single character (operators, punctuation)
    out += escapeHtml(c);
    i += 1;
    atLineStart = false;
  }
  return out;
}
