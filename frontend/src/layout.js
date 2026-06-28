// layout.js — right-panel tab switching, center Code/Problem view switching,
// and modal helpers.

export function initLayout(app) {
  const tabs = app.el.panelTabs.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => app.setTab(tab.dataset.tab));
  });

  // Center column: Coding / Reading layout-mode segmented toggle.
  const modeToggle = document.getElementById("layout-mode-toggle");
  if (modeToggle) {
    modeToggle.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => setLayoutMode(app, btn.dataset.mode));
    });
  }

  // Coach width controls: a draggable panel edge + an expand (focus) toggle.
  initPanelResize(app);
  // Split (Đề + Code) mode: draggable divider between the two center panes.
  initSplitResize(app);
  const expandBtn = document.getElementById("coach-expand");
  if (expandBtn) {
    expandBtn.addEventListener("click", () => app.toggleCoachFocus());
  }
  // Exposed for the keyboard shortcut (Alt+W) and the command palette.
  app.toggleCoachFocus = () => {
    const wb = document.querySelector(".workbench");
    const turningOn = !(wb && wb.classList.contains("coach-focus"));
    if (turningOn) app.setTab("coach");
    setCoachFocus(turningOn);
  };

  // Close the metadata modal on overlay click / Escape.
  app.el.metaModal.addEventListener("click", (e) => {
    if (e.target === app.el.metaModal) app.closeMetaModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !app.el.metaModal.classList.contains("hidden")) {
      app.closeMetaModal();
    }
  });
}

// Activate a right-panel tab + matching body.
export function setTab(app, name) {
  app.state.activeTab = name;
  try { localStorage.setItem("usaco2.activeTab", name); } catch { /* private mode */ }
  app.el.panelTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".panel-body").forEach((body) => {
    body.classList.toggle("hidden", body.dataset.panel !== name);
  });
  // Focus mode is a Coach reading state; leaving the Coach tab restores layout.
  if (name !== "coach") setCoachFocus(false);
  if (app.bus) app.bus.emit("layout:changed", { source: "tab", tab: name });
}

// Expand the Coach into a wide reading column (explorer collapses, editor stays
// visible). The grid transition is suppressed across the toggle to avoid the
// Chromium bug where a clamp()/vw grid track never settles after interpolation.
function setCoachFocus(on) {
  const wb = document.querySelector(".workbench");
  if (!wb) return;
  on = Boolean(on);
  if (wb.classList.contains("coach-focus") === on) return; // no-op
  const prev = wb.style.transition;
  wb.style.transition = "none";
  wb.classList.toggle("coach-focus", on);
  void wb.offsetWidth; // force reflow → settle immediately
  wb.style.transition = prev;
  const btn = document.getElementById("coach-expand");
  if (btn) {
    btn.classList.toggle("active", on);
    btn.textContent = on ? "⤡" : "⤢";
    btn.title = on ? "Thu nhỏ khung Coach" : "Mở rộng để đọc (phóng to khung Coach)";
  }
}

// Draggable right-panel width. The handle sets an inline --panel-w on .workbench
// (which overrides every stylesheet default, including the responsive ones) and
// persists it. Double-click resets to the responsive default.
function initPanelResize(app) {
  const wb = document.querySelector(".workbench");
  const handle = document.getElementById("panel-resizer");
  if (!wb || !handle) return;
  const KEY = "usaco2.panelW";
  const clampW = (w) => Math.max(360, Math.min(w, Math.min(window.innerWidth * 0.62, 980)));

  const saved = parseInt(localStorage.getItem(KEY) || "", 10);
  if (saved >= 360 && saved <= 1100) wb.style.setProperty("--panel-w", saved + "px");

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    wb.style.setProperty("--panel-w", clampW(window.innerWidth - e.clientX) + "px");
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("col-resizing");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    const w = parseInt(wb.style.getPropertyValue("--panel-w"), 10);
    if (w) localStorage.setItem(KEY, String(w));
  };
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    document.body.classList.add("col-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  const reset = () => { wb.style.removeProperty("--panel-w"); localStorage.removeItem(KEY); };
  handle.addEventListener("dblclick", reset);
  app.resetPanelWidth = reset;
}

// Three layout modes drive both WHAT the center column shows and HOW the
// workbench columns are sized:
//   coding  — editor-forward, full 3-col (explorer | editor | judge)
//   reading — statement-forward; explorer collapses, panel narrows, wide measure
//   split   — Đề + Code side by side in the center so the student reads the
//             statement WHILE coding, without toggling Code ⇄ Đề bài repeatedly
const LAYOUT_MODES = ["coding", "split", "reading"];
const LAYOUT_KEY = "usaco2.layoutMode";

export function getSavedLayoutMode() {
  let m = "coding";
  try { m = localStorage.getItem(LAYOUT_KEY) || "coding"; } catch { /* private mode */ }
  return LAYOUT_MODES.includes(m) ? m : "coding";
}

// Single source of truth for the layout. Manages the visible view(s), the
// workbench mode classes, the segmented toggle, persistence, and a CM re-measure
// for editors that were just un-hidden from display:none.
export function setLayoutMode(app, mode) {
  if (!LAYOUT_MODES.includes(mode)) mode = "coding";
  app.state.layoutMode = mode;
  // activeView mirrors the dominant content so palette / older callers stay valid.
  app.state.activeView = mode === "reading" ? "problem" : "code";
  try { localStorage.setItem(LAYOUT_KEY, mode); } catch { /* private mode */ }

  const code = document.getElementById("view-code");
  const problem = document.getElementById("view-problem");
  // In split, BOTH panes are visible; otherwise only the active one.
  if (code) code.classList.toggle("hidden", mode === "reading");
  if (problem) problem.classList.toggle("hidden", mode === "coding");

  const wb = document.querySelector(".workbench");
  if (wb) {
    wb.classList.toggle("mode-coding", mode === "coding");
    wb.classList.toggle("mode-split", mode === "split");
    wb.classList.toggle("mode-reading", mode === "reading");
  }
  const tg = document.getElementById("layout-mode-toggle");
  if (tg) tg.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

  // The editor may have been display:none (reading mode). CodeMirror measures
  // lazily, so nudge it to recompute its viewport now that it is on screen.
  if (mode !== "reading" && app.editorView && typeof app.editorView.requestMeasure === "function") {
    requestAnimationFrame(() => { try { app.editorView.requestMeasure(); } catch { /* ignore */ } });
  }
  if (app.bus) app.bus.emit("layout:changed", { source: "layout", mode });
}

// Back-compat view switch (command palette, problem-open). "problem" → reading,
// "code" → coding. Split is reachable only via the toggle / Ctrl+Shift+M cycle.
export function setView(app, name) {
  setLayoutMode(app, name === "problem" ? "reading" : "coding");
}

// Ctrl+Shift+M cycles coding → split → reading → coding.
export function cycleLayoutMode(app) {
  const i = LAYOUT_MODES.indexOf(app.state.layoutMode || "coding");
  setLayoutMode(app, LAYOUT_MODES[(i + 1) % LAYOUT_MODES.length]);
}

// Draggable divider between the problem pane and the editor pane in Split mode.
// Sets an inline --split-pw (problem-pane width) on #editor-shell that the
// split grid reads; persists it; double-click resets to the default ratio.
function initSplitResize(app) {
  const shell = document.getElementById("editor-shell");
  const handle = document.getElementById("split-resizer");
  if (!shell || !handle) return;
  const KEY = "usaco2.splitPw";

  const saved = parseInt(localStorage.getItem(KEY) || "", 10);
  if (saved >= 240 && saved <= 1200) shell.style.setProperty("--split-pw", saved + "px");

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = shell.getBoundingClientRect();
    // Keep both panes usable: ≥240px for the statement, ≥300px for the editor.
    const w = Math.max(240, Math.min(e.clientX - rect.left, rect.width - 300));
    shell.style.setProperty("--split-pw", w + "px");
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("col-resizing");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    const w = parseInt(shell.style.getPropertyValue("--split-pw"), 10);
    if (w) { try { localStorage.setItem(KEY, String(w)); } catch { /* ignore */ } }
    if (app.editorView && app.editorView.requestMeasure) {
      try { app.editorView.requestMeasure(); } catch { /* ignore */ }
    }
  };
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    document.body.classList.add("col-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  handle.addEventListener("dblclick", () => {
    shell.style.removeProperty("--split-pw");
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  });
}
