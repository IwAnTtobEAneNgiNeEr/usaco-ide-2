// main.js — bootstraps USACO IDE 2.0, owns shared state, and wires modules.

import { api } from "./api.js?v=3.0";
import { initLayout, setTab, setView, setLayoutMode, cycleLayoutMode, getSavedLayoutMode } from "./layout.js?v=2.5";
import { initProblems, renderProblems } from "./problems.js?v=2.6";
import { initEditor, renderMeta, setEditorFiles } from "./editor.js?v=2.3";
import { mountCmEditor } from "./editor-cm.js?v=2.4";
import { initTests, renderTests } from "./testcases.js?v=2.4";
import { initRunner, renderHistory } from "./runner.js?v=2.9";
import { initSettings } from "./settings.js?v=2.4";
import { initLanguage } from "./i18n.js?v=1.1";
import { initStatement, loadProblemView } from "./statement.js?v=3.3";
import { initTimer } from "./timer.js?v=2.5";
import { initHints } from "./hints.js?v=2.3";
import { initNotes } from "./notes.js?v=2.3";
import { initSidebarToggle } from "./features/sidebar-toggle.js?v=2.4";
import { initTopicFilter } from "./features/topic-filter.js?v=2.3";
import { initDesktopShell } from "./features/desktop-launcher.js?v=2.3";
import { initWaReview } from "./features/wa-review.js?v=2.4";
import { initGameReview } from "./features/game-review.js?v=3.1";
import { initMoment } from "./features/moment.js?v=2.9.1"; // supersedes verdict-rail's listener (chips live on inside the card)
import { initAnalysis } from "./features/analysis.js?v=1.2"; // "Phân tích code này" — evidence-based, Verified Artifact Loop P3
import { initDerivedModule } from "./features/derived-module.js?v=1.4"; // module workspace: problem-derived + standalone catalog + Route Planner
import { initFlashQuiz } from "./features/flash-quiz.js?v=1.3"; // câu hỏi = lỗi thật từ Student Model
import { initArena } from "./features/arena.js?v=1.5"; // ⚔ Luyện tập xếp hạng: HUD + match strip + app.arena helpers
import { initActivityWorkspace } from "./features/activity-workspace.js?v=1.8";
import { initRush } from "./features/rush.js?v=1.3";
import { initCorefill } from "./features/corefill.js?v=1.4";
import { initAutopsy } from "./features/autopsy.js?v=2.0";
import { initSnippets } from "./features/snippets.js?v=2.1";
import { initCodeReview } from "./features/code-review.js?v=2.5";
import { initLab } from "./features/lab.js?v=3.5";
import { initDashboard } from "./features/dashboard.js?v=2.4";
import { initMiniChat } from "./features/mini-chat.js?v=2.7";
import { initSynthesizer } from "./features/synthesizer.js?v=2.5";
import { initContests } from "./features/contests.js?v=3.2";
import { initXuong } from "./features/xuong.js?v=2.1.12";
import { initJourney } from "./features/journey.js?v=3.9";
import { initCommandPalette } from "./features/command-palette.js?v=2.7";
import { initMistakeBook } from "./features/mistake-book.js?v=2.5";
import { initBoss } from "./features/boss.js?v=2.3";
import { initDefense } from "./features/defense.js?v=2.4";
import { initVisualizer } from "./features/visualizer.js?v=2.4";
import { initSkillTree } from "./features/skilltree.js?v=2.4";
import { initSpj } from "./features/spj.js?v=2.5";
import { initWelcome } from "./features/welcome.js?v=2.4";
import { initOverflowMenus } from "./features/overflow-menu.js?v=2.3";
import { initEditorAppearance } from "./features/editor-appearance.js?v=2.4";
import { createBus } from "./core/bus.js";
import { initTelemetry } from "./core/telemetry.js?v=1.0"; // NCKH §5 A/B/C/D events — data/events.jsonl
import { initWorkspaces } from "./features/workspaces.js?v=1.1";
import { initPanelSignals, clearTabAttn } from "./features/panel-signals.js?v=1.0";

const $ = (id) => document.getElementById(id);

const app = {
  state: {
    problems: [],
    currentId: null,
    meta: null,
    settings: { autosave: true, autosaveDelayMs: 800, tabSize: 4, compareMode: "loose", timeMs: 2000 },
    activeTab: "run",
    tabRevision: 0,
    activeView: "code",
    dirty: false,
    filters: { search: "", track: "", source: "", status: "", difficulty: "", topics: [] },
    tests: [],
    openTests: new Set(),
    testResults: {},
    savedCode: "", savedInput: "", savedExpected: "", savedNotes: "", savedStatement: "",
    editingMeta: null,
    aiSettings: null,
    aiTests: [],
    showIllustration: false
  },
  el: {}
};

// Event bus — the spine the Workspace orchestrator + panel-signals ride on.
app.bus = createBus();

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
    statementRendered: $("statement-rendered"),
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
app.setTab = (name) => { app.state.tabRevision += 1; clearTabAttn(name); setTab(app, name); };
app.setView = (name) => setView(app, name);
app.setLayoutMode = (m) => setLayoutMode(app, m);
app.toggleLayoutMode = () => cycleLayoutMode(app);
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
  // Workspace notification policy: errors always show; "off" suppresses all
  // non-errors; "minimal" suppresses plain info (keeps "ok" + "err").
  const notif = (app.workspace && app.workspace.policy && app.workspace.policy.notifications) || "normal";
  if (type !== "err") {
    if (notif === "off") return;
    if (notif === "minimal" && type !== "ok") return;
  }
  const host = $("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  el.title = "Bấm để đóng";
  el.style.cursor = "pointer";
  el.addEventListener("click", () => el.remove());
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
  app.state.canvasScene = null;
  app.state.showIllustration = false;
  app.el.editorShell.classList.add("hidden");
  app.el.editorEmpty.classList.remove("hidden");
  app.el.currentTitle.textContent = "Chưa chọn bài";
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
    // One bundled request (meta + files + tests) instead of seven.
    const { problem, code, input, expected, notes, statement, statementEn, statementVi, tests } = await api.getWorkspace(id);
    app.state.currentId = id;
    app.state.meta = problem;
    app.state.canvasScene = null;
    app.state.showIllustration = false;
    app.state.tests = tests;
    app.state.openTests = new Set();
    app.state.testResults = {};
    app.state.lastJudge = null; // stale verdicts belong to the previous problem
    app.bus && app.bus.emit("problem:opened", { id });

    app.el.editorEmpty.classList.add("hidden");
    app.el.editorShell.classList.remove("hidden");
    app.el.btnRun.disabled = false;
    app.el.btnJudge.disabled = false;

    // Restore the student's preferred layout (Code / Đề + Code / Đề bài) so they
    // don't have to re-pick Split every time they open a problem.
    setLayoutMode(app, getSavedLayoutMode());
    renderMeta(app);
    setEditorFiles(app, { code, input, expected, notes, statement });
    app.setStatementVariants?.({ statement, statementEn, statementVi, sourceLanguage: problem.statementSourceLanguage });
    app.state.activeStatementLanguage = app.state.statementVariants?.sourceLanguage;
    app.el.ioStatement.value = app.getSourceStatement?.() ?? statement;
    app.state.savedStatement = app.el.ioStatement.value;
    renderTests(app);
    renderHistory(app);
    loadProblemView(app);
    // On open, a statement follows the saved UI language unless the learner
    // explicitly chose to keep its original language.
    await app.applyStatementLanguage?.();
    app.el.statementStatus.innerHTML = "Dán ảnh (Ctrl+V), tải ảnh/PDF, hoặc gõ đề bài — AI sẽ tự phân tích &amp; tạo test.";
    resetOutput();
    if (app.refreshWaReview) app.refreshWaReview();
    if (app.refreshChat) app.refreshChat();
    if (app.refreshSynthAvail) app.refreshSynthAvail();
    renderProblems(app);
    // Remember the last problem so the next launch reopens it (startup = editor).
    try { localStorage.setItem("usaco2.lastProblem", id); } catch { /* private mode */ }
  } catch (err) {
    app.toast(err.message, "err");
  }
};

app.reloadTests = async () => {
  if (!app.state.currentId) return;
  try {
    const { tests } = await api.listTests(app.state.currentId);
    app.state.tests = tests;
      app.invalidateJudge?.();
    renderTests(app);
      await app.syncMeta();
  } catch (err) { app.toast(err.message, "err"); }
};

app.syncMeta = async () => {
  if (!app.state.currentId) return;
  try {
    const id = app.state.currentId;
    const { problem } = await api.getProblem(id);
    if (app.state.currentId !== id) return;
    if (app.state.meta?.truth?.judgeFingerprint !== problem.truth?.judgeFingerprint) app.invalidateJudge?.();
    app.state.meta = problem;
    renderMeta(app);
    renderHistory(app);
    if (app.refreshWaReview) app.refreshWaReview();
    if (app.refreshSynthAvail) app.refreshSynthAvail();
    if (app.refreshCoachActions) app.refreshCoachActions();
    await app.refreshProblems();
  } catch { /* non-fatal */ }
};

// Clear transient verdict paint as soon as judge inputs change. Historical
// attempts remain in the timeline; saved current status comes from the server.
app.invalidateJudge = () => {
  app.state.testResults = {};
  app.state.lastJudge = null;
  renderTests(app);
  renderMeta(app);
  const badge = app.el.outputVerdict;
  if (badge) { badge.textContent = "STALE"; badge.className = "vbadge"; }
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
  if (form.usesChecker) form.usesChecker.checked = meta ? Boolean(meta.usesChecker) : false;
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
      usesChecker: !!(f.usesChecker && f.usesChecker.checked),
      timeLimitMs: Number(f.timeLimitMs && f.timeLimitMs.value) || 0
    };
    if (!data.title) return;
    try {
      if (app.state.editingMeta) {
        const { problem } = await api.updateProblem(app.state.editingMeta.id, data);
        app.state.meta = problem;
        renderMeta(app);
          await app.syncMeta();
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
    btn.classList.toggle("btn-ghost", !isZen);
    btn.textContent = isZen ? "Zen ON" : "Zen";
  }
};

// ---------------- Sound Player (Web Audio API synthesis) ----------------
app.playSound = (type) => {
  if (app.workspace && app.workspace.policy && app.workspace.policy.sounds === false) return;
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
  theme = "dark"; // Force dark theme globally, completely deleting light mode
  accentColor = accentColor || "amber";

  // Apply theme class (always dark, no light-theme class)
  document.documentElement.classList.remove("light-theme");

  // Accent palette — one calm color per choice. No gradients: --accent-grad
  // resolves to a solid so the feature CSS that references it stays flat.
  // primary = base accent, strong = solid button fill, strongH = button hover.
  const accents = {
    // amber-gold — the Forge identity accent and product default. strong = solid
    // button fill that carries dark text (--on-accent); strongH = brighter hover.
    amber: {
      dark:  { primary: "#e6a93e", strong: "#e0a338", strongH: "#f4be59", soft: "rgba(230, 169, 62, 0.13)" },
      light: { primary: "#b5791c", strong: "#a96f16", strongH: "#915f12", soft: "rgba(181, 121, 28, 0.10)" }
    },
    blue: {
      dark:  { primary: "#3b82f6", strong: "#2563eb", strongH: "#1d4ed8", soft: "rgba(59, 130, 246, 0.13)" },
      light: { primary: "#2563eb", strong: "#1d4ed8", strongH: "#1e40af", soft: "rgba(37, 99, 235, 0.10)" }
    },
    green: {
      dark:  { primary: "#22c55e", strong: "#16a34a", strongH: "#15803d", soft: "rgba(34, 197, 94, 0.13)" },
      light: { primary: "#16a34a", strong: "#15803d", strongH: "#166534", soft: "rgba(22, 163, 74, 0.10)" }
    },
    orange: {
      dark:  { primary: "#f97316", strong: "#ea580c", strongH: "#c2410c", soft: "rgba(249, 115, 22, 0.13)" },
      light: { primary: "#ea580c", strong: "#c2410c", strongH: "#9a3412", soft: "rgba(234, 88, 12, 0.10)" }
    },
    purple: {
      dark:  { primary: "#a78bfa", strong: "#8b5cf6", strongH: "#7c3aed", soft: "rgba(167, 139, 250, 0.14)" },
      light: { primary: "#8b5cf6", strong: "#7c3aed", strongH: "#6d28d9", soft: "rgba(139, 92, 246, 0.10)" }
    },
    red: {
      dark:  { primary: "#f87171", strong: "#ef4444", strongH: "#dc2626", soft: "rgba(248, 113, 113, 0.13)" },
      light: { primary: "#dc2626", strong: "#b91c1c", strongH: "#991b1b", soft: "rgba(220, 38, 38, 0.10)" }
    }
  };

  const choice = accents[accentColor] || accents.amber;
  const colors = choice[theme] || choice.dark;
  const root = document.documentElement.style;
  root.setProperty("--primary", colors.primary);
  root.setProperty("--primary-strong", colors.strong);
  root.setProperty("--primary-soft", colors.soft);
  root.setProperty("--accent", colors.primary);
  root.setProperty("--accent-strong", colors.strong);
  root.setProperty("--accent-soft", colors.soft);
  root.setProperty("--accent-grad", colors.primary);  // solid — no gradient
  root.setProperty("--btn-primary", colors.strong);
  root.setProperty("--btn-primary-h", colors.strongH);
  root.setProperty("--btn-run", colors.strong);
  root.setProperty("--btn-run-h", colors.strongH);
  if (app.applyEditorAppearance) app.applyEditorAppearance();
};

// ---------------- Global drop guard ----------------
// The app invites file drag-drop (tests import, statement images). A drop that
// misses its zone must be a no-op — by default the browser NAVIGATES to the
// file and unloads the whole IDE. Zone handlers run first (bubble order) and
// preventDefault themselves; this only neutralizes the misses.
function initDropGuard() {
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}

// ---------------- Background animation throttle ----------------
// Pause every running CSS animation while the tab is hidden (forge.css keys off
// html.tab-hidden). The home's infinite shimmer/flame/xp-bar loops otherwise
// keep repainting off-screen during a long focus timer — a pure battery drain.
function initAnimationThrottle() {
  const sync = () => document.documentElement.classList.toggle("tab-hidden", document.hidden);
  document.addEventListener("visibilitychange", sync);
  sync();
}

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

    // Alt+W widens the Coach into a reading column (focus mode)
    if (e.altKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (app.toggleCoachFocus) app.toggleCoachFocus();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    // With a modal open, Run/Judge/New would act invisibly behind it — ignore
    // them (Ctrl+S still saves; it's harmless and a reflex).
    const modalOpen = !!document.querySelector(".modal-overlay:not(.hidden)");
    if (e.key.toLowerCase() === "e" && e.shiftKey) { e.preventDefault(); if (app.coachAskSelection) app.coachAskSelection(); }
    else if (e.key.toLowerCase() === "m" && e.shiftKey) { e.preventDefault(); if (app.toggleLayoutMode) app.toggleLayoutMode(); }
    else if (e.key.toLowerCase() === "s") { e.preventDefault(); if (app.saveCodeNow) app.saveCodeNow(); }
    else if (e.key === "Enter" && e.shiftKey) { if (modalOpen) return; e.preventDefault(); if (app.judgeAll) app.judgeAll(); }
    else if (e.key === "Enter") { if (modalOpen) return; e.preventDefault(); if (app.runOne) app.runOne(); }
    else if (e.key.toLowerCase() === "n") { if (modalOpen) return; e.preventDefault(); app.openMetaModal(null); }
    else if (e.key === ";") { e.preventDefault(); if (app.focusCoachInput) app.focusCoachInput(); }
  });
}

// ---------------- Cursor Tracking Glow Overlay ----------------
let mouseGlowStarted = false;
function initMouseGlow() {
  if (mouseGlowStarted) return;
  mouseGlowStarted = true;
  document.addEventListener("mousemove", (e) => {
    const target = e.target.closest(".coach-card-sec, .stmt-section, .prob-item, .analysis-card, .examples-card, .gentests-card, .console-block, .settings-card, .code-stack, .neon-ai-analysis-container, .aw-tool-context, .aw-toolguide-rail, .aw-console-ready, .aw-controls, .aw-output-block, .aw-tests, .aw-live-log");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty("--mouse-x", `${x}px`);
    target.style.setProperty("--mouse-y", `${y}px`);
  });
}

function initGlobalParticles(app) {
  let backdrop = document.getElementById("global-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "global-backdrop";
    backdrop.style.cssText = "position:fixed; inset:0; z-index:0; background:var(--bg); pointer-events:none;";
    document.body.appendChild(backdrop);
  }

  let canvas = document.getElementById("global-particles-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "global-particles-canvas";
    canvas.style.cssText = "position:fixed; inset:0; z-index:1; pointer-events:none; display:block; background:transparent;";
    document.body.appendChild(canvas);
  }

  const ctx = canvas.getContext("2d");
  let animationFrameId = null;
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const maxParticles = 380; // High-density premium starry sky
  
  // Premium analogous space/cyan-violet palette (no childish rainbow elements)
  const colors = [
    "rgba(0, 229, 255, 0.85)",   // Neon Cyan
    "rgba(56, 189, 248, 0.85)",  // Sky Blue
    "rgba(99, 102, 241, 0.85)",  // Indigo Blue
    "rgba(167, 139, 250, 0.8)",  // Soft Violet
    "rgba(224, 242, 254, 0.75)"  // Glass White / Ice shine
  ];

  let mouseX = null;
  let mouseY = null;
  let isMouseDown = false;
  let lastMouseX = null;
  let lastMouseY = null;
  let mouseVelocity = 0;
  
  // Click Wave shockwave object (Animation 1)
  let clickShockwave = { x: 0, y: 0, radius: 0, maxRadius: 180, active: false };
  const temporarySparks = [];

  class Particle {
    constructor() {
      // 3 types: "dust" (60%), "comet" (30%), "meteor" (10%) for depth-of-field starry sky
      const rand = Math.random();
      if (rand < 0.6) this.type = "dust";
      else if (rand < 0.9) this.type = "comet";
      else this.type = "meteor";

      this.reset(true);
    }

    reset(init = false) {
      this.x = Math.random() * width;
      this.y = (init || Math.random() < 0.3) ? Math.random() * height : height + 25;
      
      if (this.type === "dust") {
        this.size = Math.random() * 2 + 1; // Tiny twinkles
        this.width = Math.random() * 0.4 + 0.3;
        this.baseSpeedY = -(Math.random() * 0.15 + 0.15); // Very slow drift
      } else if (this.type === "comet") {
        this.size = Math.random() * 10 + 8; // Medium comets
        this.width = Math.random() * 0.6 + 0.4;
        this.baseSpeedY = -(Math.random() * 0.3 + 0.4);
      } else {
        this.size = Math.random() * 18 + 16; // Large glowing meteors
        this.width = Math.random() * 0.8 + 0.8;
        this.baseSpeedY = -(Math.random() * 0.5 + 0.8);
      }

      this.vx = 0;
      this.vy = 0;
      this.phase = Math.random() * Math.PI * 2;
      this.twinkleSpeed = Math.random() * 0.003 + 0.0015;
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update(mouseX, mouseY) {
      // 1. Natural organic drift
      const baseVx = Math.sin(this.y * 0.012 + this.phase) * 0.3;
      const baseVy = this.baseSpeedY;

      // 2. Click Shockwave push interaction (Animation 1)
      if (clickShockwave.active) {
        const sDx = this.x - clickShockwave.x;
        const sDy = this.y - clickShockwave.y;
        const sDist = Math.sqrt(sDx * sDx + sDy * sDy);
        if (sDist < clickShockwave.radius && sDist > clickShockwave.radius - 40) {
          const pushForce = (1 - (clickShockwave.radius - sDist) / 40) * 4.5;
          const angle = Math.atan2(sDy, sDx);
          this.vx += Math.cos(angle) * pushForce;
          this.vy += Math.sin(angle) * pushForce;
        }
      }

      // 3. Mouse attraction forces
      if (mouseX !== null && mouseY !== null) {
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 260) {
          const force = (260 - dist) / 260;
          const attractX = dx / (dist + 0.1);
          const attractY = dy / (dist + 0.1);

          if (isMouseDown) {
            // Animation 2: Mouse Click & Hold - Vortex Blackhole Gravity
            // Strong attraction directly to the cursor, twisting tightly
            const swirlX = -dy / (dist + 0.1);
            const swirlY = dx / (dist + 0.1);
            
            this.vx += (attractX * 0.65 + swirlX * 0.35) * force * 2.8;
            this.vy += (attractY * 0.65 + swirlY * 0.35) * force * 2.8;
            
            if (dist < 30) {
              this.vx *= 0.85;
              this.vy *= 0.85;
            }
          } else {
            // Standard Hover behavior: Swirling orbital rings
            const swirlX = -dy / (dist + 0.1);
            const swirlY = dx / (dist + 0.1);
            
            const vortexX = swirlX * 0.85 + attractX * 0.15;
            const vortexY = swirlY * 0.85 + attractY * 0.15;

            this.vx += vortexX * force * 0.85;
            this.vy += vortexY * force * 0.85;

            // Repelling boundary at dist < 85px to create a halo ring
            if (dist < 85) {
              const pushForce = (85 - dist) / 85;
              this.vx -= attractX * pushForce * 1.6;
              this.vy -= attractY * pushForce * 1.6;
            }
          }

          // Animation 3: Cursor Heat Wave (Speed Excitation)
          if (mouseVelocity > 6 && dist < 140) {
            const speedExcitation = (mouseVelocity - 6) * 0.08;
            this.vx += (Math.random() - 0.5) * speedExcitation * 3;
            this.vy += (Math.random() - 0.5) * speedExcitation * 3;
          }
        }
      }

      // Apply drag to velocities
      this.vx *= 0.94;
      this.vy *= 0.94;

      // Clamp speed
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const maxSpeed = this.type === "meteor" ? 4.5 : (this.type === "comet" ? 3.6 : 1.8);
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }

      // Move particle
      this.x += this.vx + baseVx;
      this.y += this.vy + baseVy;

      // Reset when particle goes off screen
      if (this.y < -30 || this.x < -30 || this.x > width + 30 || this.y > height + 30) {
        this.reset(false);
      }
    }

    draw(mouseX, mouseY) {
      let alpha = 0.45 + Math.sin(this.phase + Date.now() * this.twinkleSpeed) * 0.35;

      if (mouseX !== null && mouseY !== null) {
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          alpha += (140 - dist) / 140 * 0.45;
          if (isMouseDown) alpha += 0.2;
        }
      }
      ctx.globalAlpha = Math.max(0.08, Math.min(1.0, alpha));

      if (this.type === "dust") {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      } else {
        const baseVx = Math.sin(this.y * 0.012 + this.phase) * 0.3;
        const baseVy = this.baseSpeedY;
        const speedX = this.vx + baseVx;
        const speedY = this.vy + baseVy;
        const angle = Math.atan2(speedY, speedX);

        const headX = this.x;
        const headY = this.y;
        
        const speedLen = Math.sqrt(speedX * speedX + speedY * speedY);
        const dynamicSize = this.size * (1 + speedLen * 0.25);
        
        const tailX = this.x - Math.cos(angle) * dynamicSize;
        const tailY = this.y - Math.sin(angle) * dynamicSize;

        // Draw glowing head core (Animation 4: Multi-layered glowing heads)
        ctx.beginPath();
        ctx.arc(headX, headY, this.width * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        if (this.type === "meteor") {
          ctx.beginPath();
          ctx.arc(headX, headY, this.width * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = this.color.replace("0.85", "0.2").replace("0.8", "0.2").replace("0.75", "0.2");
          ctx.fill();
        }

        // Draw faded gradient tail
        const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.moveTo(headX, headY);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = this.width;
        ctx.lineCap = "round";
        ctx.stroke();

        // Draw micro-sparks along the tail
        if (this.type === "meteor" || (this.type === "comet" && this.phase % 4 < 1)) {
          ctx.beginPath();
          const midX = headX - (tailX - headX) * 0.35;
          const midY = headY - (tailY - headY) * 0.35;
          ctx.arc(midX, midY, 0.7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
          ctx.fill();
        }
      }
    }
  }

  // Populate particles
  for (let i = 0; i < maxParticles; i++) {
    particles.push(new Particle());
  }

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    if (lastMouseX !== null && lastMouseY !== null) {
      const dx = mouseX - lastMouseX;
      const dy = mouseY - lastMouseY;
      mouseVelocity = Math.sqrt(dx * dx + dy * dy);
    }
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("input, textarea, button, .cm-editor, a, #btn-deactivate-visualizer")) return;
    isMouseDown = true;
  });

  document.addEventListener("mouseup", () => {
    isMouseDown = false;
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("input, textarea, button, .cm-editor, a")) return;
    
    clickShockwave = {
      x: e.clientX,
      y: e.clientY,
      radius: 0,
      maxRadius: 180,
      active: true
    };

    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 2.5;
      temporarySparks.push({
        x: e.clientX,
        y: e.clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: Math.random() * 0.035 + 0.02,
        size: Math.random() * 1.6 + 0.8
      });
    }
  });

  document.addEventListener("mouseleave", () => {
    mouseX = null;
    mouseY = null;
    isMouseDown = false;
    lastMouseX = null;
    lastMouseY = null;
    mouseVelocity = 0;
  });

  function animate() {
    if (app.state.settings && app.state.settings.enableParticles === false) {
      canvas.style.setProperty("display", "none", "important");
      backdrop.style.setProperty("display", "none", "important");
      animationFrameId = null;
      return;
    }

    ctx.clearRect(0, 0, width, height);
    canvas.style.setProperty("display", "block", "important");
    backdrop.style.setProperty("display", "block", "important");
    
    ctx.globalCompositeOperation = "screen";

    if (clickShockwave.active) {
      clickShockwave.radius += 10;
      if (clickShockwave.radius > clickShockwave.maxRadius) {
        clickShockwave.active = false;
      }
    }

    // Animation 4: Draw thin glowing Constellation lines between particles near the mouse
    if (mouseX !== null && mouseY !== null) {
      const mouseRange = 120;
      const connectionRange = 46;
      
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        const mDx = mouseX - p1.x;
        const mDy = mouseY - p1.y;
        const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
        
        if (mDist < mouseRange) {
          let connectionsCount = 0;
          for (let j = i + 1; j < particles.length; j++) {
            if (connectionsCount >= 3) break;
            
            const p2 = particles[j];
            const pDx = p2.x - p1.x;
            const pDy = p2.y - p1.y;
            const pDist = Math.sqrt(pDx * pDx + pDy * pDy);

            if (pDist < connectionRange) {
              const alpha = 0.08 * (1 - pDist / connectionRange) * (1 - mDist / mouseRange);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(147, 197, 253, ${alpha})`;
              ctx.lineWidth = 0.45;
              ctx.stroke();
              connectionsCount++;
            }
          }
        }
      }
    }

    for (let i = 0; i < particles.length; i++) {
      particles[i].update(mouseX, mouseY);
      particles[i].draw(mouseX, mouseY);
    }

    for (let i = temporarySparks.length - 1; i >= 0; i--) {
      const sp = temporarySparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vx *= 0.96;
      sp.vy *= 0.96;
      sp.life -= sp.decay;
      if (sp.life <= 0) {
        temporarySparks.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fillStyle = sp.color;
      ctx.globalAlpha = sp.life;
      ctx.shadowBlur = 6;
      ctx.shadowColor = sp.color;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    mouseVelocity *= 0.9;

    ctx.globalCompositeOperation = "source-over";
    animationFrameId = requestAnimationFrame(animate);
  }

  // Settings may enable this for the current session.
  app.toggleGlobalParticles = (enable) => {
    if (enable) {
      canvas.style.removeProperty("display");
      backdrop.style.removeProperty("display");
      initMouseGlow();
      if (!animationFrameId) {
        animate();
      }
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      ctx.clearRect(0, 0, width, height);
      canvas.style.setProperty("display", "none", "important");
      backdrop.style.setProperty("display", "none", "important");
    }
  };

  // Decorative motion is off until settings finishes loading.
  app.toggleGlobalParticles(false);
}

// ---------------- Boot ----------------
async function boot() {
  const tabRevisionAtStart = app.state.tabRevision;
  collectRefs();

  try {
    const { settings } = await api.getSettings();
    app.state.settings = settings;
  } catch { /* defaults stand */ }
  app.applyTheme(app.state.settings.theme, app.state.settings.accentColor);
  initGlobalParticles(app);

  initTelemetry(app);   // sends session_start immediately — must init before any other bus listener fires
  initLayout(app);
  initProblems(app);
  initDesktopShell();
  initSidebarToggle(app);
  initTopicFilter(app);
  initEditor(app);
  // CodeMirror 6 — try to mount; falls back to textarea automatically. We only
  // surface a marker when it DEGRADES to the plain textarea (silent when healthy).
  let cmOk = false;
  try { cmOk = await mountCmEditor(app); } catch (e) { console.warn("[boot] CM mount failed, using textarea:", e); }
  if (!cmOk) markEditorDegraded();
  initTests(app);
  initRunner(app);
  initSpj(app); // ⚖️ special-judge (checker.cpp) editor — appends to the Tests toolbar
  initStatement(app);
  initLanguage(app);
  initNotes(app);
  initTimer(app);
  initHints(app);
  initWaReview(app);
  initGameReview(app);
  initAutopsy(app);     // defines app.openAutopsy — must init before the moment card uses it
  initFlashQuiz(app);   // defines app.openFlashQuiz — planner CTA + Journey plan card open it
  initAnalysis(app);    // defines app.openCodeAnalysis — must init before the moment card offers the chip
  initDerivedModule(app); // defines app.openDerivedModule — must init before the moment card offers the chip
  initMoment(app);      // Khoảnh Khắc autopilot — owns the #verdict-rail slot (bus "verdict"/"problem:opened"/"timer:done")
  initActivityWorkspace(app); // one canonical editor/statement/result surface for every code-bearing mini-topic
  initSnippets(app);
  initCodeReview(app);
  initLab(app);
  initDashboard(app);
  initMiniChat(app);
  initSynthesizer(app);    // defines app.refreshSynthAvail; toggles the toolbar 📈 button
  // NCKH §9 — ĐÓNG BĂNG: Contest mode không gọi trong giai đoạn thu số liệu
  // initContests(app);
  initDefense(app);        // wraps refreshSynthAvail to toggle the 🎓 toolbar button — after initSynthesizer
  initXuong(app);          // Xưởng (Build surface) — defines app.xuong before journey mounts its view
  initJourney(app);        // wraps syncMeta/clearEditor — keep before palette
  // NCKH §9 — ĐÓNG BĂNG: Arena + Rush không gọi trong giai đoạn thu số liệu
  // initArena(app);
  // initRush(app);
  initCorefill(app);       // adapter into the canonical activity workspace
  initMistakeBook(app);    // defines app.openMistakeBook (palette + home use it)
  // NCKH §9 — ĐÓNG BĂNG: Boss không gọi trong giai đoạn thu số liệu
  // initBoss(app);
  initVisualizer(app);     // 🔬 test-case visualizer (Run console + test cards)
  initSkillTree(app);      // 🗺️ skill constellation (journey home opens it)
  initCommandPalette(app); // places its trigger next to the journey chips
  initEditorAppearance(app); // applies saved fonts/theme/colors live; settings renders its UI
  await initSettings(app);
  app.toggleGlobalParticles(true);
  initMetaModal();
  initShortcuts();
  initDropGuard();
  initAnimationThrottle();
  initAiActivity();
  initOverflowMenus();   // topbar "⋯ More" + editor "Tools ▾" dropdowns

  const btnRush = document.getElementById("btn-rush");
  if (btnRush) btnRush.addEventListener("click", () => app.openRush && app.openRush());

  const btnCorefill = document.getElementById("btn-corefill");
  if (btnCorefill) btnCorefill.addEventListener("click", () => app.openCorefill && app.openCorefill());

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

  // Restore the last panel tab the student was using (never auto-land on Settings).
  let initialTab = "run";
  try {
    const saved = localStorage.getItem("usaco2.activeTab");
    if (saved && ["run", "tests", "notes", "coach", "history"].includes(saved)) initialTab = saved;
  } catch { /* private mode */ }
  // Once navigation has happened, an older bootstrap restore has no authority
  // to replace it, including while settings/editor setup is still pending.
  const restoreTab = app.state.tabRevision === tabRevisionAtStart;
  if (restoreTab) app.setTab(initialTab);
  const restoredTabRevision = app.state.tabRevision;

  await app.refreshProblems();
  // Startup goes straight to the editor — reopen the last problem (or the most
  // recently updated one) so power users land on code, not a dashboard. The
  // Journey home stays one click away via the 🏠 chip. Only a truly empty
  // workspace falls through to the home/onboarding state.
  {
    const list = app.state.problems || [];
    let target = null;
    try {
      const lastId = localStorage.getItem("usaco2.lastProblem");
      if (lastId && list.some((p) => p.id === lastId)) target = lastId;
    } catch { /* private mode */ }
    if (!target && list.length) target = list[0].id; // list is updatedAt-desc
    if (target) await app.loadProblem(target);
    else app.clearEditor();
  }

  // Workspace environment — restore the saved workspace and apply it as the
  // authoritative layout/behaviour layer (runs after loadProblem on purpose).
  initWorkspaces(app, { preserveTab: !restoreTab || app.state.tabRevision !== restoredTabRevision });
  initPanelSignals(app);

  try {
    const health = await api.health();
    app.setCompilerPill(health.compiler);
  } catch { /* leave pill default */ }

  // First-run welcome/setup (shows once; reads the health + AI-key state).
  initWelcome(app);
}

boot();
