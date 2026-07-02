// highlight.js — tiny, fast C++ tokenizer → highlighted HTML (VS Code Dark+ vibe).
// No dependencies. Designed to run on every keystroke (single linear scan).

const CONTROL = new Set([
  "if", "else", "for", "while", "do", "return", "break", "continue",
  "switch", "case", "default", "goto"
]);

const KEYWORD = new Set([
  "using", "namespace", "const", "constexpr", "static", "struct", "class",
  "public", "private", "protected", "template", "typename", "typedef", "auto",
  "new", "delete", "sizeof", "this", "nullptr", "operator", "friend",
  "virtual", "override", "inline", "explicit", "enum", "union", "try",
  "catch", "throw", "noexcept", "volatile", "register", "extern", "mutable"
]);

const TYPE = new Set([
  "int", "long", "short", "char", "bool", "float", "double", "void",
  "unsigned", "signed", "wchar_t", "size_t", "string", "wstring",
  "vector", "map", "unordered_map", "set", "unordered_set", "multiset",
  "pair", "tuple", "queue", "deque", "stack", "priority_queue", "list",
  "array", "bitset", "ll", "ull", "ld", "uint", "int64_t", "uint64_t",
  "int32_t", "complex"
]);

const BOOL_LITERAL = new Set(["true", "false"]);

const STL = new Set([
  "sort", "stable_sort", "lower_bound", "upper_bound", "binary_search",
  "push_back", "emplace_back", "pop_back", "push", "pop", "top", "front",
  "back", "begin", "end", "rbegin", "rend", "size", "empty", "clear",
  "insert", "erase", "find", "count", "max", "min", "max_element",
  "min_element", "swap", "reverse", "unique", "accumulate", "fill",
  "memset", "abs", "sqrt", "pow", "gcd", "lcm", "__gcd", "make_pair",
  "make_tuple", "next_permutation", "prev_permutation", "to_string",
  "stoi", "stoll", "substr", "printf", "scanf", "cout", "cin", "cerr",
  "endl", "first", "second", "move", "tie", "ignore", "assign", "resize",
  "push_front", "pop_front", "iota", "get"
]);

const DECL_MOD = new Set([
  "const", "constexpr", "static", "mutable", "volatile", "signed", "unsigned",
  "short", "long", "struct", "class", "enum", "typename", "typedef", "auto"
]);

const OPERATORS = new Set([
  "+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~", "?",
  ":", ".", ","
]);

const BRACKETS = new Set(["(", ")", "[", "]", "{", "}"]);

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdent = (c) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c) => /[0-9]/.test(c);
const isAllCaps = (word) => /^[A-Z][A-Z0-9_]*$/.test(word) || /^_[A-Z0-9_]+$/.test(word);

function append(out, cls, text) {
  out.push(cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));
}

function peekNonSpace(src, from) {
  let i = from;
  while (i < src.length && /[ \t]/.test(src[i])) i += 1;
  return { index: i, char: src[i] || "" };
}

function highlightPreprocessor(line) {
  const out = [];
  let i = 0;

  while (i < line.length && /[ \t]/.test(line[i])) {
    append(out, null, line[i]);
    i += 1;
  }

  if (line[i] === "#") {
    append(out, "tok-pre", "#");
    i += 1;
  }

  while (i < line.length && /[ \t]/.test(line[i])) {
    append(out, null, line[i]);
    i += 1;
  }

  const cmdStart = i;
  while (i < line.length && /[A-Za-z_]/.test(line[i])) i += 1;
  const directive = line.slice(cmdStart, i);
  if (directive) append(out, "tok-macro", directive);

  while (i < line.length) {
    const ch = line[i];
    if (/[ \t]/.test(ch)) {
      append(out, null, ch);
      i += 1;
      continue;
    }
    if (ch === "<") {
      const end = line.indexOf(">", i + 1);
      const j = end === -1 ? line.length : end + 1;
      append(out, "tok-header", line.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\") j += 1;
        j += 1;
      }
      j = Math.min(line.length, j + 1);
      append(out, "tok-header", line.slice(i, j));
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < line.length && isIdent(line[j])) j += 1;
      const word = line.slice(i, j);
      append(out, isAllCaps(word) ? "tok-macro" : "tok-meta", word);
      i = j;
      continue;
    }
    append(out, OPERATORS.has(ch) ? "tok-op" : null, ch);
    i += 1;
  }

  return out.join("");
}

export function highlightCpp(src) {
  const out = [];
  const context = {
    expectClassName: false,
    expectNamespaceName: false,
    declarationHint: false,
    afterMemberAccess: false,
    afterScopeAccess: false,
    lastSigWord: "",
    parenStack: []
  };

  let i = 0;
  let atLineStart = true;

  while (i < src.length) {
    const c = src[i];

    if (atLineStart && (c === "#" || (/[ \t]/.test(c) && /^[ \t]*#/.test(src.slice(i, src.indexOf("\n", i) === -1 ? src.length : src.indexOf("\n", i)))))) {
      let j = i;
      while (j < src.length && src[j] !== "\n") j += 1;
      out.push(highlightPreprocessor(src.slice(i, j)));
      i = j;
      atLineStart = false;
      continue;
    }

    if (c === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < src.length && src[j] !== "\n") j += 1;
      append(out, "tok-cmt", src.slice(i, j));
      i = j;
      continue;
    }

    if (c === "/" && src[i + 1] === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
      j = Math.min(src.length, j + 2);
      append(out, "tok-cmt", src.slice(i, j));
      i = j;
      atLineStart = false;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\") j += 1;
        if (src[j] === "\n") break;
        j += 1;
      }
      j = Math.min(src.length, j + 1);
      append(out, quote === '"' ? "tok-str" : "tok-char", src.slice(i, j));
      i = j;
      atLineStart = false;
      context.afterMemberAccess = false;
      context.afterScopeAccess = false;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i + 1;
      while (j < src.length && /[0-9a-fA-FxXbBoO._eE+'-]/.test(src[j])) {
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1])) break;
        j += 1;
      }
      append(out, "tok-num", src.slice(i, j));
      i = j;
      atLineStart = false;
      context.afterMemberAccess = false;
      context.afterScopeAccess = false;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j += 1;
      const word = src.slice(i, j);
      const next = peekNonSpace(src, j);
      let cls = "";

      const followedByScope = src.slice(next.index, next.index + 2) === "::";

      if (BOOL_LITERAL.has(word)) {
        cls = "tok-bool";
      } else if (context.expectClassName) {
        cls = "tok-class";
        context.expectClassName = false;
        context.declarationHint = false;
      } else if (context.expectNamespaceName || context.afterScopeAccess || followedByScope) {
        cls = STL.has(word) ? "tok-std-lib" : "tok-namespace";
        context.expectNamespaceName = false;
      } else if (context.afterMemberAccess) {
        cls = STL.has(word) ? "tok-std-lib" : "tok-prop";
      } else if (CONTROL.has(word)) {
        cls = "tok-ctrl";
      } else if (KEYWORD.has(word)) {
        cls = "tok-kw";
        if (word === "class" || word === "struct" || word === "enum" || word === "union") {
          context.expectClassName = true;
        } else if (word === "namespace") {
          context.expectNamespaceName = true;
        }
      } else if (TYPE.has(word)) {
        cls = "tok-type";
        context.declarationHint = true;
      } else if (STL.has(word)) {
        cls = "tok-std-lib";
      } else if (isAllCaps(word)) {
        cls = "tok-const";
      } else if (next.char === "(") {
        cls = "tok-fn";
        if (context.declarationHint) {
          context.parenStack.push("params");
        }
      } else if (context.parenStack[context.parenStack.length - 1] === "params" && context.declarationHint) {
        cls = "tok-var-def";
      }

      append(out, cls || null, word);

      if (word === "const" || word === "constexpr") {
        context.declarationHint = true;
      } else if (DECL_MOD.has(word) && !TYPE.has(word)) {
        context.declarationHint = true;
      } else if (!cls || (cls !== "tok-type" && cls !== "tok-class" && cls !== "tok-namespace")) {
        if (cls === "tok-var-def" || cls === "tok-fn") {
          context.declarationHint = false;
        }
      }

      context.afterMemberAccess = false;
      context.afterScopeAccess = false;
      context.lastSigWord = word;
      i = j;
      atLineStart = false;
      continue;
    }

    if (c === "\n") {
      append(out, null, "\n");
      i += 1;
      atLineStart = true;
      context.afterMemberAccess = false;
      context.afterScopeAccess = false;
      context.declarationHint = false;
      continue;
    }

    if (/[ \t]/.test(c)) {
      append(out, null, c);
      i += 1;
      continue;
    }

    if (c === ":" && src[i + 1] === ":") {
      append(out, "tok-op", "::");
      i += 2;
      atLineStart = false;
      context.afterScopeAccess = true;
      context.afterMemberAccess = false;
      continue;
    }

    if (c === "-" && src[i + 1] === ">") {
      append(out, "tok-op", "->");
      i += 2;
      atLineStart = false;
      context.afterMemberAccess = true;
      context.afterScopeAccess = false;
      continue;
    }

    if (BRACKETS.has(c)) {
      append(out, "tok-bracket", c);
      if (c === "(") {
        if (context.parenStack[context.parenStack.length - 1] !== "params") {
          context.parenStack.push("paren");
        }
      } else if (c === ")") {
        context.parenStack.pop();
        context.declarationHint = false;
      } else if (c === "{") {
        context.declarationHint = false;
      }
      i += 1;
      atLineStart = false;
      context.afterMemberAccess = false;
      context.afterScopeAccess = false;
      continue;
    }

    if (OPERATORS.has(c)) {
      append(out, "tok-op", c);
      if (c === ".") {
        context.afterMemberAccess = true;
      } else {
        context.afterMemberAccess = false;
      }
      if (c === "," && context.parenStack[context.parenStack.length - 1] === "params") {
        context.declarationHint = true;
      } else if (c === ";" || c === "{") {
        context.declarationHint = false;
      }
      i += 1;
      atLineStart = false;
      context.afterScopeAccess = false;
      continue;
    }

    append(out, null, c);
    i += 1;
    atLineStart = false;
    context.afterMemberAccess = false;
    context.afterScopeAccess = false;
  }

  return out.join("");
}
