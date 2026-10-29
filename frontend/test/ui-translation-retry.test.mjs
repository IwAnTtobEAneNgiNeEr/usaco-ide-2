import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.js?v=2.2";
import { initLanguage } from "../src/i18n.js";

function setup(t) {
  const saved = { document: globalThis.document, localStorage: globalThis.localStorage, NodeFilter: globalThis.NodeFilter, MutationObserver: globalThis.MutationObserver, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, aiTranslateUi: api.aiTranslateUi };
  t.after(() => { Object.assign(globalThis, { document: saved.document, localStorage: saved.localStorage, NodeFilter: saved.NodeFilter, MutationObserver: saved.MutationObserver, setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout }); api.aiTranslateUi = saved.aiTranslateUi; });
  const fragment = { nodeValue: "Đây là văn bản giao diện", isConnected: true, parentElement: { closest: () => null } };
  const timers = new Map();
  let next = 0;
  let observer;
  globalThis.setTimeout = (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.localStorage = { getItem: () => "en", setItem: () => {} };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.MutationObserver = class { constructor(callback) { observer = callback; } observe() {} };
  globalThis.document = {
    documentElement: { dataset: {} }, body: {}, querySelectorAll: () => [],
    createTreeWalker: () => { let read = false; return { nextNode: () => read ? null : (read = true, fragment) }; },
    getElementById: () => null, dispatchEvent: () => {},
  };
  globalThis.CustomEvent ||= class {};
  const app = { state: {}, el: {} };
  initLanguage(app);
  return { app, fragment, timers, mutate: () => observer(), async tick() { const item = timers.entries().next().value; if (!item) return false; timers.delete(item[0]); item[1].fn(); for (let i = 0; i < 8; i++) await Promise.resolve(); return true; } };
}

test("malformed provider results have bounded retries despite repeated DOM mutations and can recover", async (t) => {
  const ui = setup(t);
  let calls = 0;
  api.aiTranslateUi = async () => { calls++; return {}; };
  await ui.app.setUiLanguage("en");
  const delays = [];
  for (let i = 0; i < 10; i++) {
    ui.mutate();
    if (ui.timers.size) delays.push(ui.timers.values().next().value.delay);
    await ui.tick();
  }
  assert.equal(calls, 3);
  assert.deepEqual(delays, [180, 500, 1000]);
  assert.equal(ui.timers.size, 0);
  api.aiTranslateUi = async () => ({ translations: ["A translated interface fragment"] });
  ui.app.refreshUiTranslations();
  await ui.tick();
  assert.equal(ui.fragment.nodeValue, "A translated interface fragment");
});

test("429 and 5xx stop after three attempts, while missing key stops immediately", async (t) => {
  const ui = setup(t);
  for (const [code, expected] of [["RATE_LIMIT", 3], ["SERVER_ERROR", 3], ["NO_KEY", 1]]) {
    let calls = 0;
    api.aiTranslateUi = async () => { calls++; throw Object.assign(new Error("synthetic provider error"), { data: { code } }); };
    ui.app.refreshUiTranslations();
    for (let i = 0; i < 6; i++) { ui.mutate(); await ui.tick(); }
    assert.equal(calls, expected, code);
    assert.equal(ui.timers.size, 0);
  }
});

test("changing settings aborts the old request and permits a new translation", async (t) => {
  const ui = setup(t);
  let aborted = false;
  api.aiTranslateUi = (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
  });
  ui.app.refreshUiTranslations();
  await ui.tick();
  api.aiTranslateUi = async () => ({ translations: ["Fresh translated interface"] });
  ui.app.refreshUiTranslations();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await ui.tick();
  assert.equal(aborted, true);
  assert.equal(ui.fragment.nodeValue, "Fresh translated interface");
});
