// editor-cm.js — CodeMirror 6 mount + compatibility shim.
//
// Why a shim? Many modules (runner.js "Restore code", features/snippets.js
// insert-at-cursor, statement.js, lab.js, code-review.js, mini-chat.js, hints.js,
// wa-review.js, settings.js) talk to `app.el.codeEditor` as if it were a
// <textarea>: reading/writing `.value`, setting `.selectionStart/End`, dispatching
// `new Event("input")`, reading `.scrollTop`, etc. We keep that exact surface so
// nothing else has to change.
//
// What we own here: snippet expansion on Tab, freopen-detection warning, the
// autosave "input" event, dirty-dot, save-state pill, save-shortcut handling,
// tabSize, and the CM6 lifecycle. If the bundle fails to load we return false
// and editor.js falls back to the original textarea path so the app never bricks.

import { api } from "./api.js";

const CM_BUNDLE = "../vendor/codemirror/codemirror.js";

// ---- C++ snippets (Tab-expanded). $0 marks the final caret position. -----
const SNIPPETS = {
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

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function markDirty(app, on) {
  app.state.dirty = on;
  if (app.el.dirtyDot) app.el.dirtyDot.classList.toggle("on", on);
}

async function saveCode(app) {
  if (!app.state.currentId) return false;
  const code = app.editorView ? app.editorView.state.doc.toString() : "";
  if (code === app.state.savedCode) {
    markDirty(app, false);
    app.setSaveState("Saved", "saved");
    return true;
  }
  app.setSaveState("Saving…", "saving");
  try {
    await api.saveCode(app.state.currentId, code);
    app.state.savedCode = code;
    markDirty(app, false);
    app.setSaveState("Saved", "saved");
    return true;
  } catch (err) {
    app.setSaveState("Save failed", "err");
    app.toast(err.message, "err");
    return false;
  }
}

function detectFreopen(app, code) {
  const warn = app.el.freopenWarn;
  if (!warn) return;
  const files = [...code.matchAll(/freopen\s*\(\s*"([^"]+)"/g)].map((m) => m[1]);
  if (files.length === 0) { warn.classList.add("hidden"); warn.textContent = ""; return; }
  const meta = app.state.meta || {};
  const expectIn = meta.fileName ? `${meta.fileName}.in` : null;
  const expectOut = meta.fileName ? `${meta.fileName}.out` : null;
  const mismatched = files.filter((f) => f !== expectIn && f !== expectOut && f !== "/dev/stdin" && f !== "/dev/stdout");
  if (!meta.fileName) {
    warn.classList.remove("hidden");
    warn.textContent = `freopen(${files.join(", ")}) detected — set a File Name + enable USACO Mode in problem info.`;
  } else if (mismatched.length) {
    warn.classList.remove("hidden");
    warn.textContent = `⚠ freopen uses ${mismatched.join(", ")} but this problem's file is "${meta.fileName}". Expected ${expectIn} / ${expectOut}.`;
  } else if (!meta.usacoMode) {
    warn.classList.remove("hidden");
    warn.textContent = `freopen(${expectIn}/${expectOut}) detected — enable USACO Mode so file IO works.`;
  } else {
    warn.classList.add("hidden");
    warn.textContent = "";
  }
}

// ---- Compatibility shim ----------------------------------------------------
//
// Replaces the <textarea>. Extends EventTarget so existing
// `addEventListener("input", …)` keeps firing, and dispatching a synthetic
// `input` event runs the autosave path. Reads/writes proxy CM6 directly.

function createShim(app, view, legacyEditor) {
  const shim = new EventTarget();
  let suppressInput = false;

  // .value
  Object.defineProperty(shim, "value", {
    get() { return view.state.doc.toString(); },
    set(v) {
      const s = String(v == null ? "" : v);
      if (legacyEditor) legacyEditor.value = s;
      if (s === view.state.doc.toString()) return;
      // Replace the whole doc. Preserve the caret position if still valid;
      // otherwise put it at end. Subsequent selectionStart/End sets from the
      // caller (snippets.js) will overwrite.
      const prevCaret = Math.min(view.state.selection.main.head, s.length);
      suppressInput = true; // input fires below via dispatchEvent
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: s },
        selection: { anchor: prevCaret, head: prevCaret }
      });
      suppressInput = false;
    },
    configurable: true
  });

  // .selectionStart / .selectionEnd  — character offsets
  Object.defineProperty(shim, "selectionStart", {
    get() { return Math.min(view.state.selection.main.from, view.state.doc.length); },
    set(n) {
      const len = view.state.doc.length;
      const start = Math.max(0, Math.min(Number(n) || 0, len));
      const end = Math.max(start, Math.min(view.state.selection.main.to, len));
      view.dispatch({ selection: { anchor: start, head: end } });
    },
    configurable: true
  });
  Object.defineProperty(shim, "selectionEnd", {
    get() { return Math.min(view.state.selection.main.to, view.state.doc.length); },
    set(n) {
      const len = view.state.doc.length;
      const end = Math.max(0, Math.min(Number(n) || 0, len));
      const start = Math.min(view.state.selection.main.from, end);
      view.dispatch({ selection: { anchor: start, head: end } });
    },
    configurable: true
  });

  // .scrollTop / .scrollLeft  — proxy CM's scrollDOM
  Object.defineProperty(shim, "scrollTop", {
    get() { return view.scrollDOM.scrollTop; },
    set(n) { view.scrollDOM.scrollTop = Number(n) || 0; },
    configurable: true
  });
  Object.defineProperty(shim, "scrollLeft", {
    get() { return view.scrollDOM.scrollLeft; },
    set(n) { view.scrollDOM.scrollLeft = Number(n) || 0; },
    configurable: true
  });

  // .style.tabSize  — tracked through a Compartment; here we just expose a
  // proxy that swallows writes so settings.js doesn't blow up.
  shim.style = { tabSize: "4" };

  // .focus()
  shim.focus = () => view.focus();

  // .tagName for the global Ctrl+V paste guard in statement.js (it checks
  // `t === el.codeEditor`, but also some generic checks elsewhere).
  shim.tagName = "TEXTAREA";

  // Mark the shim so we can detect "is CM active" elsewhere.
  shim._isCmShim = true;
  shim._cmView = view;

  // Expose hook so the CM update listener can mute the "input" event when the
  // change came from the shim's setter (caller will fire input themselves).
  shim._suppressNextInput = () => { suppressInput = true; };
  shim._isInputSuppressed = () => suppressInput;
  shim._clearSuppress = () => { suppressInput = false; };

  return shim;
}

// ---- Mount -----------------------------------------------------------------

export async function mountCmEditor(app) {
  let CM;
  try {
    CM = await import(CM_BUNDLE);
  } catch (err) {
    console.warn("[editor-cm] vendored CodeMirror bundle failed to load — falling back to textarea.", err);
    return false;
  }

  const codeStack = document.querySelector(".code-stack");
  const legacyEditor = document.getElementById("code-editor");
  if (!codeStack || !legacyEditor) {
    console.warn("[editor-cm] code-stack / code-editor missing — falling back.");
    return false;
  }

  // Hide the legacy textarea + overlay + gutter (don't remove — keeps DOM ids
  // around for diagnostic tooling and lets us fall back to them if needed).
  legacyEditor.style.display = "none";
  const legacyHighlight = document.getElementById("code-highlight");
  const legacyGutter = document.getElementById("code-gutter");
  if (legacyHighlight) legacyHighlight.style.display = "none";
  if (legacyGutter) legacyGutter.style.display = "none";

  // Mount host inside .code-stack.
  const host = document.createElement("div");
  host.id = "cm-editor-host";
  host.className = "cm-editor-host";
  codeStack.appendChild(host);

  // ---- snippet-expansion Tab handler (runs before indentMore) -----------
  const lineIndent = (line) => (line.match(/^[ \t]*/) || [""])[0];

  const snippetTab = {
    key: "Tab",
    run(view) {
      const { state } = view;
      const sel = state.selection.main;
      if (sel.from !== sel.to) return false; // let indentMore handle blocks
      const line = state.doc.lineAt(sel.from);
      const before = line.text.slice(0, sel.from - line.from);
      const m = before.match(/([A-Za-z_]\w*)$/);
      if (!m || !SNIPPETS[m[1]]) {
        // If no snippet matches, insert spaces at cursor
        const size = (app.state.settings && app.state.settings.tabSize) || 4;
        const indentStr = " ".repeat(size);
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: indentStr },
          selection: { anchor: sel.from + indentStr.length, head: sel.from + indentStr.length },
          scrollIntoView: true,
          userEvent: "input.type"
        });
        return true;
      }
      const word = m[1];
      const indent = lineIndent(line.text);
      let body = SNIPPETS[word].split("\n")
        .map((ln, i) => (i === 0 ? ln : indent + ln)).join("\n");
      const caretIdx = body.indexOf("$0");
      const clean = body.replace("$0", "");
      const wordStart = sel.from - word.length;
      const finalCaret = caretIdx >= 0 ? wordStart + caretIdx : wordStart + clean.length;
      view.dispatch({
        changes: { from: wordStart, to: sel.to, insert: clean },
        selection: { anchor: finalCaret, head: finalCaret },
        scrollIntoView: true,
        userEvent: "input.snippet"
      });
      return true;
    }
  };

  // ---- Save-on-Ctrl-S keymap; let editor.js shortcuts still see it ------
  const saveKey = {
    key: "Mod-s",
    preventDefault: true,
    run() { saveCode(app); return true; }
  };

  // ---- Tab-size compartment (settings.js can re-apply) ------------------
  const tabSizeCompartment = new CM.Compartment();
  const startTabSize = (app.state.settings && app.state.settings.tabSize) || 4;
  const indentString = (n) => " ".repeat(n);

  // ---- Theme — match the existing dark editor ---------------------------
  const theme = CM.EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "13.5px",
      backgroundColor: "transparent",
      color: "var(--text)"
    },
    ".cm-scroller": {
      fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, Consolas, ui-monospace, monospace',
      lineHeight: "1.55"
    },
    ".cm-content": { padding: "12px 4px", caretColor: "var(--accent)" },
    ".cm-gutters": {
      backgroundColor: "var(--editor-bg)",
      color: "#4b5b72",
      border: "none",
      borderRight: "1px solid var(--border-soft)"
    },
    ".cm-activeLineGutter": { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "var(--accent)" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.02)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(56,189,248,0.28) !important"
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    ".cm-foldGutter .cm-gutterElement": { color: "#6b7c93", cursor: "pointer" },
    ".cm-tooltip": {
      backgroundColor: "var(--panel)",
      color: "var(--text)",
      border: "1px solid var(--border)"
    },
    ".cm-panels": {
      backgroundColor: "var(--panel)",
      color: "var(--text)",
      borderTop: "1px solid var(--border)"
    },
    ".cm-panels input, .cm-panels button": {
      backgroundColor: "var(--bg-soft)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      padding: "2px 6px"
    },
    ".cm-searchMatch": { backgroundColor: "rgba(234,179,8,0.28)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(234,179,8,0.55)" }
  }, { dark: true });

  // ---- VS-Code-Dark+ flavored highlight style (no separate import) ------
  const hl = CM.HighlightStyle.define([
    { tag: CM.t.keyword, color: "var(--syn-kw)" },
    { tag: CM.t.controlKeyword, color: "var(--syn-ctrl)" },
    { tag: CM.t.typeName, color: "var(--syn-type)" },
    { tag: CM.t.className, color: "var(--syn-type)" },
    { tag: CM.t.number, color: "var(--syn-num)" },
    { tag: CM.t.string, color: "var(--syn-str)" },
    { tag: CM.t.comment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.lineComment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.blockComment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.function(CM.t.variableName), color: "var(--syn-fn)" },
    { tag: CM.t.macroName, color: "var(--syn-ctrl)" },
    { tag: CM.t.operator, color: "var(--text)" },
    { tag: CM.t.bracket, color: "var(--text-muted)" }
  ]);

  // ---- Build the state --------------------------------------------------
  const updateListener = CM.EditorView.updateListener.of((u) => {
    if (!u.docChanged) return;
    if (app.incrementKeystroke) app.incrementKeystroke();
    const code = u.state.doc.toString();
    if (app.shimCodeEditor && app.shimCodeEditor._isInputSuppressed()) {
      app.shimCodeEditor._clearSuppress();
    } else if (app.shimCodeEditor) {
      // Sync to legacy textarea so native copy / fallback works, and events fire correctly.
      legacyEditor.value = code;
      legacyEditor.dispatchEvent(new Event("input"));
      app.shimCodeEditor.dispatchEvent(new Event("input"));
    }
    detectFreopen(app, code);
  });

  const state = CM.EditorState.create({
    doc: "",
    extensions: [
      CM.lineNumbers(),
      CM.highlightActiveLineGutter(),
      CM.highlightSpecialChars(),
      CM.history(),
      CM.foldGutter(),
      CM.drawSelection(),
      CM.dropCursor(),
      CM.EditorState.allowMultipleSelections.of(true),
      CM.indentOnInput(),
      CM.bracketMatching(),
      CM.closeBrackets(),
      CM.autocompletion({ activateOnTyping: false }),
      CM.rectangularSelection(),
      CM.crosshairCursor(),
      CM.highlightActiveLine(),
      CM.highlightSelectionMatches(),
      CM.search({ top: true }),
      CM.syntaxHighlighting(hl, { fallback: true }),
      CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
      CM.cpp(),
      tabSizeCompartment.of([
        CM.EditorState.tabSize.of(startTabSize)
      ]),
      CM.keymap.of([
        saveKey,
        snippetTab,
        CM.indentWithTab,
        ...CM.closeBracketsKeymap,
        ...CM.defaultKeymap,
        ...CM.searchKeymap,
        ...CM.historyKeymap,
        ...CM.foldKeymap,
        ...CM.completionKeymap
      ]),
      theme,
      updateListener
    ]
  });

  const view = new CM.EditorView({ state, parent: host });
  app.editorView = view;

  // Capture-phase Ctrl+S / Ctrl+Enter / Ctrl+Shift+Enter / Ctrl+N inside the
  // editor — CM normally swallows them. The doc-level shortcuts wired in
  // main.js depend on these bubbling. Re-dispatching feels hacky; instead the
  // CM keymap above already handles Mod-s, and we re-route the others here.
  view.dom.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "Enter") {
      // CM has nothing bound to Mod-Enter — manually drive Run / Judge.
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) { if (app.judgeAll) app.judgeAll(); }
      else { if (app.runOne) app.runOne(); }
    } else if (e.key.toLowerCase() === "n" && !e.shiftKey) {
      // Mod-N -> new problem.
      e.preventDefault();
      e.stopPropagation();
      if (app.openMetaModal) app.openMetaModal(null);
    }
  });

  // ---- Build the shim and install it as app.el.codeEditor --------------
  const shim = createShim(app, view, legacyEditor);
  app.shimCodeEditor = shim;
  app.el.codeEditor = shim;

  // Re-expose the highlight refresh (now: only freopen check).
  app.refreshHighlight = () => detectFreopen(app, view.state.doc.toString());

  // Public adapter API (per the migration plan).
  app.getCode = () => view.state.doc.toString();
  app.setCode = (code) => { shim.value = code; };
  app.focusEditor = () => view.focus();
  app.editorUndo = () => {
    if (view && CM.historyKeymap && CM.historyKeymap[0] && typeof CM.historyKeymap[0].run === "function") {
      CM.historyKeymap[0].run(view);
      view.focus();
    }
  };
  app.insertAtCursor = (text) => {
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length, head: sel.from + text.length },
      scrollIntoView: true,
      userEvent: "input.snippet"
    });
    view.focus();
  };

  // Allow settings.js to re-apply tabSize without touching style.
  app.applyTabSize = (n) => {
    const size = Math.max(1, Math.min(16, Number(n) || 4));
    view.dispatch({
      effects: tabSizeCompartment.reconfigure([CM.EditorState.tabSize.of(size)])
    });
    shim.style.tabSize = String(size);
  };

  // Autosave path stays exactly where it was: editor.js's initEditor wires
  // `shim.addEventListener("input", ...)` and that listener reads
  // `shim.value` → CM doc. The Mod-S keybinding above takes care of the
  // "save right now" case without depending on editor.js being booted.

  return true;
}

