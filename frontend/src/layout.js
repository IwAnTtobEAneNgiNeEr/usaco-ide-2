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
  app.el.panelTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".panel-body").forEach((body) => {
    body.classList.toggle("hidden", body.dataset.panel !== name);
  });
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
