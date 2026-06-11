// main.js — bootstraps USACO IDE 2.0, owns shared state, and wires modules.

import { api } from "./api.js";
import { initLayout, setTab, setView } from "./layout.js";
import { initProblems, renderProblems } from "./problems.js";
import { initEditor, renderMeta, setEditorFiles } from "./editor.js";
import { mountCmEditor } from "./editor-cm.js";
import { initTests, renderTests } from "./testcases.js";
import { initRunner, renderHistory } from "./runner.js";
import { initSettings } from "./settings.js";
import { initStatement, loadProblemView } from "./statement.js";
import { initTimer } from "./timer.js";
import { initHints } from "./hints.js";
import { initNotes } from "./notes.js";
import { initSidebarToggle } from "./features/sidebar-toggle.js";
import { initTopicFilter } from "./features/topic-filter.js";
import { initDesktopShell } from "./features/desktop-launcher.js";
import { initWaReview } from "./features/wa-review.js";
import { initSnippets } from "./features/snippets.js";
import { initCodeReview } from "./features/code-review.js";
import { initLab } from "./features/lab.js";
import { initDashboard } from "./features/dashboard.js";
import { initMiniChat } from "./features/mini-chat.js";
import { initSynthesizer } from "./features/synthesizer.js";
import { initEditorial } from "./features/editorial.js";
import { initContests } from "./features/contests.js";
import { initJourney } from "./features/journey.js";
import { initCommandPalette } from "./features/command-palette.js";
import { initMistakeBook } from "./features/mistake-book.js";
import { initBoss } from "./features/boss.js";
import { initDefense } from "./features/defense.js";
import { initFlashQuiz } from "./features/flash-quiz.js";
import { initVisualizer } from "./features/visualizer.js";
import { initSkillTree } from "./features/skilltree.js";

const $ = (id) => document.getElementById(id);

const app = {
  state: {
    problems: [],
    currentId: null,
    meta: null,
    settings: { autosave: true, autosaveDelayMs: 800, tabSize: 4, compareMode: "loose", timeMs: 2000 },
    activeTab: "run",
    activeView: "code",
    dirty: false,
    filters: { search: "", source: "", status: "", difficulty: "", topics: [] },
    tests: [],
    openTests: new Set(),
    testResults: {},
    savedCode: "", savedInput: "", savedExpected: "", savedNotes: "", savedStatement: "",
    editingMeta: null,
    aiSettings: null,
    aiTests: []
  },
  el: {}
};

// ---------------- DOM refs ----------------
function collectRefs() {
  app.el = {
    currentTitle: $("current-title"),
    autosaveState: $("autosave-state"),
    compilerPill: $("compiler-pill"),
    btnRun: $("btn-run"),
    btnJudge: $("btn-judge"),

    // focus timer
    timerDisplay: $("timer-display"),
    timerToggle: $("timer-toggle"),
    timerReset: $("timer-reset"),
    timerPreset: $("timer-preset"),

    btnNew: $("btn-new"),
    btnNew2: $("btn-new-2"),
    search: $("search"),
    filterSource: $("filter-source"),
    filterStatus: $("filter-status"),
    filterDifficulty: $("filter-difficulty"),
    sourceSuggest: $("source-suggest"),
    problemList: $("problem-list"),
    problemCount: $("problem-count"),

    editorEmpty: $("editor-empty"),
    editorShell: $("editor-shell"),
    metaTitle: $("meta-title"),
    metaChips: $("meta-chips"),
    btnEditMeta: $("btn-edit-meta"),
    btnSave: $("btn-save"),
    btnUndo: $("btn-undo"),
    dirtyDot: $("dirty-dot"),
    freopenWarn: $("freopen-warn"),
    codeEditor: $("code-editor"),
    codeHighlight: $("code-highlight"),
    codeHighlightCode: $("code-highlight-code"),
    codeGutter: $("code-gutter"),

    panelTabs: $("panel-tabs"),
    outputVerdict: $("output-verdict"),
    rcRuntime: $("rc-runtime"),
    rcSummary: $("rc-summary"),
    outputDiff: $("output-diff"),
    outputStdout: $("output-stdout"),
    outputStderr: $("output-stderr"),
    stderrSection: $("stderr-section"),
    diffSection: $("diff-section"),
    inGutter: $("in-gutter"),
    expGutter: $("exp-gutter"),
    outGutter: $("out-gutter"),
    btnRunCustom: $("btn-run-custom"),
    btnSaveAsTest: $("btn-save-as-test"),
    ioInput: $("io-input"),
    ioExpected: $("io-expected"),
    ioNotes: $("io-notes"),
    ioStatement: $("io-statement"),

    // statement
    statementStatus: $("statement-status"),
    btnSaveStatement: $("btn-save-statement"),
    btnClearStatement: $("btn-clear-statement"),
    btnUploadImage: $("btn-upload-image"),
    btnPasteImage: $("btn-paste-image"),
    imageFile: $("image-file"),
    btnAnalyze: $("btn-analyze"),
    analysisCard: $("analysis-card"),
    examplesCard: $("examples-card"),
    genTestsCard: $("gen-tests-card"),
    btnAiGenStatement: $("btn-ai-generate-statement"),
    btnAiTemplate: $("btn-ai-template"),
    btnZen: $("btn-zen"),
    btnShortcutsHelp: $("btn-shortcuts-help"),

    // tests
    btnAddTest: $("btn-add-test"),
    btnRunTests: $("btn-run-tests"),
    btnAiGenTests: $("btn-ai-generate-tests"),
    testsSummary: $("tests-summary"),
    testsList: $("tests-list"),

    // notes
    btnNotesTemplate: $("btn-notes-template"),
    btnNotesPreview: $("btn-notes-preview"),
    notesPreview: $("notes-preview"),

    // history
    historyList: $("history-list"),
    historyDetail: $("history-detail"),

    settingsForm: $("settings-form"),

    metaModal: $("meta-modal"),
    metaModalTitle: $("meta-modal-title"),
    metaForm: $("meta-form"),
    metaCancel: $("meta-cancel"),

    hintModal: $("hint-modal"),
    hintBody: $("hint-body"),
    hintClose: $("hint-close")
  };
}

// ---------------- Shared helpers ----------------
app.setTab = (name) => setTab(app, name);
app.setView = (name) => setView(app, name);
app.getEditorValue = () => {
  return app.getCode ? app.getCode() : (app.el.codeEditor ? app.el.codeEditor.value : "");
};
app.setEditorValue = (v) => {
  if (app.setCode) app.setCode(v);
  else if (app.el.codeEditor) {
    app.el.codeEditor.value = v;
    if (app.refreshHighlight) app.refreshHighlight();
  }
};

app.toast = (message, type = "") => {
  const host = $("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  // Errors linger longer — they often carry detail (AI / compile messages) the
  // user actually needs to read before it disappears.
  const ttl = type === "err" ? 5500 : 2600;
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; }, ttl);
  setTimeout(() => el.remove(), ttl + 300);
};

app.setSaveState = (text, cls) => {
  app.el.autosaveState.textContent = text || "";
  app.el.autosaveState.className = "autosave-state " + (cls || "");
};

app.setCompilerPill = (compiler) => {
  const pill = app.el.compilerPill;
  if (compiler && compiler.available) {
    pill.textContent = "g++ ✓"; pill.className = "pill pill-ok"; pill.title = compiler.version || "compiler ready";
  } else {
    pill.textContent = "g++ ✗"; pill.className = "pill pill-bad"; pill.title = "g++ not found — configure it in Settings";
  }
};

// ---------------- Problem lifecycle ----------------
app.refreshProblems = async () => {
  const { problems } = await api.listProblems();
  app.state.problems = problems;
  renderProblems(app);
};

app.clearEditor = () => {
  app.state.currentId = null;
  app.state.meta = null;
  app.el.editorShell.classList.add("hidden");
  app.el.editorEmpty.classList.remove("hidden");
  app.el.currentTitle.textContent = "No problem selected";
  app.el.btnRun.disabled = true;
  app.el.btnJudge.disabled = true;
  if (app.refreshSynthAvail) app.refreshSynthAvail();
  renderProblems(app);
};

function resetOutput() {
  app.el.outputVerdict.className = "verdict-chip verdict-idle";
  app.el.outputVerdict.textContent = "READY";
  app.el.rcRuntime.textContent = "— ms";
  app.el.rcSummary.innerHTML = "";
  app.el.outputStdout.textContent = "";
  app.el.outputStderr.textContent = "";
  app.el.outputDiff.innerHTML = "";
  if (app.el.stderrSection) app.el.stderrSection.classList.add("hidden");
  if (app.el.diffSection) app.el.diffSection.classList.add("hidden");
  if (app.el.outGutter) app.el.outGutter.textContent = "1\n";
  app.state.testResults = {};
}

app.selectProblem = (id) => app.loadProblem(id);

app.loadProblem = async (id) => {
  try {
    const [{ problem }, { code }, { input }, { expected }, { notes }, { statement }, { tests }] = await Promise.all([
      api.getProblem(id), api.getCode(id), api.getInput(id), api.getExpected(id),
      api.getNotes(id), api.getStatement(id), api.listTests(id)
    ]);
    app.state.currentId = id;
    app.state.meta = problem;
    app.state.tests = tests;
    app.state.openTests = new Set();
    app.state.testResults = {};

    app.el.editorEmpty.classList.add("hidden");
    app.el.editorShell.classList.remove("hidden");
    app.el.btnRun.disabled = false;
    app.el.btnJudge.disabled = false;

    app.setView("code");
    renderMeta(app);
    setEditorFiles(app, { code, input, expected, notes, statement });
    renderTests(app);
    renderHistory(app);
    loadProblemView(app);
    app.el.statementStatus.innerHTML = "Dán ảnh (Ctrl+V), tải ảnh/PDF, hoặc gõ đề bài — AI sẽ tự phân tích &amp; tạo test.";
    resetOutput();
    if (app.refreshWaReview) app.refreshWaReview();
    if (app.refreshChat) app.refreshChat();
    if (app.refreshSynthAvail) app.refreshSynthAvail();
    renderProblems(app);
  } catch (err) {
    app.toast(err.message, "err");
  }
};

app.reloadTests = async () => {
  if (!app.state.currentId) return;
  try {
    const { tests } = await api.listTests(app.state.currentId);
    app.state.tests = tests;
    renderTests(app);
  } catch (err) { app.toast(err.message, "err"); }
};

app.syncMeta = async () => {
  if (!app.state.currentId) return;
  try {
    const { problem } = await api.getProblem(app.state.currentId);
    app.state.meta = problem;
    renderMeta(app);
    renderHistory(app);
    if (app.refreshWaReview) app.refreshWaReview();
    if (app.refreshSynthAvail) app.refreshSynthAvail();
    if (app.refreshCoachActions) app.refreshCoachActions();
    await app.refreshProblems();
  } catch { /* non-fatal */ }
};

// ---------------- Metadata modal ----------------
app.openMetaModal = (meta) => {
  app.state.editingMeta = meta || null;
  const form = app.el.metaForm;
  app.el.metaModalTitle.textContent = meta ? "Edit problem info" : "New problem";
  form.title.value = meta ? meta.title : "";
  form.source.value = meta ? meta.source : "";
  form.topic.value = meta ? meta.topic : "";
  form.difficulty.value = meta ? meta.difficulty : "unrated";
  form.status.value = meta ? meta.status : "learning";
  form.fileName.value = meta ? (meta.fileName || "") : "";
  form.usacoMode.checked = meta ? Boolean(meta.usacoMode) : false;
  if (form.timeLimitMs) form.timeLimitMs.value = meta && meta.timeLimitMs ? meta.timeLimitMs : "";
  app.el.metaModal.classList.remove("hidden");
  setTimeout(() => form.title.focus(), 30);
};
app.closeMetaModal = () => app.el.metaModal.classList.add("hidden");

function initMetaModal() {
  app.el.metaCancel.addEventListener("click", () => app.closeMetaModal());
  app.el.metaForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = app.el.metaForm;
    const data = {
      title: f.title.value.trim(),
      source: f.source.value.trim(),
      topic: f.topic.value.trim(),
      difficulty: f.difficulty.value,
      status: f.status.value,
      fileName: f.fileName.value.trim().replace(/\.(in|out)$/i, ""),
      usacoMode: f.usacoMode.checked,
      timeLimitMs: Number(f.timeLimitMs && f.timeLimitMs.value) || 0
    };
    if (!data.title) return;
    try {
      if (app.state.editingMeta) {
        const { problem } = await api.updateProblem(app.state.editingMeta.id, data);
        app.state.meta = problem;
        renderMeta(app);
        if (app.refreshHighlight) app.refreshHighlight();
        await app.refreshProblems();
        app.toast("Saved", "ok");
      } else {
        const { problem } = await api.createProblem(data);
        app.toast(`Created “${problem.title}”`, "ok");
        await app.refreshProblems();
        app.selectProblem(problem.id);
      }
      app.closeMetaModal();
    } catch (err) { app.toast(err.message, "err"); }
  });
}

// ---------------- Editor health ----------------
// Called only when CodeMirror failed to mount and we fell back to the plain
// textarea. Marks the language pill so the user knows why the editor looks
// barebones — everything (save / compile / judge) still works.
function markEditorDegraded() {
  const tag = $("editor-lang");
  if (!tag) return;
  tag.textContent = "C++17 · plain";
  tag.classList.add("lang-degraded");
  tag.title = "CodeMirror không tải được — đang dùng trình soạn thảo cơ bản. Lưu / biên dịch / chấm vẫn hoạt động bình thường.";
}

// ---------------- AI activity indicator ----------------
// Shows a global "AI đang chạy… ✕ Hủy" pill whenever any AI request is in
// flight, and cancels every in-flight AI call on click. Fully automatic —
// driven by api.onAiActivityChange, so no per-feature wiring is needed.
function initAiActivity() {
  const host = $("ai-activity");
  const cancel = $("ai-activity-cancel");
  const text = document.getElementById("ai-activity-text");
  if (!host || !cancel) return;
  cancel.addEventListener("click", () => api.abortAiRequest());
  api.onAiActivityChange((count) => {
    host.classList.toggle("hidden", count <= 0);
    // Be explicit when several AI calls run at once — Cancel aborts them all.
    if (text) text.textContent = count > 1 ? `${count} tác vụ AI đang chạy…` : "AI đang chạy…";
  });
}

// ---------------- Keystrokes & Runs trackers ----------------
app.state.sessionKeys = 0;
app.state.sessionRuns = 0;

app.incrementKeystroke = () => {
  app.state.sessionKeys++;
  const elKeys = document.getElementById("session-keys-val");
  if (elKeys) elKeys.textContent = app.state.sessionKeys;
};

app.incrementRuns = () => {
  app.state.sessionRuns++;
  const elRuns = document.getElementById("session-runs-val");
  if (elRuns) elRuns.textContent = app.state.sessionRuns;
};

// ---------------- Zen Focus Mode ----------------
app.toggleZenMode = () => {
  const workbench = document.querySelector(".workbench");
  if (!workbench) return;
  const isZen = workbench.classList.toggle("zen-mode");
  const btn = document.getElementById("btn-zen");
  if (btn) {
    btn.classList.toggle("btn-primary", isZen);
    btn.innerHTML = isZen ? "🧘 Zen ON" : "🧘 Zen";
  }
};

// ---------------- Sound Player (Web Audio API synthesis) ----------------
app.playSound = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === "success") {
      // Clean mechanical tick/click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
    else if (type === "error") {
      // Clean low warning tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
    else if (type === "ac") {
      // Sleek double-tone notification chime (Slack/Apple vibe)
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.06, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(1046.50, 0, 0.08); // C6
      playTone(1318.51, 0.06, 0.15); // E6
    }
    else if (type === "wa") {
      // Clean woodblock-like thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    }
    else if (type === "timer") {
      // Digital watch alarm (clean high triple-beep)
      const playBeep = (start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1800, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.08);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.1);
      };
      playBeep(0);
      playBeep(0.15);
      playBeep(0.3);
    }
    else if (type === "complete") {
      // Clean high tick for task completions
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    }
  } catch (e) {
    console.warn("[Sound] Failed to play sound:", e);
  }
};

// ---------------- Theme Applier ----------------
app.applyTheme = (theme, accentColor) => {
  theme = theme || "dark";
  accentColor = accentColor || "blue";

  // Apply theme class
  if (theme === "light") {
    document.documentElement.classList.add("light-theme");
  } else {
    document.documentElement.classList.remove("light-theme");
  }

  // Accent colors configuration
  const accents = {
    blue: {
      dark: { primary: "#5b9bff", strong: "#3b7bf0", soft: "rgba(91, 155, 255, 0.14)", grad: "linear-gradient(135deg, #5b9bff 0%, #7b86ff 100%)" },
      light: { primary: "#2563eb", strong: "#1d4ed8", soft: "rgba(37, 99, 235, 0.1)", grad: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)" }
    },
    green: {
      dark: { primary: "#4ade80", strong: "#22c55e", soft: "rgba(74, 222, 128, 0.14)", grad: "linear-gradient(135deg, #4ade80 0%, #06b6d4 100%)" },
      light: { primary: "#16a34a", strong: "#15803d", soft: "rgba(22, 163, 74, 0.1)", grad: "linear-gradient(135deg, #16a34a 0%, #0d9488 100%)" }
    },
    orange: {
      dark: { primary: "#ffaa44", strong: "#f97316", soft: "rgba(255, 170, 68, 0.14)", grad: "linear-gradient(135deg, #ffaa44 0%, #ef4444 100%)" },
      light: { primary: "#ea580c", strong: "#c2410c", soft: "rgba(234, 88, 12, 0.1)", grad: "linear-gradient(135deg, #ea580c 0%, #dc2626 100%)" }
    },
    purple: {
      dark: { primary: "#c084fc", strong: "#a855f7", soft: "rgba(192, 132, 252, 0.14)", grad: "linear-gradient(135deg, #c084fc 0%, #ec4899 100%)" },
      light: { primary: "#9333ea", strong: "#7e22ce", soft: "rgba(147, 51, 234, 0.1)", grad: "linear-gradient(135deg, #9333ea 0%, #db2777 100%)" }
    },
    red: {
      dark: { primary: "#f87171", strong: "#ef4444", soft: "rgba(248, 113, 113, 0.14)", grad: "linear-gradient(135deg, #f87171 0%, #f43f5e 100%)" },
      light: { primary: "#dc2626", strong: "#b91c1c", soft: "rgba(220, 38, 38, 0.1)", grad: "linear-gradient(135deg, #dc2626 0%, #e11d48 100%)" }
    }
  };

  const choice = accents[accentColor] || accents.blue;
  const colors = choice[theme] || choice.dark;

  document.documentElement.style.setProperty("--accent", colors.primary);
  document.documentElement.style.setProperty("--accent-strong", colors.strong);
  document.documentElement.style.setProperty("--accent-soft", colors.soft);
  document.documentElement.style.setProperty("--accent-grad", colors.grad);
  document.documentElement.style.setProperty("--btn-primary", colors.strong);
  document.documentElement.style.setProperty("--btn-primary-h", colors.strong === "#3b7bf0" ? "#2f6be0" : colors.primary);
  document.documentElement.style.setProperty("--btn-run", colors.strong);
  document.documentElement.style.setProperty("--btn-run-h", colors.strong === "#3b7bf0" ? "#2f6be0" : colors.primary);
};

// ---------------- Keyboard shortcuts ----------------
function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Esc closes the topmost open modal (any .modal-overlay:not(.hidden)).
    // Goes first because the rest of this handler bails on non-modifier keys.
    if (e.key === "Escape") {
      const open = [...document.querySelectorAll(".modal-overlay:not(.hidden)")];
      if (open.length) {
        e.preventDefault();
        open[open.length - 1].classList.add("hidden");
        return;
      }
    }

    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.classList.contains("cm-content"));

    // ? shows keyboard shortcuts if not typing
    if (e.key === "?" && !typing) {
      e.preventDefault();
      document.getElementById("shortcuts-modal")?.classList.remove("hidden");
      return;
    }

    // Alt+Z toggles Zen Mode
    if (e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      app.toggleZenMode();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "e" && e.shiftKey) { e.preventDefault(); if (app.coachAskSelection) app.coachAskSelection(); }
    else if (e.key.toLowerCase() === "s") { e.preventDefault(); if (app.saveCodeNow) app.saveCodeNow(); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); if (app.judgeAll) app.judgeAll(); }
    else if (e.key === "Enter") { e.preventDefault(); if (app.runOne) app.runOne(); }
    else if (e.key.toLowerCase() === "n") { e.preventDefault(); app.openMetaModal(null); }
    else if (e.key === ";") { e.preventDefault(); if (app.focusCoachInput) app.focusCoachInput(); }
  });
}

// ---------------- Boot ----------------
async function boot() {
  collectRefs();

  try {
    const { settings } = await api.getSettings();
    app.state.settings = settings;
  } catch { /* defaults stand */ }
  app.applyTheme(app.state.settings.theme, app.state.settings.accentColor);

  initLayout(app);
  initProblems(app);
  initDesktopShell();
  initSidebarToggle();
  initTopicFilter(app);
  initEditor(app);
  // CodeMirror 6 — try to mount; falls back to textarea automatically. We only
  // surface a marker when it DEGRADES to the plain textarea (silent when healthy).
  let cmOk = false;
  try { cmOk = await mountCmEditor(app); } catch (e) { console.warn("[boot] CM mount failed, using textarea:", e); }
  if (!cmOk) markEditorDegraded();
  initTests(app);
  initRunner(app);
  initStatement(app);
  initNotes(app);
  initTimer(app);
  initHints(app);
  initWaReview(app);
  initSnippets(app);
  initCodeReview(app);
  initLab(app);
  initDashboard(app);
  initMiniChat(app);
  initSynthesizer(app);
  initEditorial(app); // must be AFTER initSynthesizer — wraps its refreshSynthAvail
  initContests(app);
  initDefense(app);        // wraps nothing; appends button to #ac-banner — before journey wraps syncMeta
  initJourney(app);        // wraps syncMeta/clearEditor — keep before palette
  initMistakeBook(app);    // defines app.openMistakeBook (palette + home use it)
  initFlashQuiz(app);      // defines app.openFlashQuiz
  initBoss(app);           // listens for journey:painted to fill the boss slot
  initVisualizer(app);     // 🔬 test-case visualizer (Run console + test cards)
  initSkillTree(app);      // 🗺️ skill constellation (journey home opens it)
  initCommandPalette(app); // places its trigger next to the journey chips
  await initSettings(app);
  initMetaModal();
  initShortcuts();
  initAiActivity();

  const btnGuide = document.getElementById("btn-guide");
  const guideModal = document.getElementById("guide-modal");
  const guideClose = document.getElementById("guide-close");
  if (btnGuide && guideModal && guideClose) {
    btnGuide.addEventListener("click", () => guideModal.classList.remove("hidden"));
    guideClose.addEventListener("click", () => guideModal.classList.add("hidden"));
    guideModal.addEventListener("click", (e) => {
      if (e.target === guideModal) guideModal.classList.add("hidden");
    });
  }

  // Zen Mode click
  if (app.el.btnZen) {
    app.el.btnZen.addEventListener("click", () => app.toggleZenMode());
  }

  // Shortcuts help click
  if (app.el.btnShortcutsHelp) {
    app.el.btnShortcutsHelp.addEventListener("click", () => {
      document.getElementById("shortcuts-modal")?.classList.remove("hidden");
    });
  }
  const btnShortcutsClose = document.getElementById("shortcuts-close");
  const shortcutsModal = document.getElementById("shortcuts-modal");
  if (btnShortcutsClose && shortcutsModal) {
    btnShortcutsClose.addEventListener("click", () => shortcutsModal.classList.add("hidden"));
    shortcutsModal.addEventListener("click", (e) => {
      if (e.target === shortcutsModal) shortcutsModal.classList.add("hidden");
    });
  }

  app.setTab("run");

  await app.refreshProblems();
  // Boot lands on the Journey home (streak / quests / continue card) instead of
  // auto-opening the last problem — one click on "Tiếp tục" resumes work.
  app.clearEditor();

  try {
    const health = await api.health();
    app.setCompilerPill(health.compiler);
  } catch { /* leave pill default */ }
}

boot();
