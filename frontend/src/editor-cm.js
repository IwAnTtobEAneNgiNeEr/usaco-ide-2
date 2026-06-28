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
import { SNIPPETS } from "./snippet-table.js";

const CM_BUNDLE = "../vendor/codemirror/codemirror.js";

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
  // ---- Word-wrap compartment (Editor Appearance toggle) -----------------
  const wrapCompartment = new CM.Compartment();
  const startTabSize = (app.state.settings && app.state.settings.tabSize) || 4;
  const indentString = (n) => " ".repeat(n);

  // ---- Theme — match the existing dark editor ---------------------------
  const theme = CM.EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "var(--code-fs)",
      backgroundColor: "transparent",
      color: "var(--code-fg)"
    },
    ".cm-scroller": {
      fontFamily: "var(--code-font)",
      lineHeight: "var(--code-lh)",
      letterSpacing: "var(--code-letter-spacing)",
      fontWeight: "var(--code-weight)"
    },
    ".cm-content": { padding: "12px 4px", caretColor: "var(--ed-cursor)", color: "var(--code-fg)" },
    ".cm-gutters": {
      backgroundColor: "var(--ed-gutter-bg)",
      color: "var(--ed-gutter-fg)",
      border: "none",
      borderRight: "1px solid var(--border-soft)"
    },
    ".cm-activeLineGutter": { backgroundColor: "var(--ed-active-gutter)", color: "var(--accent)" },
    ".cm-activeLine": { backgroundColor: "var(--ed-line-highlight)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--ed-selection) !important"
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ed-cursor)" },
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
      createRainbowBrackets(CM),
      createIndentationGuides(CM),
      createStdLibHighlighter(CM),
      tabSizeCompartment.of([
        CM.EditorState.tabSize.of(startTabSize)
      ]),
      wrapCompartment.of([]),
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

  // Word-wrap toggle (Editor Appearance). Reconfigures a compartment so it's
  // live and reversible; the legacy textarea fallback uses the `wrap` attribute.
  app.setWordWrap = (on) => {
    view.dispatch({
      effects: wrapCompartment.reconfigure(on ? [CM.EditorView.lineWrapping] : [])
    });
  };

  // Autosave path stays exactly where it was: editor.js's initEditor wires
  // `shim.addEventListener("input", ...)` and that listener reads
  // `shim.value` → CM doc. The Mod-S keybinding above takes care of the
  // "save right now" case without depending on editor.js being booted.

  return true;
}

// ---- Custom Extensions for editor features ---------------------------------

function createRainbowBrackets(CM) {
  return CM.ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.getDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }
    getDecorations(view) {
      const builder = new CM.RangeSetBuilder();
      const tree = CM.syntaxTree(view.state);
      let depth = 0;
      
      tree.iterate({
        from: 0,
        to: view.viewport.to,
        enter: (node) => {
          const name = node.name;
          if (name === "(" || name === "[" || name === "{") {
            const currentDepth = depth;
            depth++;
            if (node.from >= view.viewport.from && node.to <= view.viewport.to) {
              builder.add(node.from, node.to, CM.Decoration.mark({
                class: `rainbow-bracket-depth-${currentDepth % 3}`
              }));
            }
          } else if (name === ")" || name === "]" || name === "}") {
            depth = Math.max(0, depth - 1);
            if (node.from >= view.viewport.from && node.to <= view.viewport.to) {
              builder.add(node.from, node.to, CM.Decoration.mark({
                class: `rainbow-bracket-depth-${depth % 3}`
              }));
            }
          }
        }
      });
      return builder.finish();
    }
  }, {
    decorations: v => v.decorations
  });
}

function createIndentationGuides(CM) {
  const indentationMark = CM.Decoration.mark({ class: "cm-indentation-guide" });

  class IndentationWidget extends CM.WidgetType {
    constructor(indents) {
      super();
      this.indents = indents;
    }
    static create(indents) {
      return CM.Decoration.widget({
        widget: new IndentationWidget(indents),
        side: 1,
      });
    }
    toDOM() {
      const wrap = document.createElement("span");
      wrap.className = "cm-indentation-widget";
      for (const indent of this.indents) {
        const marker = wrap.appendChild(document.createElement("span"));
        marker.className = "cm-indentation-guide";
        marker.textContent = " ".repeat(indent);
      }
      return wrap;
    }
  }

  const SPACES = /^\s*/;
  function getCodeStart(text) {
    return (text.match(SPACES) || [""])[0].length;
  }

  function makeIndentationMark(from, to, totalIndent, tabSize, builder) {
    let indentPos = from + tabSize;
    const toMark = to - from;
    const upTo = Math.min(to - (toMark % tabSize), from + totalIndent);
    while (indentPos <= upTo) {
      builder.add(indentPos - 1, indentPos, indentationMark);
      indentPos += tabSize;
    }
  }

  function makeIndentationWidget(from, to, totalIndent, tabSize, builder) {
    const alreadyMarked = to - from;
    if (totalIndent <= alreadyMarked) {
      return;
    }
    const indentsToMark = [];
    const toMark = totalIndent - alreadyMarked;
    const indentationMarkToComplete = toMark % tabSize;
    if (indentationMarkToComplete) {
      indentsToMark.push(indentationMarkToComplete);
    }
    const numRemainingIndents = (toMark - indentationMarkToComplete) / tabSize;
    indentsToMark.push(...Array(numRemainingIndents).fill(tabSize));
    builder.add(to, to, IndentationWidget.create(indentsToMark));
  }

  function makeIndentationDecorators(view) {
    const builder = new CM.RangeSetBuilder();
    const tabSize = Number(view.state.tabSize) || 4;
    const doc = view.state.doc;
    const spaceOnlyLines = [];
    let currentIndent = 0;
    
    for (const { from: visibleFrom, to: visibleTo } of view.visibleRanges) {
      let to = visibleFrom - 1;
      let pos, from, length, text;
      while ((pos = to + 1) <= visibleTo) {
        const line = doc.lineAt(pos);
        from = line.from;
        to = line.to;
        length = line.length;
        text = line.text;
        
        const codeStartsAt = getCodeStart(text);
        const isAllSpaces = codeStartsAt === length;
        const skipIndent = codeStartsAt < tabSize;
        const isComment = text.trim().startsWith("//") || text.trim().startsWith("#");
        
        if (isAllSpaces) {
          spaceOnlyLines.push({ from, to });
          continue;
        } else if (skipIndent) {
          spaceOnlyLines.length = 0;
          continue;
        }
        
        const indent = codeStartsAt - (codeStartsAt % tabSize);
        if (!isComment) {
          currentIndent = indent;
        }
        
        for (const sol of spaceOnlyLines) {
          makeIndentationMark(sol.from, sol.to, currentIndent, tabSize, builder);
          makeIndentationWidget(sol.from, sol.to, currentIndent, tabSize, builder);
        }
        spaceOnlyLines.length = 0;
        
        makeIndentationMark(from, to, indent, tabSize, builder);
      }
    }
    return builder.finish();
  }

  return CM.ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = makeIndentationDecorators(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = makeIndentationDecorators(update.view);
      }
    }
  }, {
    decorations: v => v.decorations
  });
}

function createStdLibHighlighter(CM) {
  const CXX_STD_LIB = new Set([
    "vector", "set", "map", "unordered_map", "unordered_set", "multiset", "multimap", 
    "priority_queue", "queue", "stack", "deque", "pair", "string", "tuple", "bitset", "array", "list",
    "sort", "stable_sort", "reverse", "unique", "min", "max", "swap", "abs", 
    "lower_bound", "upper_bound", "binary_search", "next_permutation", "prev_permutation", 
    "memset", "fill", "accumulate", "gcd", "lcm", "min_element", "max_element", "iota", 
    "__builtin_popcount", "__builtin_popcountll", "__builtin_clz", "__builtin_ctz", 
    "make_pair", "make_tuple", "tie", "get", "push_back", "pop_back", "insert", "erase", 
    "find", "count", "size", "empty", "clear", "begin", "end", "rbegin", "rend", 
    "front", "back", "push", "pop", "top", "push_front", "pop_front",
    "cin", "cout", "cerr", "endl", "stdin", "stdout", "printf", "scanf", "sscanf", "sprintf"
  ]);

  const stdLibMark = CM.Decoration.mark({ class: "cm-std-library" });

  return CM.ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.getDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }
    getDecorations(view) {
      const builder = new CM.RangeSetBuilder();
      const tree = CM.syntaxTree(view.state);
      
      tree.iterate({
        from: view.viewport.from,
        to: view.viewport.to,
        enter: (node) => {
          if (node.name === "VariableName" || node.name === "Type" || node.name === "Identifier" || node.name === "NamespaceMemberName" || node.name === "FieldIdentifier") {
            const text = view.state.doc.sliceString(node.from, node.to);
            if (CXX_STD_LIB.has(text)) {
              builder.add(node.from, node.to, stdLibMark);
            }
          }
        }
      });
      return builder.finish();
    }
  }, {
    decorations: v => v.decorations
  });
}


