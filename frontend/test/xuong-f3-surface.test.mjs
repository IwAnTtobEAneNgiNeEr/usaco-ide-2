// F3 · load behaviour, long-trace caps, golden snapshots and the five-project
// pipeline.
//
// These exercise the SAME path the workbench uses: contract payload →
// normalize → previewModel → renderPreview, plus the anchor/replay adapters.
// They are Node-level integration tests over the real modules, not a browser
// E2E — no DOM is involved and no backend is contacted.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import {
  normalizeRun, normalizeObservable, normalizeRecipe, normalizeReplay,
  previewModel, replayModel, anchorTargets, normalizeProject,
} from "../src/core/xuong-v2-model.js";
import { renderPreview } from "../src/features/xuong-preview.js";

const golden = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/xuong-contract-v2.json", import.meta.url), "utf8")
);
const F = golden.fixtures;
const SNAPSHOT_URL = new URL("./fixtures/xuong-preview-snapshots.json", import.meta.url);

const modelOf = (fixture) => previewModel({
  run: normalizeRun(fixture.run),
  observable: normalizeObservable(fixture.observable),
  recipe: normalizeRecipe(fixture.recipe),
});

// --- lazy load ---------------------------------------------------------------

test("F3 the Xuong feature does not statically import the Preview Surface", () => {
  const source = readFileSync(new URL("../src/features/xuong.js", import.meta.url), "utf8");
  assert.equal(/^import[^\n]*xuong-preview\.js/m.test(source), false,
    "a static import would make every Luyen tap session pay for the renderers");
  // The cache-busting `?v=` suffix is part of the repo's release convention.
  assert.match(source, /await import\(["']\.\/xuong-preview\.js(\?v=[\d.]+)?["']\)/,
    "the surface must be pulled in on demand");
});

test("F3 the surface loads on demand and is cached for later paints", async () => {
  const feature = await import("../src/features/xuong.js");
  const first = await feature.ensurePreviewSurface();
  const second = await feature.ensurePreviewSurface();
  assert.equal(typeof first, "function");
  assert.equal(first, second, "the module must be fetched once, not per paint");
  assert.match(first(modelOf(F.mazeUserFail)), /xp-surface/);
});

// --- long traces --------------------------------------------------------------

function longTrace(count) {
  const raw = structuredClone(F.mazeUserFail);
  const entities = [];
  const events = [];
  for (let index = 0; index < count; index += 1) {
    entities.push({
      id: `cell-${index}`, kind: "cell", display: { label: `O so ${index}` },
      state: { step: index }, geometry: { x: index % 20, y: Math.floor(index / 20) },
    });
    events.push({
      id: `event-${index}`, index, kind: "visit", display: { label: `Buoc ${index}` },
      entityIds: [`cell-${index}`], changedFields: [], anchorIds: [],
    });
  }
  raw.observable.entities = entities;
  raw.observable.events = events;
  raw.observable.anchors = [];
  raw.observable.cursor = count;
  raw.run.eventCount = count;
  raw.recipe.overlays = raw.recipe.overlays.filter((o) => o.kind !== "error-anchor");
  return raw;
}

test("F3 a 500-event trace is capped when painted and says how much is hidden", () => {
  const raw = longTrace(500);
  raw.recipe.base = { kind: "timeline", display: { label: "Dong thoi gian" } };
  raw.recipe.overlays = [];
  const model = modelOf(raw);
  assert.equal(model.available, true);
  const html = renderPreview(model);
  const painted = (html.match(/data-xp-tick=/g) || []).length;
  assert.ok(painted > 0 && painted <= 120, `timeline painted ${painted} ticks — cap not applied`);
  assert.match(html, /còn \d+ mốc diễn biến/, "the student must be told the trace is longer than the paint");
  // The cap is a paint budget only: the cursor still addresses the full trace.
  assert.equal(model.totalEvents, 500);
});

test("F3 long sequence and table paints stay bounded too", () => {
  for (const [base, marker, cap] of [["sequence", /data-xp-seq-slot=/g, 80], ["table", /data-xp-entity="cell-/g, 100]]) {
    const raw = longTrace(400);
    raw.recipe.base = { kind: base, display: { label: base } };
    raw.recipe.overlays = [];
    const html = renderPreview(modelOf(raw));
    const painted = (html.match(marker) || []).length;
    assert.ok(painted > 0 && painted <= cap, `${base} painted ${painted}, cap ${cap}`);
    assert.match(html, /Chỉ vẽ phần đang xem/);
  }
});

test("F3 the painted window follows the cursor instead of always showing the head", () => {
  const raw = longTrace(400);
  raw.recipe.base = { kind: "sequence", display: { label: "Chuoi" } };
  raw.recipe.overlays = [];
  raw.observable.cursor = 300;
  const html = renderPreview(previewModel({
    run: normalizeRun(raw.run),
    observable: normalizeObservable(raw.observable),
    recipe: normalizeRecipe(raw.recipe),
  }));
  assert.match(html, /data-xp-seq-slot="cell-3\d\d"/, "the window must contain the cursor neighbourhood");
  assert.equal(/data-xp-seq-slot="cell-0"/.test(html), false, "and must not be pinned to the start");
});

// --- golden snapshots ---------------------------------------------------------
//
// A structural snapshot of every base: the shape of what gets painted. Refresh
// deliberately with UPDATE_PREVIEW_SNAPSHOTS=1 and read the diff — an
// unexplained change here means a base silently stopped drawing.

const BASES = ["grid", "graph", "tree", "sequence", "table", "timeline", "chart",
  "text", "geometry", "state-machine", "request-response", "runtime-resource", "universal-inspector"];

function shapeOf(html) {
  const tag = (re) => (html.match(re) || []).length;
  return {
    surface: tag(/class="xp-surface"/g),
    svg: tag(/<svg/g),
    nodes: tag(/data-xp-entity=/g),
    rows: tag(/<tr/g),
    ticks: tag(/data-xp-tick=/g),
    bars: tag(/data-xp-bar=|data-xp-meter=/g),
    texts: tag(/data-xp-text=/g),
    exchanges: tag(/data-xp-exchange=/g),
    inspector: tag(/class="xp-inspector"/g),
    anchors: tag(/data-xp-anchor=/g),
    scrub: tag(/data-xp-scrub/g),
  };
}

test("F3 golden snapshot: every base paints the shape it is supposed to", () => {
  const actual = {};
  for (const base of BASES) {
    const raw = structuredClone(F.mazeUserFail);
    raw.recipe.base = { kind: base, display: { label: base } };
    raw.recipe.overlays = raw.recipe.overlays.filter((o) => o.kind === "error-anchor");
    if (base === "runtime-resource") {
      raw.observable.metrics.push({ id: "mem", display: { label: "Bo nho da dung" }, value: 12, unit: "MB" });
    }
    const model = modelOf(raw);
    assert.equal(model.available, true, `${base} recipe must be legal`);
    actual[base] = shapeOf(renderPreview(model));
  }

  if (process.env.UPDATE_PREVIEW_SNAPSHOTS === "1" || !existsSync(SNAPSHOT_URL)) {
    writeFileSync(SNAPSHOT_URL, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8"));
  assert.deepEqual(actual, expected);

  // The snapshot must never record a base that draws nothing at all.
  for (const base of BASES) {
    const shape = actual[base];
    const drew = shape.svg || shape.rows || shape.ticks || shape.bars || shape.texts || shape.exchanges || shape.inspector;
    assert.ok(drew > 0, `${base} painted an empty surface`);
  }
});

// --- five-project pipeline ----------------------------------------------------

const PROJECTS = [
  { name: "MazeNavigator", base: "grid" },
  { name: "RouteWatch", base: "graph" },
  { name: "MergeForge", base: "sequence" },
  { name: "ShardBalancer", base: "chart" },
  { name: "LogMatcher", base: "text" },
];

test("F3 all five trusted projects go payload to preview to anchor to replay", () => {
  for (const { name, base } of PROJECTS) {
    const raw = structuredClone(F.mazeUserFail);
    raw.recipe.base = { kind: base, display: { label: base } };
    raw.recipe.overlays = raw.recipe.overlays.filter((o) => o.kind === "error-anchor");
    if (base === "chart") raw.observable.metrics.push({ id: "total", display: { label: "Tong" }, value: 20 });

    const model = modelOf(raw);
    assert.equal(model.available, true, `${name}: preview must be available`);
    const html = renderPreview(model);
    assert.match(html, /xp-surface/, `${name}: no surface`);

    // The behaviour error is reachable and points at code.
    assert.equal(model.anchors.length, 1, `${name}: expected one anchor`);
    assert.match(html, /data-xp-anchor=/, `${name}: anchor is not clickable`);
    const project = normalizeProject(F.mazeUserFail.project);
    const targets = anchorTargets(normalizeObservable(raw.observable), project);
    assert.equal(targets.length, 1, `${name}: anchor must resolve to a source mapping`);
    assert.ok(targets[0].jump.filePath, `${name}: anchor has no file to open`);
    assert.ok(targets[0].jump.span, `${name}: anchor has no span to select`);

    // Replay addresses the same trace and keeps its length.
    const frame = replayModel(normalizeReplay(F.mazeUserFail.replay));
    assert.equal(frame.totalEvents, 2, `${name}: replay must not shrink the trace`);
    assert.equal(frame.observable.cursor, 1);

    // Provenance: a user run is never presented as the inert reference.
    const run = normalizeRun(raw.run);
    assert.equal(run.provenance, "user-source", `${name}: wrong provenance`);
    assert.equal(run.isReference, false);
    assert.equal(model.reference === true, false, `${name}: a user run must not render as reference`);

    // No technical identifier may reach the painted text.
    const shown = html.replace(/<[^>]*>/g, " ");
    for (const leak of ["trusted:", "seedId", "BASE", "OVERLAY", "E:\\", ":5050", "sha256"]) {
      assert.equal(shown.includes(leak), false, `${name}: leaked "${leak}"`);
    }
  }
});
