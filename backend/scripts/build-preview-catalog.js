"use strict";

// Regenerates docs/fixtures/xuong-preview-catalog.json.
//
// The fixture is the shared contract between the two catalog test suites:
// backend proves every entry is a legal, evidence-backed recipe; frontend
// proves the real PreviewSurface draws each one without falling back.
//
//   node backend/scripts/build-preview-catalog.js

const fs = require("fs");
const path = require("path");

const registry = require("../src/xuongScenarioRegistry");
const { sampleObservables } = require("../src/xuongObservableSamples");
const {
  buildCatalog, grammarCapacity, BASE_LABEL, OVERLAY_LABEL, LAYOUT_LABEL, CONTROL_LABEL,
} = require("../src/xuongPreviewCatalog");

// Only authored designs enter the catalog. The C6 adapters exist to prove a
// base has a runner; they carry adapter vocabulary in their copy and must stay
// hidden until someone authors a real product arc on that base.
const samples = sampleObservables({ authoredOnly: true });
const catalog = buildCatalog(samples);

// Recipes are stored as tuples so the fixture stays readable and small; both
// suites rebuild the full canonical recipe from the same label tables.
const entries = catalog.recipes.map((entry) => ({
  o: entry.observableId,
  b: entry.base,
  v: entry.overlays,
  c: entry.control,
  l: entry.layout,
}));

const payload = {
  schemaVersion: "xuong.preview-catalog.v1",
  registryVersion: registry.REGISTRY_VERSION,
  generatedFrom: "backend/scripts/build-preview-catalog.js",
  capacity: grammarCapacity(),
  // Shipped with the fixture so the render suite reads the same Vietnamese copy
  // a live run would show, instead of keeping its own copy of the table.
  labels: { base: BASE_LABEL, overlay: OVERLAY_LABEL, layout: LAYOUT_LABEL, control: CONTROL_LABEL },
  stats: catalog.stats,
  observables: Object.fromEntries(samples.map((sample) => [sample.id, {
    arcId: sample.arcId,
    stageIndex: sample.stageIndex,
    variant: sample.variant,
    productTitle: sample.productTitle,
    authored: sample.authored,
    observable: sample.observable,
  }])),
  entries,
};

const target = path.join(__dirname, "..", "..", "docs", "fixtures", "xuong-preview-catalog.json");
fs.writeFileSync(target, `${JSON.stringify(payload, null, 1)}\n`, "utf8");

const kb = Math.round(fs.statSync(target).size / 1024);
process.stdout.write(
  `${entries.length} tổ hợp / ${payload.capacity.total} khả năng · ${payload.stats.basesCovered} base · `
  + `${payload.stats.distinctCompositions} composition · ${samples.length} observable · ${kb} KB\n`,
);
