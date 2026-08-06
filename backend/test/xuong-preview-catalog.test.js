"use strict";

// Preview combination catalog — contract proof.
//
// The number of combinations is meaningless on its own; the previous rounds of
// this project produced exactly that kind of number. What this suite locks is
// the chain that makes a number honest:
//
//   authored arc → trusted ObservableModel → evidence for every overlay
//   → contract-validated canonical recipe → one distinct catalog entry
//
// If any link breaks the catalog shrinks. It is never allowed to grow by
// relaxing a rule.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const registry = require("../src/xuongScenarioRegistry");
const { sampleObservables } = require("../src/xuongObservableSamples");
const {
  buildCatalog, grammarCapacity, enumerateRecipes, supportedOverlays,
  eligibleBases, EVIDENCE, composeRecipe,
} = require("../src/xuongPreviewCatalog");
const { COMPATIBILITY, OVERLAY_ORDER, validateAndCanonicalizeRecipe, stableRecipeKey } = require("../src/xuongContract");

const fixturePath = path.join(__dirname, "..", "..", "docs", "fixtures", "xuong-preview-catalog.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const samples = sampleObservables({ authoredOnly: true });
const catalog = buildCatalog(samples);
const byId = new Map(samples.map((sample) => [sample.id, sample]));

test("catalog draws only on authored product arcs", () => {
  const authored = registry.listArcIds().filter((id) => registry.getArc(id).authored);
  assert.equal(authored.length, 15, "phải có đúng 15 thiết kế authored");
  for (const sample of samples) assert.equal(sample.authored, true);
  // Adapters keep their runner role but must never reach the catalog: their
  // copy still carries adapter vocabulary ("Adapter runtime-resource: …").
  const all = sampleObservables();
  assert.ok(all.length > samples.length, "C6 adapter vẫn tồn tại nhưng bị loại khỏi catalog");
});

test("every catalog entry is a canonical recipe the contract accepts for its own observable", () => {
  for (const entry of catalog.recipes) {
    const source = byId.get(entry.observableId);
    assert.ok(source, `entry trỏ observable không tồn tại: ${entry.observableId}`);
    const canonical = validateAndCanonicalizeRecipe(entry.recipe, source.observable);
    assert.equal(stableRecipeKey(canonical), entry.key, "recipe chưa ở dạng canonical");
  }
});

test("grammar invariants hold for every entry: one base, at most two overlays, no repeat, fixed order", () => {
  for (const entry of catalog.recipes) {
    assert.ok(Object.hasOwn(COMPATIBILITY, entry.base));
    assert.ok(entry.overlays.length <= 2);
    assert.equal(new Set(entry.overlays).size, entry.overlays.length);
    for (const overlay of entry.overlays) assert.ok(COMPATIBILITY[entry.base].includes(overlay));
    const order = entry.overlays.map((kind) => OVERLAY_ORDER.indexOf(kind));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  }
});

test("each entry key is unique — the count is distinct combinations, not repeats", () => {
  assert.equal(new Set(catalog.recipes.map((entry) => entry.key)).size, catalog.recipes.length);
});

test("every overlay in every entry has evidence in the observable it is bound to", () => {
  for (const entry of catalog.recipes) {
    const { observable } = byId.get(entry.observableId);
    for (const overlay of entry.overlays) {
      assert.equal(EVIDENCE[overlay](observable), true,
        `${entry.base} + ${overlay} không có dữ liệu đứng sau trong ${entry.observableId}`);
    }
  }
});

test("an overlay with no evidence is refused even though the contract would allow it", () => {
  // grid + heatmap is legal grammar. On a model with no numbers it is a lie,
  // so the catalog must not contain it for that model.
  const bare = {
    schemaVersion: "xuong.observable.v2",
    scenario: { id: "bare", display: { label: "trống" } },
    entities: [
      { id: "a", kind: "cell", display: { label: "A" }, state: {}, geometry: { x: 0, y: 0 } },
      { id: "b", kind: "cell", display: { label: "B" }, state: {}, geometry: { x: 1, y: 0 } },
      { id: "c", kind: "cell", display: { label: "C" }, state: {}, geometry: { x: 0, y: 1 } },
      { id: "d", kind: "cell", display: { label: "D" }, state: {}, geometry: { x: 1, y: 1 } },
    ],
    relations: [], events: [], anchors: [], metrics: [], outputs: [], controls: [], cursor: 0,
  };
  assert.equal(supportedOverlays(bare).includes("heatmap"), false);
  assert.equal(enumerateRecipes(bare).some((item) => item.recipe.overlays.some((o) => o.kind === "heatmap")), false);
  // And the contract itself still refuses an error-anchor with no anchors.
  assert.throws(() => validateAndCanonicalizeRecipe(
    composeRecipe({ base: "grid", overlays: ["error-anchor"], control: "none", layout: "balanced" }), bare,
  ), /EventAnchor/);
});

test("base eligibility is structural: a 81-cell warehouse map is not a bar chart", () => {
  const maze = byId.get("grid-pathfinder#0#red").observable;
  const bases = eligibleBases(maze);
  assert.ok(bases.includes("grid"));
  assert.equal(bases.includes("chart"), false, "81 ô không được coi là biểu đồ");
  assert.equal(bases.includes("table"), false, "81 ô không được coi là bảng đọc được");
});

test("the catalog covers all 13 projection bases and passes one third of the grammar capacity", () => {
  const capacity = grammarCapacity();
  assert.equal(capacity.total, 2604);
  assert.equal(catalog.stats.basesCovered, 13);
  assert.ok(catalog.stats.total >= Math.ceil(capacity.total / 3),
    `mới đạt ${catalog.stats.total}/${capacity.total} tổ hợp`);
  assert.ok(catalog.stats.distinctCompositions >= 300,
    `mới có ${catalog.stats.distinctCompositions} composition base+overlay`);
});

test("the committed fixture matches what the registry produces right now", () => {
  assert.equal(fixture.registryVersion, registry.REGISTRY_VERSION,
    "chạy lại: node backend/scripts/build-preview-catalog.js");
  assert.equal(fixture.entries.length, catalog.recipes.length);
  assert.equal(fixture.stats.basesCovered, catalog.stats.basesCovered);
  const fixtureKeys = new Set(fixture.entries.map((entry) => stableRecipeKey(
    validateAndCanonicalizeRecipe(
      composeRecipe({ base: entry.b, overlays: entry.v, control: entry.c, layout: entry.l }),
      fixture.observables[entry.o].observable,
    ),
  )));
  for (const entry of catalog.recipes) assert.ok(fixtureKeys.has(entry.key), `fixture thiếu ${entry.key}`);
});
