// features/panel-signals.js — the "panels cooperate" layer. Subscribes to bus
// domain events and, gated by the active workspace policy, nudges the UI:
// attention dots on tabs, auto-open Tests after AI gen, surface the statement
// after OCR/analysis, flag the Coach after a WA or a fresh reply.

function pol(app, key, fallback) {
  return (app.workspace && app.workspace.policy && app.workspace.policy[key] != null)
    ? app.workspace.policy[key] : fallback;
}

function flagTab(name, on = true) {
  const tab = document.querySelector(`#panel-tabs .tab[data-tab="${name}"]`);
  if (tab) tab.classList.toggle("ws-tab-attn", on);
}

export function initPanelSignals(app) {
  // A failed verdict → flag Coach (Learning/Debug enable autoCoachOnWA). Never
  // auto-switches away from the diff on WA — just dots the Coach tab.
  app.bus.on("verdict", ({ verdict }) => {
    const failed = ["WA", "TLE", "RE", "CE"].includes(String(verdict || "").toUpperCase());
    if (failed && pol(app, "autoCoachOnWA", false) && app.state.activeTab !== "coach") {
      flagTab("coach", true);
    }
  });

  // A fresh Coach reply while you're on another tab → dot on Coach.
  app.bus.on("coach:reply", () => {
    if (app.state.activeTab !== "coach") flagTab("coach", true);
  });

  // AI test generation finished → open Tests (policy-gated).
  app.bus.on("tests:generated", () => {
    if (pol(app, "autoOpenTestsOnGen", true) && app.setTab) app.setTab("tests");
  });

  // OCR / analysis finished → make sure the statement is actually visible.
  app.bus.on("analysis:done", () => {
    if (!pol(app, "autoFocusStatementOnOcr", true)) return;
    const mode = app.state.layoutMode || "coding";
    if (mode === "coding" && app.setLayoutMode) app.setLayoutMode("split");
  });
}

// Clear a tab's attention dot when it becomes active. Called from app.setTab.
export function clearTabAttn(name) { flagTab(name, false); }
