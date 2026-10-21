import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createBus } from "../src/core/bus.js";
import { resolvePolicy, listWorkspaces, getPreset, detectWorkspace } from "../src/core/workspace-policy.js";
import { loadSession, saveSession } from "../src/core/session-store.js";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const [main, layout, workspaces] = await Promise.all([
  read("../src/main.js"), read("../src/layout.js"), read("../src/features/workspaces.js")
]);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function element(dataset = {}) {
  const classes = new Set();
  const listeners = new Map();
  return {
    dataset, style: {}, offsetWidth: 1,
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name); else classes.delete(name);
      }
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    click() { listeners.get("click")?.({ target: this }); }
  };
}

// Execute the real boot, tab handlers and workspace restore. Only unrelated
// feature initializers and API work are stubbed; deferred promises control the
// exact interleaving without timers, network, an application server or a Judge.
function startBoot({ pause = "problems", preset = "free" } = {}) {
  const started = deferred(), pending = deferred();
  const names = ["run", "tests", "notes", "coach", "history", "settings"];
  const tabs = names.map((tab) => element({ tab }));
  const bodies = names.map((panel) => element({ panel }));
  const workbench = element(), panelColumn = element();
  const values = new Map([
    ["usaco2.activeTab", "run"],
    ["usaco2.session.v1", JSON.stringify({ workspaceId: preset })]
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const document = {
    documentElement: element(), body: element(),
    getElementById: () => null,
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".workbench") return workbench;
      if (selector === ".col-panel") return panelColumn;
      if (selector.startsWith(".workbench.")) {
        return workbench.classList.contains(selector.slice(11)) ? workbench : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#panel-tabs .tab") return tabs;
      if (selector === ".panel-body") return bodies;
      return [];
    }
  };
  const app = {
    state: { activeTab: "run", tabRevision: 0, settings: {}, problems: [] },
    el: { panelTabs: { querySelectorAll: () => tabs }, metaModal: element() },
    bus: createBus(),
    applyTheme() {}, toggleGlobalParticles() {}, setCompilerPill() {}, toast() {}, clearEditor() {},
    setLayoutMode(mode) { app.state.layoutMode = mode; },
    setSidebarCollapsed(on) { workbench.classList.toggle("sb-collapsed", on); },
    toggleZenMode() { workbench.classList.toggle("zen-mode"); },
    async refreshProblems() {
      if (pause === "problems") { started.resolve(); await pending.promise; }
      app.state.problems = [{ id: "example" }];
    },
    async loadProblem() {
      if (pause === "problem") { started.resolve(); await pending.promise; }
    }
  };
  const noop = () => {};
  const context = vm.createContext({
    app, document, window: { localStorage: storage }, localStorage: storage,
    resolvePolicy, listWorkspaces, getPreset, detectWorkspace, loadSession, saveSession,
    clearTabAttn: noop, collectRefs: noop, markEditorDegraded: noop,
    initGlobalParticles: noop, initMetaModal: noop, initShortcuts: noop,
    initDropGuard: noop, initAnimationThrottle: noop, initAiActivity: noop,
    api: { getSettings: async () => ({ settings: {} }), health: async () => ({}) }
  });
  for (const match of main.matchAll(/^import \{ ([^}]+) \}/gm)) {
    for (const name of match[1].split(",").map((part) => part.trim())) {
      if (!(name in context) && name !== "initLayout" && name !== "initWorkspaces") context[name] = noop;
    }
  }
  context.mountCmEditor = async () => true;
  context.initSettings = async () => {
    if (pause === "settings") { started.resolve(); await pending.promise; }
  };
  const asScript = (source) => source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  vm.runInContext(asScript(layout), context, { filename: "layout.js" });
  vm.runInContext(asScript(workspaces), context, { filename: "workspaces.js" });
  vm.runInContext(main.slice(main.indexOf("app.setTab ="), main.indexOf("app.setView =")), context);
  const boot = main.slice(main.indexOf("async function boot() {"), main.lastIndexOf("\nboot();"));
  vm.runInContext(`${boot}\nglobalThis.finished = boot();`, context, { filename: "main.js" });
  return { app, tabs, bodies, storage, panelColumn, workbench, started: started.promise,
    release: pending.resolve, finished: context.finished };
}

for (const pause of ["settings", "problems", "problem"]) {
  test(`History selection survives bootstrap waiting for ${pause}`, async () => {
    const boot = startBoot({ pause, preset: "learning" });
    await boot.started;
    boot.tabs.find((tab) => tab.dataset.tab === "history").click();
    boot.release();
    await boot.finished;
    assert.equal(boot.app.state.activeTab, "history");
    assert.equal(boot.storage.getItem("usaco2.activeTab"), "history");
    assert.equal(boot.app.workspace.current, "custom");
    assert.equal(boot.bodies.find((body) => body.dataset.panel === "history").classList.contains("hidden"), false);
    // A later explicit workspace choice still gets its normal tab behaviour.
    boot.app.workspace.switchTo("learning");
    assert.equal(boot.app.state.activeTab, "coach");
  });
}

test("uninterrupted bootstrap still restores the saved workspace tab", async () => {
  const boot = startBoot({ preset: "learning" });
  await boot.started;
  boot.release();
  await boot.finished;
  assert.equal(boot.app.state.activeTab, "coach");
  assert.equal(boot.app.workspace.current, "learning");
});

test("a stale minimal-workspace restore cannot hide the newly selected History panel", async () => {
  const boot = startBoot({ preset: "minimal" });
  await boot.started;
  boot.tabs.find((tab) => tab.dataset.tab === "history").click();
  boot.release();
  await boot.finished;
  assert.equal(boot.app.state.activeTab, "history");
  assert.equal(boot.tabs.find((tab) => tab.dataset.tab === "history").classList.contains("ws-tab-hidden"), false);
  assert.equal(boot.panelColumn.classList.contains("ws-panel-off"), false);
  assert.equal(boot.workbench.classList.contains("zen-mode"), false);
  assert.equal(boot.app.workspace.current, "custom");
});

test("uninterrupted bootstrap still restores the minimal workspace visibility", async () => {
  const boot = startBoot({ preset: "minimal" });
  await boot.started;
  boot.release();
  await boot.finished;
  assert.equal(boot.panelColumn.classList.contains("ws-panel-off"), true);
  assert.equal(boot.workbench.classList.contains("zen-mode"), true);
});
