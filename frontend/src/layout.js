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

// Switch the center column between the code editor and the problem reader.
// The layout MODE follows the view: Code → Coding (editor-forward, full 3-col),
// Problem → Reading (statement-forward; the explorer collapses and the right
// panel narrows so the problem page gets a wide, comfortable reading measure).
export function setView(app, name) {
  name = name === "problem" ? "problem" : "code";
  app.state.activeView = name;

  const code = document.getElementById("view-code");
  const problem = document.getElementById("view-problem");
  if (code) code.classList.toggle("hidden", name !== "code");
  if (problem) problem.classList.toggle("hidden", name !== "problem");

  const mode = name === "problem" ? "reading" : "coding";
  app.state.layoutMode = mode;
  const wb = document.querySelector(".workbench");
  if (wb) {
    wb.classList.toggle("mode-reading", mode === "reading");
    wb.classList.toggle("mode-coding", mode === "coding");
  }
  const tg = document.getElementById("layout-mode-toggle");
  if (tg) tg.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}

// Coding / Reading layout mode — a thin wrapper over setView so a single
// control (and Ctrl+Shift+M) drives both the content and the column layout.
export function setLayoutMode(app, mode) {
  setView(app, mode === "reading" ? "problem" : "code");
}
