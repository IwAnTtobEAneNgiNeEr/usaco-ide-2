"use strict";

require("./_isolate-workspace");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { COMPATIBILITY, validateAndCanonicalizeRecipe, stableRecipeKey } = require("../src/xuongContract");

function observable({ anchors = true, resource = true } = {}) {
  return {
    anchors: anchors ? [{ id: "anchor" }] : [],
    metrics: resource ? [{ id: "cpu-memory", display: { label: "CPU và bộ nhớ" }, value: 1 }] : [],
    controls: [{ id: "trace-step", type: "stepper", value: 0 }],
  };
}

function recipe(base, overlays) {
  return {
    schemaVersion: "xuong.preview-recipe.v2",
    base: { kind: base, display: { label: base } },
    overlays: overlays.map((kind) => ({ kind, display: { label: kind } })),
    controlPack: { kind: "stepper", display: { label: "Từng bước" } },
    layout: { kind: "balanced", display: { label: "Cân bằng" } },
    inspector: { alwaysAvailable: true, display: { label: "Chi tiết" } },
  };
}

test("C9 every registered base/overlay combination validates and canonicalizes", () => {
  for (const [base, allowed] of Object.entries(COMPATIBILITY)) {
    for (const overlay of allowed) {
      const canonical = validateAndCanonicalizeRecipe(recipe(base, [overlay]), observable());
      assert.equal(canonical.base.kind, base);
      assert.deepEqual(canonical.overlays.map((item) => item.kind), [overlay]);
    }
    for (let index = 0; index < allowed.length - 1; index += 1) {
      const pair = [allowed[index + 1], allowed[index]];
      const canonical = validateAndCanonicalizeRecipe(recipe(base, pair), observable());
      assert.equal(canonical.overlays.length, 2);
      assert.equal(stableRecipeKey(canonical), stableRecipeKey(validateAndCanonicalizeRecipe(recipe(base, [...pair].reverse()), observable())));
    }
  }
});

test("C9 preview recipe invariants reject invalid combinations", () => {
  assert.throws(() => validateAndCanonicalizeRecipe(recipe("grid", ["path", "path"]), observable()), /lặp overlay/);
  assert.throws(() => validateAndCanonicalizeRecipe(recipe("grid", ["path", "frontier", "target"]), observable()), /0 đến 2 overlay/);
  assert.throws(() => validateAndCanonicalizeRecipe(recipe("grid", ["error-anchor"]), observable({ anchors: false })), /cần EventAnchor/);
  assert.throws(() => validateAndCanonicalizeRecipe(recipe("grid", ["resource-usage"]), observable()), /không tương thích/);
  assert.throws(() => validateAndCanonicalizeRecipe(recipe("chart", ["resource-usage"]), observable({ resource: false })), /cần metric tài nguyên/);
});

test("C9 golden contract fixture stays a valid API recipe round-trip", () => {
  const fixturePath = path.join(__dirname, "..", "..", "docs", "fixtures", "xuong-contract-v2.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  for (const item of Object.values(fixture.fixtures)) {
    const payload = item.reference || item;
    const observable = payload.observable || payload.frames[0].observable;
    const recipe = payload.recipe || payload.frames[0].recipe;
    const canonical = validateAndCanonicalizeRecipe(recipe, observable);
    assert.equal(stableRecipeKey(canonical), stableRecipeKey(validateAndCanonicalizeRecipe(canonical, observable)));
  }
});
