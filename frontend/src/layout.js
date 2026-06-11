// layout.js — right-panel tab switching, center Code/Problem view switching,
// and modal helpers.

export function initLayout(app) {
  const tabs = app.el.panelTabs.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => app.setTab(tab.dataset.tab));
  });

  // Center column: Code / Problem segmented toggle.
  const toggle = document.getElementById("view-toggle");
  if (toggle) {
    toggle.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => app.setView(btn.dataset.view));
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
export function setView(app, name) {
  app.state.activeView = name;
  const toggle = document.getElementById("view-toggle");
  if (toggle) {
    toggle.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  }
  const code = document.getElementById("view-code");
  const problem = document.getElementById("view-problem");
  if (code) code.classList.toggle("hidden", name !== "code");
  if (problem) problem.classList.toggle("hidden", name !== "problem");
}
