"use strict";

// Contract-owned validation.  The frontend never repairs an invalid recipe;
// doing so would make the preview disagree with the deterministic runtime.
const OVERLAY_ORDER = [
  "error-anchor", "target", "path", "frontier", "window", "partition", "heap",
  "threshold", "heatmap", "diff", "selection-range", "dependency", "interval",
  "compare", "frequency", "constraint", "annotation", "resource-usage",
];

const COMPATIBILITY = {
  grid: ["path", "frontier", "heatmap", "selection-range", "constraint", "error-anchor", "target", "annotation"],
  graph: ["path", "frontier", "heap", "dependency", "compare", "selection-range", "error-anchor", "target", "annotation"],
  tree: ["path", "frontier", "heap", "dependency", "compare", "selection-range", "error-anchor", "target", "annotation"],
  sequence: ["window", "partition", "heap", "threshold", "diff", "selection-range", "frequency", "error-anchor", "annotation"],
  table: ["window", "partition", "threshold", "diff", "compare", "frequency", "constraint", "error-anchor", "annotation"],
  timeline: ["window", "interval", "threshold", "compare", "frequency", "error-anchor", "annotation"],
  chart: ["threshold", "heatmap", "compare", "frequency", "target", "error-anchor", "annotation", "resource-usage"],
  text: ["diff", "selection-range", "constraint", "error-anchor", "annotation", "target"],
  geometry: ["path", "heatmap", "selection-range", "constraint", "error-anchor", "target", "annotation"],
  "state-machine": ["dependency", "constraint", "diff", "error-anchor", "target", "annotation"],
  "request-response": ["diff", "threshold", "compare", "constraint", "error-anchor", "annotation", "resource-usage"],
  "runtime-resource": ["threshold", "heatmap", "compare", "target", "error-anchor", "resource-usage", "annotation"],
  "universal-inspector": ["error-anchor", "diff", "compare", "constraint", "annotation"],
};

function contractError(message) {
  return Object.assign(new Error(message), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
}

function hasControl(observable, kind) {
  if (kind === "none") return true;
  const controls = Array.isArray(observable && observable.controls) ? observable.controls : [];
  return controls.some((control) => control.type === "stepper" || control.id === kind || control.type === kind);
}

function validateAndCanonicalizeRecipe(recipe, observable) {
  if (!recipe || recipe.schemaVersion !== "xuong.preview-recipe.v2" || !recipe.base || !recipe.base.kind) {
    throw contractError("PreviewRecipe thiếu base hoặc sai schemaVersion.");
  }
  if (!Object.hasOwn(COMPATIBILITY, recipe.base.kind)) throw contractError("PreviewRecipe có base không được đăng ký.");
  if (!Array.isArray(recipe.overlays) || recipe.overlays.length > 2) throw contractError("PreviewRecipe chỉ được có từ 0 đến 2 overlay.");
  if (!recipe.inspector || recipe.inspector.alwaysAvailable !== true) throw contractError("PreviewRecipe phải luôn có Universal Inspector.");
  const seen = new Set();
  const anchors = Array.isArray(observable && observable.anchors) ? observable.anchors : [];
  const metrics = Array.isArray(observable && observable.metrics) ? observable.metrics : [];
  for (const overlay of recipe.overlays) {
    if (!overlay || !COMPATIBILITY[recipe.base.kind].includes(overlay.kind)) throw contractError("Overlay không tương thích với base của PreviewRecipe.");
    if (seen.has(overlay.kind)) throw contractError("PreviewRecipe không được lặp overlay.");
    seen.add(overlay.kind);
    if (overlay.kind === "error-anchor" && anchors.length === 0) throw contractError("Overlay error-anchor cần EventAnchor.");
    if (overlay.kind === "resource-usage" && !metrics.some((metric) => /memory|cpu|resource|bộ nhớ|tài nguyên/i.test(`${metric.id} ${metric.display && metric.display.label}`))) {
      throw contractError("Overlay resource-usage cần metric tài nguyên.");
    }
  }
  if (!recipe.controlPack || !hasControl(observable, recipe.controlPack.kind)) throw contractError("Control pack không có control tương ứng trong ObservableModel.");
  const canonical = {
    ...recipe,
    overlays: [...recipe.overlays].sort((a, b) => OVERLAY_ORDER.indexOf(a.kind) - OVERLAY_ORDER.indexOf(b.kind)),
  };
  return canonical;
}

function stableRecipeKey(recipe) {
  return JSON.stringify(recipe);
}

module.exports = { COMPATIBILITY, OVERLAY_ORDER, contractError, validateAndCanonicalizeRecipe, stableRecipeKey };
