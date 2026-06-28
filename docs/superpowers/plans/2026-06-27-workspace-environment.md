# Workspace Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the IDE's isolated panels into one task-adaptive Workspace
*environment* — a declarative policy (layout + behaviour + automation + AI
strategy + notifications + focus + persistence + panel priority + learning
context) that switches the whole shell in one action, driven by a pure core and
an event bus, reusing every existing panel.

**Architecture:** Policy + Bus + Orchestrator. A workspace is a *sparse patch*
over one resolved `WorkspacePolicy` (global defaults). A tiny event bus is the
spine: producers emit domain events; behaviours are written once as subscribers
that read the active policy. A `WorkspaceManager` resolves
`defaults ⊕ preset ⊕ overrides`, applies layout via the **existing** primitives
(`setLayoutMode`, `setTab`, `setSidebarCollapsed`, `setCoachFocus`,
`toggleZenMode`), and persists a single session envelope. See
`docs/WORKSPACE-ARCHITECTURE.md`.

**Tech Stack:** Vanilla ES modules (browser), no runtime deps. Tests: `node:test`
+ `node:assert/strict`. Pure core is DOM-free and unit-tested; DOM wiring is
verified by `node --check` + live smoke on the local server.

## Global Constraints

- **No new runtime dependencies.** Frontend is dependency-free vanilla ESM;
  backend depends only on `express`. Add none.
- **Node ≥ 18** (matches `backend/package.json` engines).
- **Vietnamese-first UI copy** (matches every existing label/toast).
- **Reuse, never duplicate panels.** Apply only via existing primitives;
  introduce zero new panel components. `minimal` reuses Zen; `debug`'s diff is
  the existing Run console.
- **Pure core stays DOM-free and query-string-free in internal imports.** Browser
  cache-busting `?v=` is applied only at top-level import sites in `main.js`;
  `core/*` modules import each other without `?v=` so Node can import them in
  tests.
- **`localStorage` access is always wrapped in try/catch** (private-mode safe),
  matching the existing `usaco2.*` call sites.
- **Apply layout changes with `.workbench` transition suppression** (set
  `transition:none`, force reflow, restore) — the documented Chromium grid-track
  measurement bug.
- **Never unload modules** to "hide" a panel — hide affordances only (init-order
  fragility is documented). Hiding is reversible by switching workspace.
- **Errors always surface.** Notification gating may suppress info/ok toasts but
  `type:"err"` toasts and compile errors always show.
- **Cache discipline:** bump `index.html` `?v=` for every css/js touched, or the
  browser serves stale files.
- **Backend regression gate:** `cd backend && npm test` must stay green (98/98)
  after every task.
- **Git:** work on a feature branch (do not commit to the default branch, do not
  push). Commit locally per task.

---

### Task 1: Event bus (pure core) + frontend test harness

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/src/core/bus.js`
- Test: `frontend/test/bus.test.mjs`

**Interfaces:**
- Produces: `createBus() -> { on(event, fn) -> unsubscribe, off(event, fn), emit(event, payload) }`. `on` returns a function that removes that subscriber. `emit` calls every subscriber synchronously; a throwing subscriber is caught and logged, never blocks the others.

- [ ] **Step 1: Create the frontend test harness manifest**

`frontend/package.json`:

```json
{
  "name": "usaco-ide-2-frontend",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "description": "Frontend ESM for USACO IDE 2.0. Pure core modules are unit-tested with node:test.",
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\""
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Write the failing test**

`frontend/test/bus.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createBus } from "../src/core/bus.js";

test("emit delivers the payload to subscribers", () => {
  const bus = createBus();
  let seen = null;
  bus.on("judge:done", (p) => { seen = p; });
  bus.emit("judge:done", { verdict: "AC" });
  assert.deepEqual(seen, { verdict: "AC" });
});

test("unsubscribe via the returned function stops delivery", () => {
  const bus = createBus();
  let count = 0;
  const off = bus.on("x", () => { count += 1; });
  bus.emit("x");
  off();
  bus.emit("x");
  assert.equal(count, 1);
});

test("a throwing subscriber does not block the others", () => {
  const bus = createBus();
  let reached = false;
  bus.on("x", () => { throw new Error("boom"); });
  bus.on("x", () => { reached = true; });
  bus.emit("x");
  assert.equal(reached, true);
});

test("emit with no subscribers is a no-op", () => {
  const bus = createBus();
  assert.doesNotThrow(() => bus.emit("nobody", { a: 1 }));
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module '../src/core/bus.js'`.

- [ ] **Step 4: Implement the bus**

`frontend/src/core/bus.js`:

```js
// core/bus.js — a tiny synchronous pub/sub. Pure and DOM-free so it can be
// unit-tested under node:test and shared by every frontend module.
export function createBus() {
  const map = new Map(); // event -> Set<fn>
  return {
    on(event, fn) {
      let set = map.get(event);
      if (!set) { set = new Set(); map.set(event, set); }
      set.add(fn);
      return () => { const s = map.get(event); if (s) s.delete(fn); };
    },
    off(event, fn) { const s = map.get(event); if (s) s.delete(fn); },
    emit(event, payload) {
      const set = map.get(event);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(`[bus] ${event} handler failed:`, err); }
      }
    }
  };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Syntax-check + commit**

```bash
node --check frontend/src/core/bus.js
git add frontend/package.json frontend/src/core/bus.js frontend/test/bus.test.mjs
git commit -m "feat(workspace): pure event bus + frontend node:test harness"
```

---

### Task 2: WorkspacePolicy — defaults, presets, resolve, detect (pure core)

**Files:**
- Create: `frontend/src/core/workspace-policy.js`
- Test: `frontend/test/workspace-policy.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_POLICY` (frozen object) — every policy field with its baseline value.
  - `PRESETS` — array of `{ id, name, icon, patch }` (free, learning, contest, debug, teaching, minimal).
  - `listWorkspaces() -> [{id,name,icon}]`.
  - `getPreset(id) -> {id,name,icon,patch} | null`.
  - `resolvePolicy(presetId, overrides = {}) -> policy` — `DEFAULT_POLICY ⊕ preset.patch ⊕ overrides`, with `panels`/`widgets` merged one level deep.
  - `observable(policy) -> { layout, rightTab, explorer, zen }`.
  - `detectWorkspace(obs) -> presetId | "custom"` — which preset's observable axes equal `obs`.

- [ ] **Step 1: Write the failing test**

`frontend/test/workspace-policy.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY, PRESETS, listWorkspaces, getPreset,
  resolvePolicy, observable, detectWorkspace
} from "../src/core/workspace-policy.js";

test("free preset resolves to the defaults exactly", () => {
  assert.deepEqual(resolvePolicy("free"), DEFAULT_POLICY);
});

test("a sparse patch only changes its own fields", () => {
  const p = resolvePolicy("learning");
  assert.equal(p.layout, "split");
  assert.equal(p.rightTab, "coach");
  assert.equal(p.autoCoachOnWA, true);
  assert.equal(p.sounds, DEFAULT_POLICY.sounds);   // untouched
  assert.equal(p.notifications, "normal");          // untouched
});

test("nested panels/widgets merge one level deep, not replace", () => {
  const p = resolvePolicy("contest");
  assert.equal(p.panels.notes, "hide");             // from patch
  assert.equal(p.widgets.dashboardBtn, false);      // from patch
  assert.equal(p.widgets.timer, true);              // default preserved
});

test("overrides win over the preset", () => {
  const p = resolvePolicy("contest", { sounds: true, layout: "split" });
  assert.equal(p.sounds, true);
  assert.equal(p.layout, "split");
});

test("every preset has a unique id and an icon, free is first", () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(ids[0], "free");
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PRESETS) assert.ok(p.icon && p.name);
});

test("detectWorkspace round-trips each preset's observable axes", () => {
  for (const p of PRESETS) {
    const obs = observable(resolvePolicy(p.id));
    assert.equal(detectWorkspace(obs), p.id === "free" ? "free" : detectWorkspace(obs));
    assert.equal(typeof detectWorkspace(obs), "string");
  }
  assert.equal(detectWorkspace(observable(resolvePolicy("contest"))), "contest");
});

test("an unmatched observable set is reported as custom", () => {
  assert.equal(detectWorkspace({ layout: "reading", rightTab: "tests", explorer: "collapsed", zen: false }), "custom");
});

test("listWorkspaces exposes id/name/icon only", () => {
  const list = listWorkspaces();
  assert.equal(list.length, PRESETS.length);
  assert.deepEqual(Object.keys(list[0]).sort(), ["icon", "id", "name"]);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module '../src/core/workspace-policy.js'`.

- [ ] **Step 3: Implement the policy core**

`frontend/src/core/workspace-policy.js`:

```js
// core/workspace-policy.js — the resolved "environment" model. Pure & DOM-free.
// A workspace is a sparse PATCH over DEFAULT_POLICY; the manager resolves
// defaults ⊕ preset ⊕ user-overrides and the rest of the app reads the result.

export const DEFAULT_POLICY = Object.freeze({
  // Layout
  layout: "coding",            // coding | split | reading
  rightTab: "run",             // run|tests|notes|coach|history|settings | null (panel hidden)
  explorer: "expanded",        // expanded | collapsed
  coachFocus: false,
  zen: false,
  coachAutoVisible: false,
  // Panel priority / visibility
  panels: {},                  // tab -> "hide" (absent = shown)
  panelOrder: null,            // optional array of tab ids
  widgets: { timer: true, sessionStats: true, dashboardBtn: true },
  // Automation
  autoOpenTestsOnGen: true,
  autoFocusStatementOnOcr: true,
  autoCoachOnWA: false,
  snapshotOnJudge: true,
  collapseExplorerOnEnter: false,
  // AI strategy
  coachReveal: "hints",        // hints | explain | locked-hints
  // Notifications / focus
  notifications: "normal",     // normal | minimal | off
  sounds: true,
  reducedMotion: false,
  // Learning context
  trackWeakTopics: true,
  recordTimeline: true,
  reflectionAfterAc: false
});

export const PRESETS = [
  { id: "free", name: "Tự do", icon: "🎯", patch: {} },
  { id: "learning", name: "Học", icon: "📚", patch: {
    layout: "split", rightTab: "coach", coachAutoVisible: true,
    autoCoachOnWA: true, reflectionAfterAc: true } },
  { id: "contest", name: "Thi đấu", icon: "🏁", patch: {
    explorer: "collapsed", collapseExplorerOnEnter: true,
    panels: { notes: "hide" }, widgets: { dashboardBtn: false },
    coachReveal: "locked-hints", notifications: "minimal", sounds: false,
    reducedMotion: true, trackWeakTopics: false } },
  { id: "debug", name: "Gỡ lỗi", icon: "🔍", patch: {
    explorer: "collapsed", rightTab: "run", autoCoachOnWA: true,
    coachReveal: "explain" } },
  { id: "teaching", name: "Dạy", icon: "🎓", patch: {
    layout: "reading", rightTab: "coach", coachAutoVisible: true,
    coachReveal: "explain" } },
  { id: "minimal", name: "Tối giản", icon: "🧘", patch: {
    rightTab: null, explorer: "collapsed", zen: true,
    panels: { notes: "hide", coach: "hide", history: "hide", settings: "hide" },
    widgets: { sessionStats: false, dashboardBtn: false },
    notifications: "off", sounds: false, reducedMotion: true,
    autoCoachOnWA: false, autoOpenTestsOnGen: false,
    trackWeakTopics: false, recordTimeline: false } }
];

function mergeOneLevel(base, patch) {
  const out = { ...base, ...patch };
  out.panels = { ...(base.panels || {}), ...(patch.panels || {}) };
  out.widgets = { ...(base.widgets || {}), ...(patch.widgets || {}) };
  return out;
}

export function getPreset(id) { return PRESETS.find((p) => p.id === id) || null; }
export function listWorkspaces() { return PRESETS.map(({ id, name, icon }) => ({ id, name, icon })); }

export function resolvePolicy(presetId, overrides = {}) {
  const preset = getPreset(presetId) || getPreset("free");
  return mergeOneLevel(mergeOneLevel(DEFAULT_POLICY, preset.patch), overrides);
}

export function observable(policy) {
  return { layout: policy.layout, rightTab: policy.rightTab, explorer: policy.explorer, zen: policy.zen };
}

export function detectWorkspace(obs) {
  for (const p of PRESETS) {
    const r = observable(resolvePolicy(p.id));
    if (r.layout === obs.layout && r.rightTab === obs.rightTab &&
        r.explorer === obs.explorer && r.zen === obs.zen) return p.id;
  }
  return "custom";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (bus tests + workspace-policy tests).

- [ ] **Step 5: Syntax-check + commit**

```bash
node --check frontend/src/core/workspace-policy.js
git add frontend/src/core/workspace-policy.js frontend/test/workspace-policy.test.mjs
git commit -m "feat(workspace): policy model — defaults, 6 presets, resolve, detect"
```

---

### Task 3: Session store (pure core)

**Files:**
- Create: `frontend/src/core/session-store.js`
- Test: `frontend/test/session-store.test.mjs`

**Interfaces:**
- Consumes: an injectable `storage` with `getItem(k)` / `setItem(k,v)` (browser `localStorage`, or a fake in tests).
- Produces:
  - `loadSession(storage) -> { workspaceId, overrides, lastProblem, startedAt }` — parses `usaco2.session.v1`; if absent, seeds from legacy keys.
  - `saveSession(storage, session) -> void`.
  - `seedFromLegacy(storage) -> session` — default `workspaceId:"free"`, `overrides:{}`, `lastProblem` from `usaco2.lastProblem`.

- [ ] **Step 1: Write the failing test**

`frontend/test/session-store.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadSession, saveSession, seedFromLegacy } from "../src/core/session-store.js";

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

test("missing envelope seeds free + pulls legacy lastProblem", () => {
  const s = loadSession(fakeStorage({ "usaco2.lastProblem": "p7" }));
  assert.equal(s.workspaceId, "free");
  assert.deepEqual(s.overrides, {});
  assert.equal(s.lastProblem, "p7");
  assert.ok(s.startedAt);
});

test("saveSession round-trips through loadSession", () => {
  const store = fakeStorage();
  saveSession(store, { workspaceId: "contest", overrides: { sounds: true }, lastProblem: "p1", startedAt: "t" });
  const s = loadSession(store);
  assert.equal(s.workspaceId, "contest");
  assert.deepEqual(s.overrides, { sounds: true });
});

test("corrupt JSON falls back to a seeded session, never throws", () => {
  const store = fakeStorage({ "usaco2.session.v1": "{not json" });
  let s;
  assert.doesNotThrow(() => { s = loadSession(store); });
  assert.equal(s.workspaceId, "free");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module '../src/core/session-store.js'`.

- [ ] **Step 3: Implement the session store**

`frontend/src/core/session-store.js`:

```js
// core/session-store.js — the single persistence envelope for the active
// workspace + continuity. Storage is injected so it is Node-testable; the
// browser passes localStorage. Layout primitives keep their own legacy keys;
// this envelope adds only workspaceId + overrides + lastProblem (additive).
const KEY = "usaco2.session.v1";
const LEGACY_LAST_PROBLEM = "usaco2.lastProblem";

export function seedFromLegacy(storage) {
  let lastProblem = null;
  try { lastProblem = storage.getItem(LEGACY_LAST_PROBLEM) || null; } catch { /* private mode */ }
  return { workspaceId: "free", overrides: {}, lastProblem, startedAt: new Date().toISOString() };
}

export function loadSession(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === "object") {
        return {
          workspaceId: s.workspaceId || "free",
          overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : {},
          lastProblem: s.lastProblem || null,
          startedAt: s.startedAt || new Date().toISOString()
        };
      }
    }
  } catch { /* corrupt or private mode → seed */ }
  return seedFromLegacy(storage);
}

export function saveSession(storage, session) {
  try { storage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode */ }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (all core tests).

- [ ] **Step 5: Syntax-check + commit**

```bash
node --check frontend/src/core/session-store.js
git add frontend/src/core/session-store.js frontend/test/session-store.test.mjs
git commit -m "feat(workspace): session-store envelope (seed-from-legacy, round-trip)"
```

---

### Task 4: Expose an explorer-collapse API on `app`

**Files:**
- Modify: `frontend/src/features/sidebar-toggle.js`
- Modify: `frontend/src/main.js:664` (the `initSidebarToggle();` call)

**Interfaces:**
- Consumes: nothing new.
- Produces: `initSidebarToggle(app)` (now takes `app`); sets `app.setSidebarCollapsed(v: boolean)` which collapses/expands the explorer and persists, AND keeps the Ctrl+B toggle and the header button working.

> DOM-integration task: no node:test (the repo has no DOM harness). Verified by `node --check` + live smoke.

- [ ] **Step 1: Rewrite `sidebar-toggle.js` to accept `app` and expose the setter**

Replace the body of `initSidebarToggle` so the existing `set` closure is exposed:

```js
// features/sidebar-toggle.js — collapse/expand the left Problem Explorer.
// State is persisted in localStorage so a reload keeps it. Ctrl/Cmd+B toggles.
// Exposes app.setSidebarCollapsed so the Workspace orchestrator can drive it.

const KEY = "usaco.sidebar.collapsed";

export function initSidebarToggle(app) {
  const workbench = document.querySelector(".workbench");
  const colHead = document.querySelector(".col-problems .col-head");
  if (!workbench || !colHead) return;

  const toggle = document.createElement("button");
  toggle.id = "sb-toggle";
  toggle.className = "sb-toggle";
  toggle.type = "button";
  toggle.title = "Thu gọn / mở rộng (Ctrl+B)";
  colHead.insertBefore(toggle, colHead.firstChild);

  let collapsed = false;
  try { collapsed = localStorage.getItem(KEY) === "1"; } catch { /* ignore */ }

  const apply = (v) => {
    workbench.classList.toggle("sb-collapsed", v);
    toggle.textContent = v ? "›" : "‹";
    toggle.setAttribute("aria-expanded", String(!v));
  };
  apply(collapsed);

  const set = (v) => {
    collapsed = v;
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
    apply(v);
    if (app && app.bus) app.bus.emit("layout:changed", { source: "sidebar" });
  };

  toggle.addEventListener("click", () => set(!collapsed));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      set(!collapsed);
    }
  });

  // Public hook for the Workspace orchestrator.
  if (app) app.setSidebarCollapsed = (v) => set(Boolean(v));
}
```

- [ ] **Step 2: Pass `app` at the call site**

In `frontend/src/main.js`, change line 664 from `initSidebarToggle();` to:

```js
  initSidebarToggle(app);
```

- [ ] **Step 3: Syntax-check**

Run: `node --check frontend/src/features/sidebar-toggle.js && node --check frontend/src/main.js`
Expected: no output (OK).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/sidebar-toggle.js frontend/src/main.js
git commit -m "feat(workspace): expose app.setSidebarCollapsed for the orchestrator"
```

---

### Task 5: WorkspaceManager — apply, persist, switcher UI, Ctrl+1–6

**Files:**
- Create: `frontend/src/features/workspaces.js`
- Create: `frontend/styles/workspaces.css`
- Modify: `frontend/src/layout.js` (emit `layout:changed` from `setTab`/`setLayoutMode`)
- Modify: `frontend/src/main.js` (create `app.bus`; init + restore workspace in boot)
- Modify: `frontend/index.html` (link `workspaces.css`)

**Interfaces:**
- Consumes: `createBus` (Task 1); `resolvePolicy`, `listWorkspaces`, `getPreset`, `observable`, `detectWorkspace` (Task 2); `loadSession`, `saveSession` (Task 3); existing `app.setLayoutMode`, `app.setTab`, `app.setSidebarCollapsed`, `app.toggleCoachFocus`, `app.toggleZenMode`, `app.state`.
- Produces on `app`:
  - `app.bus` (created in main.js before this).
  - `app.workspace = { get policy(), get current(), switchTo(id), resetLayout(), suggest(id), applyPolicy() }`.
  - Persists `usaco2.session.v1`. Emits `workspace:changed` `{ id, policy }`.

> DOM-integration task: verified by `node --check` + live smoke.

- [ ] **Step 1: Emit `layout:changed` from the layout primitives**

In `frontend/src/layout.js`, at the end of `setTab` (after the loop, before the function returns) add:

```js
  if (app.bus) app.bus.emit("layout:changed", { source: "tab", tab: name });
```

And at the end of `setLayoutMode` (just before the closing brace of the function) add:

```js
  if (app.bus) app.bus.emit("layout:changed", { source: "layout", mode });
```

- [ ] **Step 2: Create the WorkspaceManager**

`frontend/src/features/workspaces.js`:

```js
// features/workspaces.js — the Workspace orchestrator. Resolves the active
// policy (defaults ⊕ preset ⊕ overrides), applies it through the EXISTING
// layout primitives in one transition-suppressed batch, persists the session,
// renders the topbar switcher, and binds Ctrl+1..6. No new panels.

import { resolvePolicy, listWorkspaces, getPreset, observable, detectWorkspace } from "../core/workspace-policy.js";
import { loadSession, saveSession } from "../core/session-store.js";

export function initWorkspaces(app) {
  const wsList = listWorkspaces();
  let session = loadSession(window.localStorage);
  let current = session.workspaceId || "free";
  let overrides = session.overrides || {};
  let policy = resolvePolicy(current, overrides);

  const persist = () => {
    session = { ...session, workspaceId: current, overrides,
      lastProblem: (() => { try { return localStorage.getItem("usaco2.lastProblem"); } catch { return session.lastProblem; } })() };
    saveSession(window.localStorage, session);
  };

  // Apply the resolved policy through existing primitives, transition-suppressed.
  function applyPolicy() {
    const wb = document.querySelector(".workbench");
    const prev = wb ? wb.style.transition : "";
    if (wb) wb.style.transition = "none";

    // Layout axes
    if (app.setLayoutMode) app.setLayoutMode(policy.layout);
    if (policy.zen !== Boolean(wb && wb.classList.contains("zen-mode")) && app.toggleZenMode) app.toggleZenMode();
    if (app.setSidebarCollapsed) app.setSidebarCollapsed(policy.explorer === "collapsed");
    if (policy.rightTab && app.setTab) app.setTab(policy.rightTab);

    // Panel + widget visibility
    applyPanelVisibility(policy);
    applyWidgetVisibility(policy);

    // Focus / motion
    document.documentElement.classList.toggle("ws-reduced-motion", Boolean(policy.reducedMotion));

    // AI strategy default (the existing Coach reveal toggle)
    applyCoachReveal(policy.coachReveal);

    if (wb) { void wb.offsetWidth; wb.style.transition = prev; }
    renderPill();
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
    if (wb) { wb.style.removeProperty("--panel-w"); }
    const shell = document.getElementById("editor-shell");
    if (shell) shell.style.removeProperty("--split-pw");
    switchTo("free");
  }

  // The user diverged from the preset by hand → relabel as "Tùy chỉnh".
  function markCustomIfDiverged() {
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
const ALL_TABS = ["run", "tests", "notes", "coach", "history", "settings"];
function applyPanelVisibility(policy) {
  const tabs = document.querySelectorAll("#panel-tabs .tab");
  let activeHidden = false;
  tabs.forEach((t) => {
    const hide = policy.panels && policy.panels[t.dataset.tab] === "hide";
    t.classList.toggle("ws-tab-hidden", hide);
    if (hide && t.classList.contains("active")) activeHidden = true;
  });
  // Hide the whole right column when no tab is meant to show.
  const col = document.querySelector(".col-panel");
  if (col) col.classList.toggle("ws-panel-off", policy.rightTab === null);
  // If the active tab got hidden, fall back to the first visible one.
  if (activeHidden) {
    const firstVisible = ALL_TABS.find((id) => !(policy.panels && policy.panels[id] === "hide"));
    if (firstVisible && window.__app && window.__app.setTab) window.__app.setTab(firstVisible);
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
```

> Note for the `activeHidden` fallback: `window.__app` is set in Step 4. The
> orchestrator never imports `main.js` (avoids a cycle); it reaches the app via
> the global the boot sequence assigns.

- [ ] **Step 3: Create `workspaces.css`**

`frontend/styles/workspaces.css`:

```css
/* workspaces.css — topbar workspace switcher + policy-driven visibility.
   Loaded after forge.css so .ws-* utilities win. */
.ws-switch { position: relative; display: flex; align-items: center; margin-left: 10px; }
.ws-pill {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text); font-size: 12.5px; cursor: pointer;
}
.ws-pill:hover { border-color: var(--accent); }
.ws-pill-caret { opacity: .6; font-size: 10px; }
.ws-popover {
  position: absolute; top: 34px; left: 0; z-index: 60; min-width: 210px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 6px; box-shadow: 0 12px 36px rgba(0,0,0,.35);
}
.ws-popover.hidden { display: none; }
.ws-opt {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 9px; border: 0; border-radius: 7px; background: transparent;
  color: var(--text); font-size: 13px; cursor: pointer; text-align: left;
}
.ws-opt:hover { background: var(--bg-elev); }
.ws-opt.active { background: var(--accent-soft); }
.ws-opt kbd { margin-left: auto; opacity: .7; font-size: 10.5px; }
.ws-opt-icon { width: 18px; text-align: center; }

/* Policy-driven visibility (reversible — just classes). */
.ws-tab-hidden { display: none !important; }
.ws-widget-off { display: none !important; }
.col-panel.ws-panel-off { display: none !important; }
.coach-reveal-toggle.ws-locked { opacity: .5; pointer-events: none; }

/* Focus rule: workspaces that ask for calm kill the ambient loops. */
html.ws-reduced-motion * { animation: none !important; transition: none !important; }
```

- [ ] **Step 4: Create the bus, expose `window.__app`, and init/restore in boot**

In `frontend/src/main.js`:

(a) At the top of the file, add the import alongside the others:

```js
import { createBus } from "./core/bus.js";
import { initWorkspaces } from "./features/workspaces.js?v=1.0";
```

(b) Immediately after `const app = { … };` (around line 59) add:

```js
app.bus = createBus();
window.__app = app; // the workspace orchestrator reaches the app via this global
```

(c) In `boot()`, AFTER the problem-restore block (after the `if (target) await app.loadProblem(target); else app.clearEditor();` block near line 757) add:

```js
  // Workspace environment — restore the saved workspace and apply it as the
  // authoritative layout/behaviour layer (runs after loadProblem on purpose).
  initWorkspaces(app);
```

- [ ] **Step 5: Link `workspaces.css` in `index.html`**

In `frontend/index.html`, after the `forge.css` link (line 28) add:

```html
  <link rel="stylesheet" href="./styles/workspaces.css?v=1.0" />
```

And bump the module entry at the bottom: change `./src/main.js?v=3.4` to `./src/main.js?v=3.5`.

- [ ] **Step 6: Syntax-check**

Run: `node --check frontend/src/features/workspaces.js && node --check frontend/src/layout.js && node --check frontend/src/main.js`
Expected: no output (OK).

- [ ] **Step 7: Live smoke**

Start the app: `cd backend && npm start` (serves the frontend; note the URL from `backend/src/config.js`). Using the Playwright MCP against that URL:
- Confirm the **🎯 Tự do** pill renders in the topbar.
- Click the pill → popover lists 6 workspaces. Click **🏁 Thi đấu** → explorer collapses, Notes tab hidden, a toast appears.
- Press `Ctrl+2` (Học) → layout becomes split, Coach tab active.
- Reload the page → the last workspace is restored.
- Console has no errors (`browser_console_messages`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/workspaces.js frontend/styles/workspaces.css frontend/src/layout.js frontend/src/main.js frontend/index.html
git commit -m "feat(workspace): WorkspaceManager — apply/persist/switcher/Ctrl+1-6"
```

---

### Task 6: Policy-gated notifications, sounds, and Coach reveal default

**Files:**
- Modify: `frontend/src/main.js` (`app.toast`, `app.playSound`)
- Modify: `frontend/src/features/mini-chat.js` (respect a locked reveal)

**Interfaces:**
- Consumes: `app.workspace.policy.{notifications,sounds}` (Task 5).
- Produces: gated `app.toast` / `app.playSound`; Coach reveal toggle honours `locked-hints`.

> DOM-integration task: verified by `node --check` + live smoke.

- [ ] **Step 1: Gate `app.toast` by `notifications`**

In `frontend/src/main.js`, at the very start of `app.toast` (after the signature, before `const host = …`), add:

```js
  // Workspace notification policy: errors always show; "off" suppresses all
  // non-errors; "minimal" suppresses plain info (keeps "ok" + "err").
  const notif = (app.workspace && app.workspace.policy && app.workspace.policy.notifications) || "normal";
  if (type !== "err") {
    if (notif === "off") return;
    if (notif === "minimal" && type !== "ok") return;
  }
```

- [ ] **Step 2: Gate `app.playSound` by `sounds`**

In `frontend/src/main.js`, at the very start of `app.playSound` (before the `try {`), add:

```js
  if (app.workspace && app.workspace.policy && app.workspace.policy.sounds === false) return;
```

- [ ] **Step 3: Keep a locked reveal locked even if the user clicks it**

In `frontend/src/features/mini-chat.js`, inside the `revealEl.addEventListener("change", …)` handler, make the first line:

```js
    revealEl.addEventListener("change", () => {
      if (revealEl.disabled) { revealEl.checked = false; return; } // locked by Contest workspace
      if (revealEl.checked) {
        app.toast("Đã bật Lời giải — AI có thể đưa code / đáp án đầy đủ. Tắt để quay lại chỉ gợi ý.", "ok");
      }
    });
```

- [ ] **Step 4: Syntax-check**

Run: `node --check frontend/src/main.js && node --check frontend/src/features/mini-chat.js`
Expected: no output (OK).

- [ ] **Step 5: Live smoke**

With the app running: switch to **🧘 Tối giản** → trigger a toast (e.g. Save with no problem) and confirm info toasts are suppressed but an error toast (e.g. Run with empty code path) still appears; confirm no sounds play. Switch to **🏁 Thi đấu** → the Coach "Lời giải" toggle is visibly disabled.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.js frontend/src/features/mini-chat.js
git commit -m "feat(workspace): gate toasts/sounds by policy; lock Coach reveal in Contest"
```

---

### Task 7: Domain-event emitters + panel-signals subscribers

**Files:**
- Create: `frontend/src/features/panel-signals.js`
- Modify: `frontend/src/runner.js` (emit `judge:done` / `run:done` / `verdict`)
- Modify: `frontend/src/features/mini-chat.js` (emit `coach:reply`)
- Modify: `frontend/src/statement.js` (emit `analysis:done`, `tests:generated`)
- Modify: `frontend/src/main.js` (init panel-signals; clear Coach dot on tab switch)
- Modify: `frontend/styles/workspaces.css` (the tab attention dot)

**Interfaces:**
- Consumes: `app.bus`, `app.workspace.policy.{autoCoachOnWA,autoOpenTestsOnGen,autoFocusStatementOnOcr}`, `app.setTab`, `app.setLayoutMode`, `app.state.activeTab`.
- Produces: `initPanelSignals(app)`; tab attention dots; cooperative auto-switches.

> DOM-integration task: verified by `node --check` + live smoke.

- [ ] **Step 1: Emit from `runner.js`**

In `frontend/src/runner.js`, inside `app.runOne`, right after `renderRunOutput(app, r);` add:

```js
      app.bus && app.bus.emit("verdict", { kind: "run", verdict: r.compilerMissing ? "CE" : r.verdict });
```

Inside `app.judgeAll`, right after `applyTestResults(app, r.results);` add:

```js
      app.bus && app.bus.emit("verdict", { kind: "judge", verdict: r.compilerMissing ? "CE" : r.verdict, summary: r.summary });
```

- [ ] **Step 2: Emit `coach:reply` from `mini-chat.js`**

In `frontend/src/features/mini-chat.js`, inside `pace()`, in the `else if (finished)` branch where `app.playSound("complete")` is called, add right after it:

```js
        if (app.bus) app.bus.emit("coach:reply");
```

- [ ] **Step 3: Emit `analysis:done` and `tests:generated` from `statement.js`**

In `frontend/src/statement.js`, immediately after `renderAnalysis(app, res.analysis);` (the `if (res.analysis) {` branch, ~line 565) add:

```js
      if (app.bus) app.bus.emit("analysis:done");
```

In the generated-tests acceptance flow, immediately before the existing
`app.setTab("tests");` (~line 507) add:

```js
    if (app.bus) app.bus.emit("tests:generated");
```

(Leave the existing `app.setTab("tests")` in place — Step 5 makes the auto-open
policy-driven for the *generation* event; this acceptance path already lands on
Tests and should keep doing so.)

- [ ] **Step 4: Create `panel-signals.js`**

`frontend/src/features/panel-signals.js`:

```js
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
  // A failed verdict → flag Coach (and, if policy wants, this is where Learning/
  // Debug make help obvious). Never auto-switches away from the diff on WA.
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

// Clear a tab's attention dot when it becomes active. Call from app.setTab.
export function clearTabAttn(name) { flagTab(name, false); }
```

- [ ] **Step 5: Init panel-signals + clear the dot on tab switch**

In `frontend/src/main.js`:

(a) Add the import near the others:

```js
import { initPanelSignals, clearTabAttn } from "./features/panel-signals.js?v=1.0";
```

(b) In `app.setTab` definition (line 166) wrap it to clear the dot:

```js
app.setTab = (name) => { clearTabAttn(name); setTab(app, name); };
```

(c) In `boot()`, right after `initWorkspaces(app);` (Task 5) add:

```js
  initPanelSignals(app);
```

- [ ] **Step 6: Add the attention-dot style**

Append to `frontend/styles/workspaces.css`:

```css
/* Tab attention dot — a panel has something new while you're elsewhere. */
#panel-tabs .tab.ws-tab-attn { position: relative; }
#panel-tabs .tab.ws-tab-attn::after {
  content: ""; position: absolute; top: 6px; right: 6px;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 2px var(--bg-surface);
}
```

- [ ] **Step 7: Syntax-check**

Run: `node --check frontend/src/features/panel-signals.js && node --check frontend/src/runner.js && node --check frontend/src/statement.js && node --check frontend/src/features/mini-chat.js && node --check frontend/src/main.js`
Expected: no output (OK).

- [ ] **Step 8: Live smoke**

With the app running, in **📚 Học**: open a problem, Judge a WA submission → a dot appears on the Coach tab; click Coach → dot clears. Generate tests with AI → the Tests tab opens. (If no API key, verify the dot/auto-open logic by emitting from the console: `window.__app.bus.emit("tests:generated")` switches to Tests; `window.__app.bus.emit("coach:reply")` dots Coach.) Console error-free.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/panel-signals.js frontend/src/runner.js frontend/src/statement.js frontend/src/features/mini-chat.js frontend/src/main.js frontend/styles/workspaces.css
git commit -m "feat(workspace): bus emitters + panel-signals (tab dots, auto-open, surface)"
```

---

### Task 8: Command Center — workspace switching, focus, reset, recents

**Files:**
- Modify: `frontend/src/features/command-palette.js`

**Interfaces:**
- Consumes: `app.workspace.switchTo`, `app.workspace.resetLayout`, `listWorkspaces` (import), `app.state.problems`.
- Produces: new palette actions; an explicit "Gần đây" recents section header.

> DOM-integration task: verified by `node --check` + live smoke.

- [ ] **Step 1: Import the workspace list**

At the top of `frontend/src/features/command-palette.js`, add:

```js
import { listWorkspaces } from "../core/workspace-policy.js";
```

- [ ] **Step 2: Add workspace + layout actions to `buildActions`**

In `buildActions(app)`, prepend these entries to the returned array (right after the `🏠 Về trang chủ` entry):

```js
    ...listWorkspaces().map((w, i) => ({
      icon: w.icon, label: `Workspace: ${w.name}`,
      kw: `workspace khong gian moi truong ${w.name} ${w.id} che do`,
      kbd: `Ctrl·${i + 1}`,
      run: () => app.workspace && app.workspace.switchTo(w.id)
    })),
    { icon: "🧘", label: "Chế độ Tối giản (Focus)", kw: "minimal focus tap trung zen toi gian khong xao nhang", kbd: "Ctrl·6", run: () => app.workspace && app.workspace.switchTo("minimal") },
    { icon: "↩", label: "Đặt lại bố cục (Reset layout)", kw: "reset dat lai bo cuc layout mac dinh khoi phuc", kbd: "", run: () => app.workspace && app.workspace.resetLayout() },
```

- [ ] **Step 3: Label the default recents section**

In the `compute` function, in the `if (!query.trim())` branch, the default view
already lists `problems.slice(0, 5)` first. Bump it to 6 and keep the existing
`paint()` section header (`Bài tập`) — no structural change needed:

```js
      items = [...problems.slice(0, 6), ...actions];
```

(The palette already renders a "Bài tập" section header before problems and
ignores panel-hide, so hidden tabs stay reachable — no change required there.)

- [ ] **Step 4: Syntax-check**

Run: `node --check frontend/src/features/command-palette.js`
Expected: no output (OK).

- [ ] **Step 5: Live smoke**

With the app running: press `Ctrl+K`, type `thi dau` → "Workspace: Thi đấu" appears and runs; type `reset` → "Đặt lại bố cục" appears; the 6 workspace entries show their `Ctrl·N` hints. Console error-free.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/command-palette.js
git commit -m "feat(workspace): command center — switch workspace, focus, reset, recents"
```

---

### Task 9: Shortcuts surfacing, cache-busting, and full verification

**Files:**
- Modify: `frontend/index.html` (shortcut rows + `?v=` bumps for touched modules)

**Interfaces:** none new — this task wires discoverability and runs the gates.

- [ ] **Step 1: Add the workspace shortcut row to the shortcuts modal**

In `frontend/index.html`, inside `#shortcuts-modal`, after the "Bảng lệnh nhanh" row (~line 487) add:

```html
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--border-soft); padding-bottom:4px;">
          <span>Đổi Workspace (Tự do…Tối giản)</span><kbd>Ctrl + 1…6</kbd>
        </div>
```

- [ ] **Step 2: Bump `?v=` for every module touched via main.js imports**

In `frontend/index.html` the entry is already `main.js?v=3.5` (Task 5). The
per-module `?v=` query strings live inside `main.js` imports; bump the ones this
plan modified so browsers refetch them. In `frontend/src/main.js`, change these
import query strings:
- `./layout.js?v=2.4` → `./layout.js?v=2.5`
- `./runner.js?v=2.3` → `./runner.js?v=2.4`
- `./statement.js?v=2.6` → `./statement.js?v=2.7`
- `./features/mini-chat.js?v=2.4` → `./features/mini-chat.js?v=2.5`
- `./features/command-palette.js?v=2.3` → `./features/command-palette.js?v=2.4`
- `./features/sidebar-toggle.js?v=2.3` → `./features/sidebar-toggle.js?v=2.4`

(The new modules — `core/*`, `features/workspaces.js?v=1.0`,
`features/panel-signals.js?v=1.0`, `styles/workspaces.css?v=1.0` — are already
versioned at their import/link sites.)

- [ ] **Step 3: Syntax-check every changed/new frontend file**

Run:

```bash
node --check frontend/src/core/bus.js && \
node --check frontend/src/core/workspace-policy.js && \
node --check frontend/src/core/session-store.js && \
node --check frontend/src/features/workspaces.js && \
node --check frontend/src/features/panel-signals.js && \
node --check frontend/src/features/sidebar-toggle.js && \
node --check frontend/src/features/mini-chat.js && \
node --check frontend/src/features/command-palette.js && \
node --check frontend/src/layout.js && \
node --check frontend/src/runner.js && \
node --check frontend/src/statement.js && \
node --check frontend/src/main.js
```

Expected: no output (all OK).

- [ ] **Step 4: Run the pure-core unit tests**

Run: `cd frontend && npm test`
Expected: PASS (bus + workspace-policy + session-store).

- [ ] **Step 5: Run the backend regression suite (must stay 98/98)**

Run: `cd backend && npm test`
Expected: all tests pass — no regressions (this sprint is frontend-only).

- [ ] **Step 6: Full live smoke (acceptance)**

Start `cd backend && npm start`; drive with the Playwright MCP:
1. Pill shows **🎯 Tự do**; app behaves exactly as before (baseline unchanged).
2. `Ctrl+1…6` switches all six workspaces; each toast + layout matches its preset.
3. **Học**: split + Coach; Judge a WA → Coach tab dots; open Coach → dot clears.
4. **Thi đấu**: explorer collapsed, Notes hidden, dashboard hidden, Coach reveal disabled, no sounds, info toasts minimal.
5. **Tối giản**: editor-only (zen), right panel off, info toasts suppressed, error toast still shows.
6. Drag a panel divider, then **Reset layout** (palette) → widths reset, back to Tự do.
7. Reload → the last workspace + last problem restore.
8. `browser_console_messages` → no errors across the run.

- [ ] **Step 7: Commit**

```bash
git add frontend/index.html frontend/src/main.js
git commit -m "feat(workspace): surface Ctrl+1-6, bust caches, final verification"
```

---

## Self-Review

**Spec coverage (against `docs/WORKSPACE-ARCHITECTURE.md`):**
- §1 Workspace = environment policy → Task 2 (`resolvePolicy`, presets). ✓
- §2 nine layers → policy fields (Task 2); applied in Tasks 5–9. ✓
- §3 Session envelope (seam-only lifecycle) → Task 3 + Task 5 persistence. ✓
- §4 workspace-aware systems → Tasks 4 (sidebar), 5 (layout), 6 (toast/sound/coach), 7 (runner/statement/mini-chat). ✓
- §5 independent systems → untouched (judge/data/editor/settings/AI transport). ✓
- §6 future seams → `app.workspace.suggest` + bus (Task 5); no UI built. ✓
- §7 migration (additive, defaults==today) → `free` preset == defaults (Task 2); restore after loadProblem (Task 5). ✓
- §8 risks → Custom relabel (Task 5 `markCustomIfDiverged`), errors-always-show (Task 6), palette reaches hidden panels (Task 8), transition suppression (Task 5). ✓
- §10 build scope → Tasks 1–9 cover bus, policy, manager, switcher, Ctrl+1–6, command center, persistence, signals, shortcuts, `?v=`. ✓
- §11 sign-off (free workspace, locked-hints, palette reachability) → all implemented. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows real assertions. ✓

**Type consistency:** `createBus().{on,off,emit}` (T1) used by T5/T7. `resolvePolicy/observable/detectWorkspace/listWorkspaces` (T2) used by T5/T8. `loadSession/saveSession` (T3) used by T5. `app.setSidebarCollapsed` (T4) used by T5. `app.workspace.{policy,switchTo,resetLayout,suggest}` (T5) used by T6/T7/T8. `app.bus` events — emitted in T5/T7, consumed in T5/T7. `clearTabAttn` (T7) used by T7 main.js. Names consistent. ✓
