// PreviewSurface renderer contract (Agent A · A1/A5).
//
// The surface renders to an HTML string so it is testable without a DOM: one
// surface, one recipe interpreter, every base fed by the SAME golden fixture at
// docs/fixtures/xuong-contract-v2.json. No per-algorithm renderer exists.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  normalizeRun, normalizeObservable, normalizeRecipe, previewModel,
} from "../src/core/xuong-v2-model.js";
import { renderPreview } from "../src/features/xuong-preview.js";

const golden = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/xuong-contract-v2.json", import.meta.url), "utf8")
);
const F = golden.fixtures;

const modelOf = (fixture) => previewModel({
  run: normalizeRun(fixture.run),
  observable: normalizeObservable(fixture.observable),
  recipe: normalizeRecipe(fixture.recipe),
});

const visibleText = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// --- Honest empty / failure states ------------------------------------------

test("with no run the surface invites a run and never claims one is happening", () => {
  const html = renderPreview(previewModel({ run: null, observable: null, recipe: null }));
  const shown = visibleText(html).toLowerCase();
  assert.ok(shown.includes("chưa chạy"));
  assert.equal(shown.includes("đang chạy"), false);
  assert.equal(html.includes("<svg"), false);
});

test("a compile error shows the diagnostic instead of a fabricated preview", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.run.status = "compile-error";
  raw.run.diagnostics = [{ severity: "error", message: "thiếu dấu ; ở cuối câu lệnh", filePath: "MazeNavigator.cpp" }];
  const html = renderPreview(previewModel({ run: normalizeRun(raw.run), observable: null, recipe: null }));
  assert.ok(visibleText(html).includes("thiếu dấu ; ở cuối câu lệnh"));
  assert.equal(html.includes("<svg"), false);
});

test("an invalid recipe is reported, not silently repaired", () => {
  const model = previewModel({
    run: normalizeRun(F.mazeUserFail.run),
    observable: normalizeObservable(F.routeWatchGraph.observable), // no anchors
    recipe: normalizeRecipe(F.mazeUserFail.recipe),                // wants error-anchor
  });
  const html = renderPreview(model);
  assert.equal(model.available, false);
  assert.ok(visibleText(html).includes("Không có điểm lỗi nào để đánh dấu."));
  assert.equal(html.includes("<svg"), false);
});

// --- Grid: the mandatory non-list proof -------------------------------------

test("grid base draws one cell per positioned entity", () => {
  const html = renderPreview(modelOf(F.mazeUserFail));
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes('data-xp-base="grid"'));
  assert.equal((html.match(/data-xp-entity="cell-2-2"/g) || []).length, 1);
  assert.ok(html.includes("xp-grid-axis"), "a spatial grid needs readable row/column coordinates");
});

test("grid error-anchor overlay marks the anchored cell as a clickable jump target", () => {
  const html = renderPreview(modelOf(F.mazeUserFail));
  assert.ok(html.includes('data-xp-anchor="anchor-blocked-cell"'));
  assert.ok(visibleText(html).includes("Ô bị chặn vẫn được thêm vào tuyến"));
});

test("grid can show a labelled numeric field and an explicit product glyph without leaking state keys", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.observable.entities[0].state = { badge: "R", distance: 7 };
  raw.observable.events[0].changedFields.push({
    entityId: raw.observable.entities[0].id,
    fieldId: "distance",
    display: { label: "Khoảng cách tới đích" },
    before: null,
    after: 7,
  });
  const html = renderPreview(modelOf(raw));
  assert.ok(html.includes("xp-cell-badge"));
  assert.ok(visibleText(html).includes("R"));
  assert.equal(visibleText(html).includes("distance"), false);
  assert.equal(visibleText(html).includes("badge"), false);

  raw.observable.entities[0].state = { distance: 7 };
  const valueHtml = renderPreview(modelOf(raw));
  assert.ok(valueHtml.includes("xp-cell-value"));
  assert.ok(visibleText(valueHtml).includes("7"));
});

// --- Graph: second base on the same surface ---------------------------------

test("graph base draws nodes and their relation without any algorithm-specific code", () => {
  const html = renderPreview(modelOf(F.routeWatchGraph));
  assert.ok(html.includes('data-xp-base="graph"'));
  assert.ok(html.includes('data-xp-entity="node-a"'));
  assert.ok(html.includes('data-xp-entity="node-b"'));
  assert.ok(html.includes('data-xp-relation="edge-a-b"'));
});

test("sequence, table, timeline and chart projections reuse the same surface", () => {
  const cases = [
    ["sequence", "data-xp-base=\"sequence\"", "Dòng log 17"],
    ["table", "data-xp-base=\"table\"", "Dòng log 17"],
    ["timeline", "data-xp-base=\"timeline\"", "Thứ tự thời gian bị phá vỡ"],
    ["chart", "data-xp-base=\"chart\"", "Dòng cần xem lại"],
  ];
  for (const [base, marker, expected] of cases) {
    const raw = structuredClone(F.logMatcherInspector);
    raw.recipe.base = { kind: base, display: { label: "Preview" } };
    raw.recipe.overlays = [];
    const html = renderPreview(modelOf(raw));
    assert.ok(html.includes(marker), `${base} must stay on the shared surface`);
    assert.ok(visibleText(html).includes(expected), `${base} must expose labelled observable data`);
  }
});

test("text projection exposes outputs without exposing observable ids or enum kinds", () => {
  const raw = structuredClone(F.logMatcherInspector);
  raw.recipe.base = { kind: "text", display: { label: "Kết quả xử lý" } };
  raw.recipe.overlays = [];
  const html = renderPreview(modelOf(raw));
  const shown = visibleText(html);
  assert.ok(shown.includes("Phát hiện dòng log sai thứ tự."));
  for (const token of ["record-17", "order-broken", "universal-inspector"]) assert.equal(shown.includes(token), false);
});

// --- Universal Inspector ----------------------------------------------------

test("inspector shows real entities, labelled state, events and outputs", () => {
  const shown = visibleText(renderPreview(modelOf(F.logMatcherInspector)));
  assert.ok(shown.includes("Dòng log 17"));
  assert.ok(shown.includes("Thứ tự hợp lệ"));
  assert.ok(shown.includes("Thứ tự thời gian bị phá vỡ"));
  assert.ok(shown.includes("Phát hiện dòng log sai thứ tự."));
  assert.ok(shown.includes("Dòng cần xem lại"));
});

test("inspector never labels itself a fallback, a tier or an unsupported case", () => {
  const shown = visibleText(renderPreview(modelOf(F.logMatcherInspector))).toLowerCase();
  for (const banned of ["fallback", "tier", "hạng", "chưa hỗ trợ", "không hỗ trợ", "mặc định"]) {
    assert.equal(shown.includes(banned), false, `inspector surface leaked "${banned}"`);
  }
});

test("no raw id, enum or schema name reaches the visible text of any base", () => {
  const shown = [F.mazeUserFail, F.routeWatchGraph, F.logMatcherInspector]
    .map((fixture) => visibleText(renderPreview(modelOf(fixture)))).join(" ");
  for (const token of ["cell-2-2", "node-a", "record-17", "anchor-blocked-cell", "error-anchor",
    "universal-inspector", "xuong.observable.v2", "user-source", "route-step", "order-broken"]) {
    assert.equal(shown.includes(token), false, `preview leaked raw token "${token}"`);
  }
});

// --- Recipe interpretation --------------------------------------------------

test("overlay legend reads the contract labels in canonical order", () => {
  const shown = visibleText(renderPreview(modelOf(F.mazeUserFail)));
  const errorAt = shown.indexOf("Điểm cần sửa");
  const pathAt = shown.indexOf("Tuyến của em");
  assert.ok(errorAt > -1 && pathAt > -1);
  assert.ok(errorAt < pathAt, "error-anchor must be listed before path");
});

test("layout kind travels to the surface so one recipe field drives the frame", () => {
  assert.ok(renderPreview(modelOf(F.mazeUserFail)).includes('data-xp-layout="focus"'));
  assert.ok(renderPreview(modelOf(F.routeWatchGraph)).includes('data-xp-layout="balanced"'));
});

test("a stepper control pack renders a real cursor and no fake progress bar", () => {
  const html = renderPreview(modelOf(F.mazeUserFail));
  assert.ok(html.includes("data-xp-step=\"prev\""));
  assert.ok(html.includes("data-xp-step=\"next\""));
  assert.ok(visibleText(html).includes("2/2"));
  assert.equal(html.includes("progress"), false);
  assert.equal(visibleText(html).includes("%"), false);
});

// --- Safety -----------------------------------------------------------------

test("hostile display copy is escaped, never injected", () => {
  const raw = structuredClone(F.logMatcherInspector);
  raw.observable.entities[0].display.label = '<img src=x onerror="alert(1)">';
  const html = renderPreview(modelOf(raw));
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes("&lt;img"));
});

// --- Non-stepper control packs ----------------------------------------------

test("a scenario-input control pack renders real inputs bound to their control id", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.controlPack = { kind: "scenario-input", display: { label: "Đổi tình huống" } };
  raw.observable.controls = [
    { id: "diagonal", display: { label: "Cho phép đi chéo" }, type: "toggle", value: false },
    { id: "wall-count", display: { label: "Số tường" }, type: "number", value: 3 },
  ];
  const html = renderPreview(modelOf(raw));
  assert.ok(html.includes('data-xp-input="diagonal"'));
  assert.ok(html.includes('type="checkbox"'));
  assert.ok(html.includes('data-xp-input="wall-count"'));
  assert.ok(html.includes('type="number"'));
  assert.ok(visibleText(html).includes("Cho phép đi chéo"));
  assert.equal(html.includes("data-xp-step"), false);
});

// --- Dedicated projections (A5 catalog expansion) ---------------------------
// Each base gets a real projection driven ONLY by the ObservableModel. There is
// still no algorithm-specific code: a "sequence" knows about ordered entities,
// not about merge sort.

function withBase(fixture, baseKind, overlays = []) {
  const raw = structuredClone(fixture);
  raw.recipe.base = { kind: baseKind, display: { label: "Khung quan sát" } };
  raw.recipe.overlays = overlays;
  return raw;
}

test("sequence draws ordered cells, not an inspector list", () => {
  const html = renderPreview(modelOf(withBase(F.routeWatchGraph, "sequence")));
  assert.ok(html.includes('data-xp-base="sequence"'));
  assert.ok(html.includes("<svg"), "sequence must be a drawn projection");
  assert.equal((html.match(/data-xp-seq-slot=/g) || []).length, 2);
  assert.ok(visibleText(html).includes("Điểm A"));
});

test("a 5–9 item sequence wraps into readable rows instead of shrinking into a strip", () => {
  const raw = withBase(F.routeWatchGraph, "sequence", [{ kind: "window", display: { label: "Cửa sổ hiệu lực" } }]);
  raw.observable.entities = Array.from({ length: 6 }, (_, index) => ({
    id: `request-${index}`,
    kind: "request",
    display: { label: `upload · ${index * 250}ms` },
    state: { active: index >= 3 },
  }));
  raw.observable.relations = [];
  raw.observable.events[0].entityIds = raw.observable.entities.slice(3).map((entity) => entity.id);
  const html = renderPreview(modelOf(raw));
  assert.ok(html.includes("xp-windowed is-wrapped"));
  assert.equal((html.match(/data-xp-seq-slot=/g) || []).length, 6);
  assert.ok(html.includes('height="184"'), "two rows must retain enough vertical space to read");
});

test("table renders one column per labelled state field and one row per entity", () => {
  const html = renderPreview(modelOf(withBase(F.logMatcherInspector, "table")));
  assert.ok(html.includes('data-xp-base="table"'));
  assert.ok(html.includes("<th"));
  const shown = visibleText(html);
  assert.ok(shown.includes("Thứ tự hợp lệ"), "labelled field becomes a column header");
  assert.ok(shown.includes("Dòng log 17"), "entity becomes a row");
  assert.equal(shown.includes("ordered"), false, "raw field id must not leak into the header");
});

test("timeline places every event on an axis in trace order", () => {
  const html = renderPreview(modelOf(withBase(F.routeWatchGraph, "timeline")));
  assert.ok(html.includes('data-xp-base="timeline"'));
  assert.equal((html.match(/data-xp-tick=/g) || []).length, 3);
  assert.ok(visibleText(html).includes("Liên kết A–B ngắt"));
});

test("chart draws one bar per metric with its unit", () => {
  const html = renderPreview(modelOf(withBase(F.routeWatchGraph, "chart")));
  assert.ok(html.includes('data-xp-base="chart"'));
  assert.ok(html.includes('data-xp-bar="reroute-ms"'));
  const shown = visibleText(html);
  assert.ok(shown.includes("Thời gian tính lại"));
  assert.ok(shown.includes("12"));
  assert.ok(shown.includes("ms"));
});

test("text renders outputs as readable blocks", () => {
  const html = renderPreview(modelOf(withBase(F.logMatcherInspector, "text")));
  assert.ok(html.includes('data-xp-base="text"'));
  assert.ok(html.includes('data-xp-text="log-result"'));
  assert.ok(visibleText(html).includes("Phát hiện dòng log sai thứ tự."));
});

test("runtime-resource shows each metric as a labelled meter", () => {
  const html = renderPreview(modelOf(withBase(F.routeWatchGraph, "runtime-resource")));
  assert.ok(html.includes('data-xp-base="runtime-resource"'));
  assert.ok(html.includes('data-xp-meter="reroute-ms"'));
  assert.ok(visibleText(html).includes("Thời gian tính lại"));
});

test("request-response pairs each exchange without inventing HTTP wording", () => {
  const html = renderPreview(modelOf(withBase(F.routeWatchGraph, "request-response")));
  assert.ok(html.includes('data-xp-base="request-response"'));
  assert.ok(html.includes('data-xp-exchange='));
  const shown = visibleText(html).toLowerCase();
  for (const invented of ["http", "get ", "post ", "status 200"]) {
    assert.equal(shown.includes(invented), false, `request-response invented "${invented}"`);
  }
});

test("an error anchor still highlights its entity on a non-grid projection", () => {
  const html = renderPreview(modelOf(withBase(F.mazeUserFail, "sequence", [{ kind: "error-anchor", display: { label: "Điểm cần sửa" } }])));
  assert.ok(html.includes("is-anchored"), "anchored entity must be visible on every base");
  assert.ok(html.includes('data-xp-anchor="anchor-blocked-cell"'));
});

test("every projection keeps the inspector reachable and leaks no raw tokens", () => {
  const bases = ["sequence", "table", "timeline", "chart", "text", "runtime-resource", "request-response"];
  for (const base of bases) {
    const html = renderPreview(modelOf(withBase(F.logMatcherInspector, base)));
    assert.ok(html.includes("xp-inspector"), `${base} must keep the inspector available`);
    const shown = visibleText(html);
    for (const token of ["record-17", "order-broken", "universal-inspector", "xuong.observable.v2"]) {
      assert.equal(shown.includes(token), false, `${base} leaked "${token}"`);
    }
  }
});

test("tree, geometry and state-machine use independent projection markup", () => {
  const cases = [
    ["tree", "data-xp-tree-node"],
    ["geometry", "data-xp-geometry-point"],
    ["state-machine", "data-xp-state"],
  ];
  for (const [base, marker] of cases) {
    const html = renderPreview(modelOf(withBase(F.routeWatchGraph, base)));
    assert.ok(html.includes(`data-xp-base=\"${base}\"`));
    assert.ok(html.includes(marker), `${base} must not silently borrow graph/grid markup`);
  }
});

test("long sequence, table and event surfaces paint a bounded window", () => {
  const raw = structuredClone(F.routeWatchGraph);
  raw.observable.entities = Array.from({ length: 160 }, (_, index) => ({
    ...structuredClone(F.routeWatchGraph.observable.entities[index % 2]),
    id: `safe-visible-${index}`,
    geometry: { x: index, y: 0 },
  }));
  raw.observable.events = Array.from({ length: 180 }, (_, index) => ({
    ...structuredClone(F.routeWatchGraph.observable.events[index % 3]),
    id: `safe-event-${index}`,
    index,
  }));

  const sequence = renderPreview(modelOf(withBase(raw, "sequence")));
  const table = renderPreview(modelOf(withBase(raw, "table")));
  const timeline = renderPreview(modelOf(withBase(raw, "timeline")));
  assert.equal((sequence.match(/data-xp-seq-slot=/g) || []).length, 80);
  assert.equal((table.match(/data-xp-entity-row=/g) || []).length, 100);
  assert.equal((timeline.match(/data-xp-tick=/g) || []).length, 120);
  assert.ok(visibleText(sequence).includes("còn 80 phần tử"));
  assert.ok(visibleText(table).includes("còn 60 dòng"));
  assert.ok(visibleText(timeline).includes("còn 60 mốc diễn biến"));
});

// --- F1 · replay scrub -------------------------------------------------------
//
// Stepping one event at a time is unusable on a long trace. The scrub addresses
// the SAME cursor the stepper does — it is not playback, so it must never claim
// motion the run did not have.

test("F1 a completed run offers a scrub bound to the real trace length", () => {
  const html = renderPreview(modelOf(F.mazeUserFail));
  assert.match(html, /data-xp-scrub/, "the stepper control must expose a scrub");
  const scrub = html.match(/<input[^>]*data-xp-scrub[^>]*>/)[0];
  assert.match(scrub, /type="range"/);
  assert.match(scrub, /min="0"/);
  assert.match(scrub, new RegExp(`max="${F.mazeUserFail.run.eventCount}"`), "scrub max is the run's own event count");
  assert.match(scrub, /value="2"/);
  assert.match(scrub, /aria-label="[^"]+"/, "the scrub needs a readable label");
});

test("F1 the scrub never appears without events to address", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.observable.events = [];
  raw.observable.anchors = [];
  raw.observable.cursor = 0;
  raw.run.eventCount = 0;
  raw.recipe.overlays = raw.recipe.overlays.filter((o) => o.kind !== "error-anchor");
  const html = renderPreview(modelOf(raw));
  assert.equal(html.includes("data-xp-scrub"), false);
});

test("F1 the inert reference storyboard has neither stepper nor scrub", () => {
  const frame = F.mazeReference.reference.frames[0];
  const html = renderPreview(previewModel({
    run: null,
    observable: normalizeObservable(frame.observable),
    recipe: normalizeRecipe(F.mazeReference.reference.recipe),
  }));
  assert.equal(html.includes("data-xp-scrub"), false, "a storyboard must not look replayable");
  assert.equal(html.includes("data-xp-step"), false);
});

// --- F2 · overlays must change the drawing, not just the legend --------------
//
// A recipe overlay is data the renderer is required to honour. Every mark below
// is derived from the ObservableModel's own structure (events, changedFields,
// relations, numeric state) — never from an algorithm or domain name.

// An overlay is only legal on a compatible base (contract §6), so each case
// below pairs the overlay with a base the matrix actually allows.
function withOverlays(fixture, kinds, base = null) {
  const raw = structuredClone(fixture);
  raw.recipe.overlays = kinds.map((kind) => ({ kind, display: { label: `overlay ${kind}` } }));
  if (base) raw.recipe.base = { kind: base, display: { label: `base ${base}` } };
  const model = modelOf(raw);
  assert.equal(model.available, true, `recipe ${base || raw.recipe.base.kind} + [${kinds}] must be legal`);
  return model;
}

test("F2 diff/compare overlays mark the entities whose fields actually changed", () => {
  const plain = renderPreview(withOverlays(F.mazeUserFail, [], "table"));
  const diffed = renderPreview(withOverlays(F.mazeUserFail, ["diff"], "table"));
  assert.equal(plain.includes("is-changed"), false, "without the overlay nothing is marked changed");
  assert.match(diffed, /is-changed/, "diff must mark the changed entity");
  // cell-2-2 is the entity carrying a changedField in the golden trace.
  assert.match(diffed, /<tr class="[^"]*is-changed[^"]*" data-xp-entity="cell-2-2"/);
});

test("F2 constraint overlay marks entities the trace never touches", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.observable.entities.push({
    id: "cell-wall", kind: "cell", display: { label: "Kệ hàng" },
    state: { blocked: true }, geometry: { x: 0, y: 1 },
  });
  raw.recipe.overlays = [{ kind: "constraint", display: { label: "Ràng buộc" } }];
  const html = renderPreview(modelOf(raw));
  assert.match(html, /is-constraint/, "an entity outside every event is a constraint, not a participant");
});

test("F2 dependency overlay emphasises relations rather than nodes", () => {
  const html = renderPreview(withOverlays(F.routeWatchGraph, ["dependency"]));
  assert.match(html, /is-emphasized/);
});

test("F2 target overlay marks what the last visible event landed on", () => {
  const html = renderPreview(withOverlays(F.mazeUserFail, ["target"]));
  assert.match(html, /is-target/);
});

test("F2 every contract overlay kind renders on a base that allows it", () => {
  const ON = {
    path: "grid", frontier: "grid", heatmap: "grid", "selection-range": "grid",
    constraint: "grid", "error-anchor": "grid", annotation: "grid", target: "grid",
    window: "sequence", partition: "sequence", heap: "sequence", threshold: "sequence", diff: "sequence",
    dependency: "graph", interval: "timeline", compare: "table", frequency: "table",
    "resource-usage": "chart",
  };
  for (const [kind, base] of Object.entries(ON)) {
    const raw = structuredClone(F.mazeUserFail);
    // resource-usage is only legal when a resource metric exists to back it.
    if (kind === "resource-usage") raw.observable.metrics.push({ id: "mem", display: { label: "Bộ nhớ đã dùng" }, value: 12, unit: "MB" });
    const html = renderPreview(withOverlays(raw, [kind], base));
    assert.match(html, new RegExp(`data-xp-overlay="${kind}"`), `${kind} must appear in the legend`);
    assert.equal(html.includes("undefined"), false, `${kind} rendered an undefined`);
    assert.equal(html.includes("[object Object]"), false, `${kind} rendered a raw object`);
  }
});

test("F2 the Universal Inspector is a real projection, not an apology", () => {
  const html = renderPreview(modelOf(F.logMatcherInspector));
  const shown = visibleText(html).toLowerCase();
  for (const banned of ["fallback", "tier", "hạng", "không hỗ trợ", "chưa hỗ trợ", "tạm thời"]) {
    assert.equal(shown.includes(banned), false, `inspector leaked "${banned}"`);
  }
  assert.match(html, /xp-inspector/);
  // It carries the same evidence any base would: state, events, outputs.
  assert.ok(/xp-kv|xp-events|xp-entities/.test(html));
});

// --- F5 · composition: the panel is the focus when a run lands --------------
//
// These lock the parts of the surface that turn a bare drawing into a workbench
// panel. Every one of them asserts the value came from the model — the point of
// the pass was density WITHOUT inventing data.

test("F5 metrics ride the surface as a strip instead of hiding in the inspector", () => {
  const model = modelOf(F.mazeUserFail);
  const html = renderPreview(model);
  assert.ok(model.metrics.length > 0, "fixture must carry metrics to prove anything");
  for (const metric of model.metrics) {
    assert.match(html, new RegExp(`data-xp-metric="${metric.id}"`), `${metric.label} missing from the strip`);
    assert.ok(visibleText(html).includes(String(metric.value)), `${metric.label} value not shown`);
  }
});

test("F5 the run's outputs stay on the surface, not buried in a details panel", () => {
  const model = modelOf(F.mazeUserFail);
  const html = renderPreview(model);
  const lane = html.slice(0, html.indexOf("xp-inspector-panel"));
  for (const output of model.outputs) {
    assert.ok(lane.includes(`data-xp-output="${output.id}"`), `${output.label} missing from the output lane`);
  }
});

test("F5 a projection that already shows its numbers does not repeat them", () => {
  // chart draws bars, runtime-resource draws meters: a strip underneath would
  // print the same measurement twice.
  for (const base of ["chart", "runtime-resource"]) {
    const raw = structuredClone(F.mazeUserFail);
    raw.recipe.base = { kind: base, display: { label: base } };
    // Re-basing a recipe means re-basing its overlays too: an overlay the new
    // base disallows makes the recipe illegal, and an illegal recipe draws an
    // empty panel that would pass this assertion for the wrong reason.
    raw.recipe.overlays = [{ kind: "error-anchor", display: { label: "Điểm cần sửa" } }];
    raw.observable.metrics.push({ id: "mem", display: { label: "Bộ nhớ đã dùng" }, value: 12, unit: "MB" });
    const model = modelOf(raw);
    assert.equal(model.available, true, `${base} recipe must be legal for this to prove anything`);
    const html = renderPreview(model);
    assert.equal(html.includes("data-xp-metric="), false, `${base} duplicated its metrics into a strip`);
  }
  // text ends in its own output blocks, so the lane would double those.
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "text", display: { label: "text" } };
  raw.recipe.overlays = [{ kind: "error-anchor", display: { label: "Điểm cần sửa" } }];
  const textModel = modelOf(raw);
  assert.equal(textModel.available, true);
  assert.equal(renderPreview(textModel).includes("data-xp-output="), false);
});

test("F5 the replay strip names the event the cursor actually reached", () => {
  const model = modelOf(F.mazeUserFail);
  const html = renderPreview(model);
  assert.match(html, /xp-replay/);
  assert.match(html, /data-xp-scrub/);
  const reached = model.events.filter((e) => e.index < model.cursor);
  if (reached.length) {
    assert.ok(visibleText(html).includes(reached[reached.length - 1].label), "cursor position is unnamed");
  }
  // Position, not playback: the contract gives no timebase to play back at.
  assert.equal(/data-xp-play|aria-label="Phát"/.test(html), false, "invented a play button");
});

test("F5 at cursor 0 the strip says no event has happened yet", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.observable.cursor = 0;
  const html = renderPreview(modelOf(raw));
  assert.ok(visibleText(html).includes("Trước mốc đầu tiên"));
});

test("F5 a chart draws the entities being compared, not only the summary metric", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "chart", display: { label: "chart" } };
  raw.recipe.overlays = [{ kind: "compare", display: { label: "So sánh" } }];
  // A labelled numeric state field is what makes an entity chartable.
  raw.observable.entities[0].state.distance = 7;
  raw.observable.events[1].changedFields = [{
    entityId: raw.observable.entities[0].id, fieldId: "distance",
    display: { label: "Số bước" }, before: 3, after: 7,
  }];
  const html = renderPreview(modelOf(raw));
  assert.match(html, new RegExp(`data-xp-entity-bar="${raw.observable.entities[0].id}"`));
  // The value it held before is drawn as a ghost, so the change is visible.
  assert.match(html, /xp-bar-ghost/);
  assert.ok(visibleText(html).includes("từ 3"), "previous value not stated");
});

test("F5 a chart refuses to turn a flag into a quantity", () => {
  // Number(true) is 1 and Number(false) is 0, so a boolean state field will
  // silently chart itself as a bar — and a boolean changedField will print a
  // "từ 0" the run never measured. Both must be rejected as non-quantities.
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "chart", display: { label: "chart" } };
  raw.recipe.overlays = [{ kind: "compare", display: { label: "So sánh" } }];
  const id = raw.observable.entities[0].id;
  raw.observable.entities[0].state = { routeUsed: true };
  raw.observable.events = raw.observable.events.map((event, index) => ({
    ...event,
    changedFields: index === 0
      ? [{ entityId: id, fieldId: "routeUsed", display: { label: "Được đưa vào tuyến" }, before: false, after: true }]
      : [],
  }));
  const html = renderPreview(modelOf(raw));
  assert.equal(html.includes("data-xp-entity-bar="), false, "charted a boolean as a bar");
  assert.equal(html.includes("xp-bar-ghost"), false, "invented a numeric history for a flag");
  assert.equal(visibleText(html).includes("từ 0"), false);
});

test("F5 a text base draws the stream it rewrote, with the rewrite shown inline", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "text", display: { label: "text" } };
  raw.recipe.overlays = [{ kind: "diff", display: { label: "Trường vừa đổi" } }];
  raw.observable.events[1].changedFields = [{
    entityId: raw.observable.entities[0].id, fieldId: "line",
    display: { label: "Nội dung dòng" }, before: "a -> b", after: "a, b",
  }];
  const html = renderPreview(modelOf(raw));
  assert.match(html, /xp-stream-row/);
  assert.match(html, /<del>a -&gt; b<\/del>/);
  assert.match(html, /<ins>a, b<\/ins>/);
  // Each row is the entity it came from, so clicking it can jump to source.
  assert.match(html, new RegExp(`data-xp-entity="${raw.observable.entities[0].id}"`));
});

test("F5 a failure on a link marks the link, not just the nodes it joins", () => {
  const raw = structuredClone(F.routeWatchUserFail || F.mazeUserFail);
  raw.recipe.base = { kind: "graph", display: { label: "graph" } };
  raw.recipe.overlays = [{ kind: "error-anchor", display: { label: "Điểm cần sửa" } },
    { kind: "dependency", display: { label: "Quan hệ phụ thuộc" } }];
  const relation = (raw.observable.relations || [])[0];
  if (!relation) return;                       // fixture without relations proves nothing
  raw.observable.anchors = [{
    id: "anchor-link", eventIndex: 1, entityId: relation.id,
    sourceMappingId: raw.observable.anchors[0] ? raw.observable.anchors[0].sourceMappingId : "main-editable-symbol",
    severity: "error", display: { label: "Liên kết chưa được áp dụng" },
  }];
  const html = renderPreview(modelOf(raw));
  assert.match(html, /class="xp-edge[^"]*is-anchored"/);
});

test("F5 a span overlay brackets the slots the trace actually touched", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "sequence", display: { label: "sequence" } };
  raw.recipe.overlays = [{ kind: "window", display: { label: "Cửa sổ đang xét" } }];
  const html = renderPreview(modelOf(raw));
  assert.match(html, /data-xp-span="window"/);
  assert.ok(visibleText(html).includes("Cửa sổ đang xét"));
});

test("F5 an untouched sequence gets no bracket rather than a guessed one", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.recipe.base = { kind: "sequence", display: { label: "sequence" } };
  raw.recipe.overlays = [{ kind: "window", display: { label: "Cửa sổ đang xét" } }];
  raw.observable.cursor = 0;
  for (const event of raw.observable.events) event.entityIds = [];
  assert.equal(renderPreview(modelOf(raw)).includes("data-xp-span="), false);
});

test("F5 an empty panel keeps the surface's frame instead of collapsing", () => {
  for (const model of [
    previewModel({ run: null, observable: null, recipe: null }),
    previewModel({ run: normalizeRun(F.mazeUserFail.run), observable: null, recipe: null }),
  ]) {
    const html = renderPreview(model);
    assert.match(html, /class="xp-surface is-empty"/, "empty state dropped the panel frame");
    assert.match(html, /xp-stage-idle/, "empty state left no room for the drawing");
    // A placeholder must never look like a measurement.
    assert.equal(html.includes("data-xp-metric="), false);
  }
});

test("F5 the composition still leaks no id, enum or renderer name", () => {
  for (const fixture of [F.mazeUserFail, F.logMatcherInspector]) {
    const shown = visibleText(renderPreview(modelOf(fixture)));
    for (const banned of ["universal-inspector", "error-anchor", "state-machine", "runtime-resource",
      "request-response", "xp-", "data-xp", "seedId", "mappingId", "5050", "5099"]) {
      assert.equal(shown.includes(banned), false, `composition leaked "${banned}"`);
    }
  }
});
