// features/workspaces.js — the Workspace orchestrator. Resolves the active
// policy (defaults ⊕ preset ⊕ overrides), applies it through the EXISTING
// layout primitives in one transition-suppressed batch, persists the session,
// renders the topbar switcher, and binds Ctrl+1..6. No new panels.

import { resolvePolicy, listWorkspaces, getPreset, observable, detectWorkspace } from "../core/workspace-policy.js";
import { loadSession, saveSession } from "../core/session-store.js";

const ALL_TABS = ["run", "tests", "notes", "coach", "history", "settings"];

export function initWorkspaces(app) {
  const wsList = listWorkspaces();
  let session = loadSession(window.localStorage);
  let current = session.workspaceId || "free";
  let overrides = session.overrides || {};
  let policy = resolvePolicy(current, overrides);
  let applying = false; // guard: suppress custom-detection during applyPolicy

  const persist = () => {
    let lastProblem = session.lastProblem;
    try { lastProblem = localStorage.getItem("usaco2.lastProblem") || lastProblem; } catch { /* private mode */ }
    session = { ...session, workspaceId: current, overrides, lastProblem };
    saveSession(window.localStorage, session);
  };

  // Apply the resolved policy through existing primitives, transition-suppressed.
  function applyPolicy() {
    applying = true;
    const wb = document.querySelector(".workbench");
    const prev = wb ? wb.style.transition : "";
    if (wb) wb.style.transition = "none";

    // Layout axes
    if (app.setLayoutMode) app.setLayoutMode(policy.layout);
    const isZen = Boolean(wb && wb.classList.contains("zen-mode"));
    if (policy.zen !== isZen && app.toggleZenMode) app.toggleZenMode();
    if (app.setSidebarCollapsed) app.setSidebarCollapsed(policy.explorer === "collapsed");
    if (policy.rightTab && app.setTab) app.setTab(policy.rightTab);

    // Panel + widget visibility
    applyPanelVisibility(app, policy);
    applyWidgetVisibility(policy);

    // Focus / motion
    document.documentElement.classList.toggle("ws-reduced-motion", Boolean(policy.reducedMotion));

    // AI strategy default (the existing Coach reveal toggle)
    applyCoachReveal(policy.coachReveal);

    if (wb) { void wb.offsetWidth; wb.style.transition = prev; }
    renderPill();
    applying = false;
  }

  function switchTo(id) {
    if (!getPreset(id)) return;
    current = id;
    overrides = {};
    policy = resolvePolicy(current, overrides);
    applyPolicy();
    persist();
    app.bus.emit("workspace:changed", { id: current, policy });
    const p = getPreset(id);
    app.toast(`Workspace: ${p.icon} ${p.name}`, "ok");
  }

  function resetLayout() {
    try { localStorage.removeItem("usaco2.panelW"); localStorage.removeItem("usaco2.splitPw"); } catch { /* ignore */ }
    const wb = document.querySelector(".workbench");
    if (wb) wb.style.removeProperty("--panel-w");
    const shell = document.getElementById("editor-shell");
    if (shell) shell.style.removeProperty("--split-pw");
    switchTo("free");
  }

  // The user diverged from the preset by hand → relabel as "Tùy chỉnh".
  function markCustomIfDiverged() {
    if (applying) return;
    const live = {
      layout: app.state.layoutMode || "coding",
      rightTab: app.state.activeTab || "run",
      explorer: (document.querySelector(".workbench.sb-collapsed") ? "collapsed" : "expanded"),
      zen: Boolean(document.querySelector(".workbench.zen-mode"))
    };
    const detected = detectWorkspace(live);
    if (detected !== current) {
      current = detected;
      persist();
      renderPill();
    }
  }

  // suggest() is the seam for the future adaptive advisor — emit only, no UI yet.
  function suggest(id) { app.bus.emit("workspace:suggested", { id }); }

  // ---- topbar switcher pill + popover ----
  let pillEl = null, popoverEl = null;
  function buildSwitcher() {
    const brand = document.querySelector(".topbar .brand");
    if (!brand || !brand.parentNode) return;
    const host = document.createElement("div");
    host.className = "ws-switch";
    host.innerHTML = `
      <button id="ws-pill" class="ws-pill" type="button" aria-haspopup="true" title="Đổi không gian làm việc">
        <span class="ws-pill-icon">🎯</span><span class="ws-pill-name">Tự do</span><span class="ws-pill-caret">▾</span>
      </button>
      <div id="ws-popover" class="ws-popover hidden" role="menu">
        ${wsList.map((w, i) => `
          <button class="ws-opt" role="menuitem" data-id="${w.id}">
            <span class="ws-opt-icon">${w.icon}</span><span class="ws-opt-name">${w.name}</span><kbd>Ctrl·${i + 1}</kbd>
          </button>`).join("")}
      </div>`;
    brand.parentNode.insertBefore(host, brand.nextSibling);
    pillEl = host.querySelector("#ws-pill");
    popoverEl = host.querySelector("#ws-popover");
    pillEl.addEventListener("click", () => popoverEl.classList.toggle("hidden"));
    popoverEl.addEventListener("click", (e) => {
      const opt = e.target.closest(".ws-opt");
      if (!opt) return;
      popoverEl.classList.add("hidden");
      switchTo(opt.dataset.id);
    });
    document.addEventListener("click", (e) => {
      if (popoverEl && !host.contains(e.target)) popoverEl.classList.add("hidden");
    });
  }

  function renderPill() {
    if (!pillEl) return;
    const known = getPreset(current);
    const icon = known ? known.icon : "✎";
    const name = known ? known.name : "Tùy chỉnh";
    pillEl.querySelector(".ws-pill-icon").textContent = icon;
    pillEl.querySelector(".ws-pill-name").textContent = name;
    popoverEl.querySelectorAll(".ws-opt").forEach((o) =>
      o.classList.toggle("active", o.dataset.id === current));
  }

  buildSwitcher();

  // Manual divergence → "Tùy chỉnh".
  app.bus.on("layout:changed", markCustomIfDiverged);

  // Ctrl+1..6 jump to a workspace.
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= wsList.length) { e.preventDefault(); switchTo(wsList[n - 1].id); }
  });

  app.workspace = {
    get policy() { return policy; },
    get current() { return current; },
    switchTo, resetLayout, suggest, applyPolicy
  };

  // Apply whatever was restored from the session (overrides today's scattered
  // layout/tab restore — this runs AFTER loadProblem in boot).
  applyPolicy();
  renderPill();
}

// ---- visibility helpers (operate on existing DOM; reversible) ----
function applyPanelVisibility(app, policy) {
  const tabs = document.querySelectorAll("#panel-tabs .tab");
  let activeHidden = false;
  tabs.forEach((t) => {
    const hide = policy.panels && policy.panels[t.dataset.tab] === "hide";
    t.classList.toggle("ws-tab-hidden", hide);
    if (hide && t.classList.contains("active")) activeHidden = true;
  });
  const col = document.querySelector(".col-panel");
  if (col) col.classList.toggle("ws-panel-off", policy.rightTab === null);
  // If the active tab got hidden, fall back to the first visible one.
  if (activeHidden && policy.rightTab !== null) {
    const firstVisible = ALL_TABS.find((id) => !(policy.panels && policy.panels[id] === "hide"));
    if (firstVisible && app.setTab) app.setTab(firstVisible);
  }
}

function applyWidgetVisibility(policy) {
  const w = policy.widgets || {};
  const set = (sel, show) => { const el = document.querySelector(sel); if (el) el.classList.toggle("ws-widget-off", !show); };
  set("#session-stats", w.sessionStats !== false);
  set("#focus-timer", w.timer !== false);
  set("#btn-dashboard", w.dashboardBtn !== false);
}

function applyCoachReveal(mode) {
  const el = document.getElementById("coach-reveal");
  if (!el) return;
  el.checked = mode === "explain";
  el.disabled = mode === "locked-hints";
  const label = el.closest(".coach-reveal-toggle");
  if (label) label.classList.toggle("ws-locked", mode === "locked-hints");
}
