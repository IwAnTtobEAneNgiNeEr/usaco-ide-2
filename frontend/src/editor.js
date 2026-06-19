// editor.js — the middle column code editor.
//
// Architecture (no build step, swappable for Monaco later): a transparent
// <textarea> layered over a syntax-highlighted <pre>, with a line-number gutter.
// The textarea remains the single source of truth; the <pre> mirrors it.

import { api } from "./api.js";
import { highlightCpp } from "./highlight.js";
import { escapeHtml } from "./md.js";
import { SNIPPETS } from "./snippet-table.js";

const PAIRS = { "(": ")", "[": "]", "{": "}" };
const QUOTES = new Set(['"', "'"]);
const CLOSERS = new Set([")", "]", "}"]);



function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function markDirty(app, on) {
  app.state.dirty = on;
  app.el.dirtyDot.classList.toggle("on", on);
}

async function saveCode(app) {
  if (!app.state.currentId) return false;
  const code = app.el.codeEditor.value;
  if (code === app.state.savedCode) { markDirty(app, false); app.setSaveState("Saved", "saved"); return true; }
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

// ---- Highlight + gutter sync ----------------------------------------------

export function refreshHighlight(app) {
  const value = app.el.codeEditor.value;
  // trailing newline keeps the highlight box height in lockstep with textarea
  app.el.codeHighlightCode.innerHTML = highlightCpp(value) + "\n";
  const lines = value.split("\n").length;
  if (app.state._gutterLines !== lines) {
    app.state._gutterLines = lines;
    let g = "";
    for (let i = 1; i <= lines; i++) g += i + "\n";
    app.el.codeGutter.textContent = g;
  }
  detectFreopen(app, value);
}

function syncScroll(app) {
  const ta = app.el.codeEditor;
  app.el.codeHighlight.scrollTop = ta.scrollTop;
  app.el.codeHighlight.scrollLeft = ta.scrollLeft;
  app.el.codeGutter.scrollTop = ta.scrollTop;
}

// ---- freopen detection / USACO filename warning ----------------------------

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

// ---- Text editing helpers --------------------------------------------------

function setValue(app, value, caret) {
  const ta = app.el.codeEditor;
  ta.value = value;
  if (caret != null) ta.selectionStart = ta.selectionEnd = caret;
  refreshHighlight(app);
}

function lineIndentAt(value, pos) {
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const m = value.slice(lineStart).match(/^[ \t]*/);
  return m ? m[0] : "";
}

function fireInput(app) {
  app.el.codeEditor.dispatchEvent(new Event("input"));
}

// ---- Metadata + file loading ----------------------------------------------

export function renderMeta(app) {
  const m = app.state.meta;
  if (!m) return;
  app.el.metaTitle.textContent = m.title;
  app.el.currentTitle.textContent = m.title;
  const chips = [
    m.source && `<span class="chip">${escapeHtml(m.source)}</span>`,
    m.topic && `<span class="chip"><b>topic</b> ${escapeHtml(m.topic)}</span>`,
    `<span class="chip"><b>diff</b> ${escapeHtml(m.difficulty)}</span>`,
    `<span class="chip"><b>status</b> ${escapeHtml(m.status)}</span>`,
    m.timeLimitMs && `<span class="chip"><b>TL</b> ${Math.round(m.timeLimitMs)}ms</span>`,
    m.usacoMode && m.fileName && `<span class="chip chip-usaco"><b>USACO</b> ${escapeHtml(m.fileName)}.in/.out</span>`,
    m.usesChecker && `<span class="chip chip-usaco" title="Bài này chấm bằng checker.cpp (special judge)"><b>SPJ</b> checker.cpp</span>`,
    m.lastVerdict && `<span class="chip"><b>last</b> <span class="vbadge v-${escapeHtml(m.lastVerdict)}">${escapeHtml(m.lastVerdict)}</span></span>`
  ].filter(Boolean).join("");
  app.el.metaChips.innerHTML = chips;
}

export function setEditorFiles(app, files) {
  app.el.codeEditor.value = files.code || "";
  app.state.savedCode = files.code || "";
  app.el.ioInput.value = files.input || "";
  app.el.ioExpected.value = files.expected || "";
  app.el.ioNotes.value = files.notes || "";
  app.el.ioStatement.value = files.statement || "";
  app.state.savedInput = files.input || "";
  app.state.savedExpected = files.expected || "";
  app.state.savedNotes = files.notes || "";
  app.state.savedStatement = files.statement || "";
  markDirty(app, false);
  app.setSaveState("", "");
  app.state._gutterLines = -1;
  refreshHighlight(app);
  app.el.codeEditor.scrollTop = 0;
  syncScroll(app);
}

// ---- Init ------------------------------------------------------------------

export function initEditor(app) {
  const { el } = app;
  const codeSaver = debounce(() => saveCode(app), app.state.settings.autosaveDelayMs || 800);

  app.saveCodeNow = () => saveCode(app);
  app.refreshHighlight = () => refreshHighlight(app);
  app.insertAtCursor = (text) => {
    const ed = el.codeEditor;
    const start = ed.selectionStart || 0;
    const end = ed.selectionEnd || 0;
    ed.value = ed.value.slice(0, start) + text + ed.value.slice(end);
    const caret = start + text.length;
    ed.selectionStart = ed.selectionEnd = caret;
    refreshHighlight(app);
    fireInput(app);
    ed.focus();
  };

  el.codeEditor.addEventListener("input", () => {
    refreshHighlight(app);
    if (!app.state.currentId) return;
    markDirty(app, el.codeEditor.value !== app.state.savedCode);
    if (app.state.settings.autosave) { app.setSaveState("Editing…", ""); codeSaver(); }
  });
  el.codeEditor.addEventListener("scroll", () => syncScroll(app));
  el.codeEditor.addEventListener("keydown", (e) => handleKeydown(app, e));

  el.btnSave.addEventListener("click", () => saveCode(app));
  if (el.btnUndo) {
    el.btnUndo.addEventListener("click", () => {
      if (app.editorUndo) {
        app.editorUndo();
      } else {
        el.codeEditor.focus();
        document.execCommand("undo");
      }
    });
  }
  el.btnEditMeta.addEventListener("click", () => app.openMetaModal(app.state.meta));

  const btnCopy = document.getElementById("btn-copy");
  if (btnCopy) btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(app.el.codeEditor.value);
      app.toast("Đã copy code", "ok");
    } catch {
      app.toast("Không copy được — clipboard bị trình duyệt chặn.", "err");
    }
  });

  const btnOpenFolder = document.getElementById("btn-open-folder");
  if (btnOpenFolder) btnOpenFolder.addEventListener("click", async () => {
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    try { await api.openInEditor(app.state.currentId); app.toast("Đang mở trong VS Code…", "ok"); }
    catch (err) { app.toast(err.message, "err"); }
  });

  bindIoField(app, el.ioInput, "savedInput", (v) => api.saveInput(app.state.currentId, v));
  bindIoField(app, el.ioExpected, "savedExpected", (v) => api.saveExpected(app.state.currentId, v));
  bindIoField(app, el.ioNotes, "savedNotes", (v) => api.saveNotes(app.state.currentId, v));
  bindIoField(app, el.ioStatement, "savedStatement", (v) => api.saveStatement(app.state.currentId, v));

  app.flushIo = async () => {
    if (!app.state.currentId) return;
    const tasks = [];
    if (el.ioInput.value !== app.state.savedInput) { app.state.savedInput = el.ioInput.value; tasks.push(api.saveInput(app.state.currentId, el.ioInput.value)); }
    if (el.ioExpected.value !== app.state.savedExpected) { app.state.savedExpected = el.ioExpected.value; tasks.push(api.saveExpected(app.state.currentId, el.ioExpected.value)); }
    if (tasks.length) { try { await Promise.all(tasks); } catch (err) { app.toast(err.message, "err"); } }
  };
}

function handleKeydown(app, e) {
  const ta = app.el.codeEditor;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const tabSize = app.state.settings.tabSize || 4;
  const indentUnit = " ".repeat(tabSize);

  // ----- Tab: snippet expansion / block indent / spaces -----
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    if (start !== end && value.slice(start, end).includes("\n")) {
      return indentBlock(app, indentUnit, false);
    }
    if (start === end) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const before = value.slice(lineStart, start);
      const m = before.match(/([A-Za-z_]\w*)$/);
      if (m && SNIPPETS[m[1]]) return expandSnippet(app, m[1], start);
    }
    const v = value.slice(0, start) + indentUnit + value.slice(end);
    setValue(app, v, start + indentUnit.length);
    return fireInput(app);
  }
  if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); return indentBlock(app, indentUnit, true); }

  // ----- Enter: smart indent -----
  if (e.key === "Enter" && start === end) {
    const indent = lineIndentAt(value, start);
    const prev = value[start - 1];
    const next = value[start];
    if (prev === "{" && next === "}") {
      e.preventDefault();
      const ins = "\n" + indent + indentUnit + "\n" + indent;
      setValue(app, value.slice(0, start) + ins + value.slice(end), start + 1 + indent.length + indentUnit.length);
      return fireInput(app);
    }
    if (prev === "{" || prev === "(" || prev === "[") {
      e.preventDefault();
      const ins = "\n" + indent + indentUnit;
      setValue(app, value.slice(0, start) + ins + value.slice(end), start + ins.length);
      return fireInput(app);
    }
    if (indent) {
      e.preventDefault();
      const ins = "\n" + indent;
      setValue(app, value.slice(0, start) + ins + value.slice(end), start + ins.length);
      return fireInput(app);
    }
    return; // default newline
  }

  // ----- Auto-pair brackets -----
  if (PAIRS[e.key]) {
    e.preventDefault();
    const sel = value.slice(start, end);
    const close = PAIRS[e.key];
    const v = value.slice(0, start) + e.key + sel + close + value.slice(end);
    setValue(app, v, sel ? start + 1 + sel.length + 1 : start + 1);
    if (!sel) app.el.codeEditor.selectionEnd = app.el.codeEditor.selectionStart = start + 1;
    return fireInput(app);
  }
  // ----- Auto-pair quotes -----
  if (QUOTES.has(e.key) && start === end) {
    if (value[start] === e.key) { e.preventDefault(); setValue(app, value, start + 1); return; }
    e.preventDefault();
    setValue(app, value.slice(0, start) + e.key + e.key + value.slice(end), start + 1);
    return fireInput(app);
  }
  // ----- Skip over a closer typed in front of itself -----
  if (CLOSERS.has(e.key) && start === end && value[start] === e.key) {
    e.preventDefault();
    setValue(app, value, start + 1);
    return;
  }
  // ----- Backspace deletes an empty pair -----
  if (e.key === "Backspace" && start === end && start > 0) {
    const prev = value[start - 1];
    const next = value[start];
    if ((PAIRS[prev] && PAIRS[prev] === next) || (QUOTES.has(prev) && prev === next)) {
      e.preventDefault();
      setValue(app, value.slice(0, start - 1) + value.slice(start + 1), start - 1);
      return fireInput(app);
    }
  }
}

function indentBlock(app, indentUnit, dedent) {
  const ta = app.el.codeEditor;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const a = value.lastIndexOf("\n", start - 1) + 1;
  const block = value.slice(a, end);
  const lines = block.split("\n");
  let delta = 0;
  const changed = lines.map((ln) => {
    if (dedent) {
      const m = ln.match(/^( {1,4}|\t)/);
      if (m) { delta -= m[0].length; return ln.slice(m[0].length); }
      return ln;
    }
    delta += indentUnit.length;
    return indentUnit + ln;
  }).join("\n");
  ta.value = value.slice(0, a) + changed + value.slice(end);
  ta.selectionStart = a;
  ta.selectionEnd = end + delta;
  refreshHighlight(app);
  fireInput(app);
}

function expandSnippet(app, word, caretPos) {
  const ta = app.el.codeEditor;
  const value = ta.value;
  const wordStart = caretPos - word.length;
  const indent = lineIndentAt(value, wordStart);
  let body = SNIPPETS[word];
  // Apply current indentation to continuation lines.
  body = body.split("\n").map((ln, i) => (i === 0 ? ln : indent + ln)).join("\n");
  const caretIdx = body.indexOf("$0");
  const clean = body.replace("$0", "");
  const finalCaret = caretIdx >= 0 ? wordStart + caretIdx : wordStart + clean.length;
  setValue(app, value.slice(0, wordStart) + clean + value.slice(caretPos), finalCaret);
  fireInput(app);
}

function bindIoField(app, element, savedKey, saver) {
  const save = debounce(async () => {
    if (!app.state.currentId) return;
    const v = element.value;
    if (v === app.state[savedKey]) return;
    try { await saver(v); app.state[savedKey] = v; }
    catch (err) { app.toast(err.message, "err"); }
  }, 700);
  element.addEventListener("input", save);
  element.addEventListener("blur", save);
}
