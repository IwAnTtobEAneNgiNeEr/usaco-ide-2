// Preview combination catalog — render proof.
//
// The backend decides which PreviewRecipes an ObservableModel can honestly
// support. This suite asks the harder question: does the real PreviewSurface
// actually DRAW each of those combinations?
//
// A catalogued combination only counts when the surface renders its own base
// projection (not the inspector fallback), shows one legend entry per overlay,
// leaks no internal enum or `undefined`, and produces different markup from the
// same recipe with the overlays removed. Anything that fails those checks is a
// number on a slide, not a design — and this file fails instead of counting it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeRun, normalizeObservable, normalizeRecipe, previewModel } from "../src/core/xuong-v2-model.js";
import { renderPreview } from "../src/features/xuong-preview.js";

const catalog = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/xuong-preview-catalog.json", import.meta.url), "utf8"),
);

// The Vietnamese copy ships with the fixture: the surface must show exactly
// what a live run would show, so the label table has one owner (the backend
// catalog) and this suite never keeps its own.
const { base: BASE_LABEL, overlay: OVERLAY_LABEL, layout: LAYOUT_LABEL, control: CONTROL_LABEL } = catalog.labels;

function composeRecipe(entry) {
  return {
    schemaVersion: "xuong.preview-recipe.v2",
    base: { kind: entry.b, display: { label: BASE_LABEL[entry.b] } },
    overlays: entry.v.map((kind) => ({ kind, display: { label: OVERLAY_LABEL[kind] } })),
    controlPack: { kind: entry.c, display: { label: CONTROL_LABEL[entry.c] } },
    layout: { kind: entry.l, display: { label: LAYOUT_LABEL[entry.l] } },
    inspector: { alwaysAvailable: true, display: { label: "Chi tiết lần chạy" } },
  };
}

const runs = new Map();
function runFor(observableId, observable) {
  if (!runs.has(observableId)) {
    runs.set(observableId, normalizeRun({
      type: "scenario-run", id: `run-${observableId}`, projectId: "catalog", scenarioId: observable.scenario.id,
      status: "completed", provenance: "user-source", startedAt: "2026-07-24T00:00:00.000Z",
      durationMs: 1200, eventCount: observable.events.length, diagnostics: [],
      outputSummary: "Scenario đã chạy.", sourceRevision: "sha256:catalog",
    }));
  }
  return runs.get(observableId);
}

const observables = new Map();
function observableFor(id) {
  if (!observables.has(id)) observables.set(id, normalizeObservable(catalog.observables[id].observable));
  return observables.get(id);
}

function render(entry) {
  const observable = observableFor(entry.o);
  return renderPreview(previewModel({
    run: runFor(entry.o, observable),
    observable,
    recipe: normalizeRecipe(composeRecipe(entry)),
  }));
}

const visibleText = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Internal vocabulary that must never reach a student's screen.
const LEAKED_ENUM = /\b(error-anchor|resource-usage|selection-range|state-machine|request-response|runtime-resource|universal-inspector|schemaVersion|controlPack|observableId|sourceMappingId)\b/;

test("catalog fixture is current with the registry", () => {
  assert.equal(catalog.schemaVersion, "xuong.preview-catalog.v1");
  assert.ok(catalog.entries.length > 0);
  assert.equal(catalog.stats.total, catalog.entries.length);
});

test("every catalogued combination renders its own base projection", () => {
  const failures = [];
  for (const entry of catalog.entries) {
    const html = render(entry);
    if (!html.includes(`data-xp-base="${entry.b}"`)) { failures.push([entry, "thiếu base"]); continue; }
    if (!html.includes(`data-xp-layout="${entry.l}"`)) { failures.push([entry, "thiếu layout"]); continue; }
    // A drawn base always gets the collapsible inspector panel underneath it;
    // when the projection returns nothing the inspector BECOMES the stage and
    // the panel is absent. That is the fallback this catalog must not count.
    if (entry.b !== "universal-inspector" && !html.includes("xp-inspector-panel")) {
      failures.push([entry, "base không vẽ được, rơi về inspector"]);
    }
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length}/${catalog.entries.length} tổ hợp không vẽ được base`);
});

test("every overlay in a recipe appears exactly once in the legend", () => {
  const failures = [];
  for (const entry of catalog.entries) {
    const html = render(entry);
    for (const kind of entry.v) {
      const marks = html.split(`data-xp-overlay="${kind}"`).length - 1;
      if (marks !== 1) failures.push([entry, kind, marks]);
    }
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length} overlay không có đúng một mục chú giải`);
});

test("adding overlays changes what the surface draws", () => {
  const failures = [];
  for (const entry of catalog.entries) {
    if (!entry.v.length) continue;
    const bare = render({ ...entry, v: [] });
    if (render(entry) === bare) failures.push(entry);
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length} tổ hợp vẽ y hệt bản không overlay`);
});

test("no combination leaks an internal enum, undefined or a null value", () => {
  const failures = [];
  for (const entry of catalog.entries) {
    const shown = visibleText(render(entry));
    if (LEAKED_ENUM.test(shown)) failures.push([entry, "rò enum"]);
    else if (/\bundefined\b|\[object Object\]/.test(shown)) failures.push([entry, "rò undefined"]);
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length} tổ hợp rò dữ liệu kỹ thuật`);
});

test("a stepper combination shows the replay strip and a none combination does not", () => {
  const withStepper = catalog.entries.find((entry) => entry.c === "stepper");
  const withoutStepper = catalog.entries.find((entry) => entry.c === "none" && entry.o === withStepper.o && entry.b === withStepper.b);
  assert.ok(render(withStepper).includes("data-xp-scrub"));
  assert.equal(render(withoutStepper).includes("data-xp-scrub"), false);
});

test("the catalog covers every projection base with a real design behind it", () => {
  const bases = new Set(catalog.entries.map((entry) => entry.b));
  assert.equal(bases.size, 13, `mới phủ ${bases.size}/13 base`);
  for (const base of bases) {
    const sources = new Set(catalog.entries.filter((entry) => entry.b === base).map((entry) => entry.o));
    assert.ok(sources.size >= 1, `base ${base} không có observable nào đứng sau`);
  }
});

test("catalogued combinations are distinct: no two entries render the same markup for one run", () => {
  const seen = new Map();
  const collisions = [];
  for (const entry of catalog.entries) {
    const key = `${entry.o}|${render(entry)}`;
    if (seen.has(key)) collisions.push([seen.get(key), entry]);
    else seen.set(key, entry);
  }
  assert.deepEqual(collisions.slice(0, 3), [], `${collisions.length} tổ hợp trùng hệt nhau khi vẽ`);
});
