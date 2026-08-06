"use strict";

const { COMPATIBILITY, OVERLAY_ORDER } = require("./xuongContract");
const { eligibleBases } = require("./xuongPreviewCatalog");

const BASES = Object.keys(COMPATIBILITY);

// When a model is rich enough to satisfy several bases, the most demanding one
// wins: a build tree is a tree before it is a generic graph, a ledger is a
// table before it is a bar chart. Ordered from most structure required to
// least; anything not listed falls back to the scoring pass below.
const SPECIFICITY = [
  "grid", "state-machine", "tree", "request-response", "runtime-resource",
  "geometry", "graph", "timeline", "text", "table", "chart", "sequence",
];

function values(object) {
  return object && typeof object === "object" ? Object.values(object) : [];
}

function hasNumber(object, keys) {
  return keys.some((key) => Number.isFinite(Number(object && object[key])));
}

function positionOf(entity) {
  return entity && entity.geometry && typeof entity.geometry === "object"
    ? entity.geometry
    : entity && entity.state;
}

function add(scores, key, amount) {
  if (Object.hasOwn(scores, key)) scores[key] += amount;
}

function inferBase(observable, hint = {}) {
  // Phase 1 — structural eligibility. A base is only considered when the model
  // carries the shape that base draws (positioned nodes for a graph, labelled
  // columns for a table, a time axis for a timeline). This is what stops a
  // six-row ledger from being rendered as a bar chart just because it has
  // numbers, and it is computed from the ObservableModel alone.
  const eligible = eligibleBases(observable).filter((base) => base !== "universal-inspector");
  if (eligible.length) {
    // The trusted registry authored this scenario, so its hint decides among
    // the readings the model actually supports — but never against them: a
    // hint whose base failed eligibility is simply not on the list.
    if (eligible.includes(hint.base)) return hint.base;
    const ranked = SPECIFICITY.filter((base) => eligible.includes(base));
    if (ranked.length) return ranked[0];
    return eligible[0];
  }

  // Phase 2 — sparse models (single-entity adapters, early runs). Nothing is
  // structurally eligible yet, so fall back to weighted signals and let the
  // registry hint act as a tie-breaker.
  const entities = Array.isArray(observable && observable.entities) ? observable.entities : [];
  const relations = Array.isArray(observable && observable.relations) ? observable.relations : [];
  const events = Array.isArray(observable && observable.events) ? observable.events : [];
  const metrics = Array.isArray(observable && observable.metrics) ? observable.metrics : [];
  const scores = Object.fromEntries(BASES.map((base) => [base, base === "universal-inspector" ? 1 : 0]));

  // A registry hint is a tie-breaker for sparse models, not the decision.
  if (BASES.includes(hint.base)) add(scores, hint.base, 4);

  const gridCells = entities.filter((entity) => entity.kind === "cell"
    || (hasNumber(entity.state, ["row"]) && hasNumber(entity.state, ["col"])));
  const positioned = entities.filter((entity) => hasNumber(positionOf(entity), ["x"]) && hasNumber(positionOf(entity), ["y"]));
  const textRows = entities.filter((entity) => typeof (entity.state && entity.state.text) === "string");
  const numericRows = entities.filter((entity) => values(entity.state).some((value) => typeof value === "number" && Number.isFinite(value)));
  const timedEvents = events.filter((event) => hasNumber(event, ["at", "time", "timestamp", "start", "end"]));
  const resourceMetrics = metrics.filter((metric) => /memory|cpu|resource|bộ nhớ|tài nguyên/i.test(`${metric.id || ""} ${metric.display && metric.display.label || ""}`));

  const isGrid = gridCells.length >= Math.max(1, entities.length / 2);
  if (isGrid) add(scores, "grid", 50);
  if (!isGrid && relations.length && positioned.length >= 2) add(scores, "graph", 26);
  if (!relations.length && positioned.length >= 2) add(scores, "geometry", 20);
  if (textRows.length) add(scores, "text", 24 + textRows.length);
  if (timedEvents.length) add(scores, "timeline", 24);
  if (resourceMetrics.length) add(scores, "runtime-resource", 28);
  if (numericRows.length >= 2) {
    add(scores, "chart", 18);
    add(scores, "table", 12);
  }
  if (entities.length >= 2 && events.length) add(scores, "sequence", 14);
  if (relations.length) {
    add(scores, "graph", 10);
    add(scores, "tree", 6);
    add(scores, "state-machine", 4);
  }

  return BASES
    .map((base, index) => ({ base, score: scores[base], index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].base;
}

function inferOverlays(base, observable, hint = {}) {
  const allowed = COMPATIBILITY[base] || [];
  const entities = Array.isArray(observable && observable.entities) ? observable.entities : [];
  const relations = Array.isArray(observable && observable.relations) ? observable.relations : [];
  const events = Array.isArray(observable && observable.events) ? observable.events : [];
  const anchors = Array.isArray(observable && observable.anchors) ? observable.anchors : [];
  const metrics = Array.isArray(observable && observable.metrics) ? observable.metrics : [];
  const scores = new Map(allowed.map((kind) => [kind, 0]));
  const bump = (kind, amount) => {
    if (scores.has(kind)) scores.set(kind, scores.get(kind) + amount);
  };

  if (anchors.length) bump("error-anchor", 100);
  if (relations.length) {
    bump("path", 24);
    bump("dependency", 14);
  }
  if (entities.some((entity) => /target|destination|đích/i.test(`${entity.kind || ""} ${entity.display && entity.display.label || ""} ${entity.state && entity.state.role || ""}`))) {
    bump("target", 26);
  }
  const changed = events.flatMap((event) => Array.isArray(event.changedFields) ? event.changedFields : []);
  if (changed.length) {
    bump("diff", 24);
    bump("compare", 22);
  }
  if (entities.some((entity) => hasNumber(entity.state, ["previousValue", "expected"]))) bump("compare", 20);
  if (entities.some((entity) => hasNumber(entity.state, ["line", "start", "end"]))) bump("selection-range", 18);
  if (entities.some((entity) => Object.hasOwn(entity.state || {}, "active"))) bump("window", 24);
  if (metrics.some((metric) => /memory|cpu|resource|bộ nhớ|tài nguyên/i.test(`${metric.id || ""} ${metric.display && metric.display.label || ""}`))) {
    bump("resource-usage", 30);
  }

  // Sparse adapter models still receive a semantic registry preference, but
  // observable evidence above always outranks it.
  (Array.isArray(hint.overlays) ? hint.overlays : []).forEach((kind, index) => bump(kind, 10 - index));

  return [...scores]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || OVERLAY_ORDER.indexOf(a[0]) - OVERLAY_ORDER.indexOf(b[0]))
    .slice(0, 2)
    .map(([kind]) => kind);
}

function planView(observable, hint = {}) {
  const base = inferBase(observable, hint);
  const controls = Array.isArray(observable && observable.controls) ? observable.controls : [];
  const control = controls.some((item) => item.type === "stepper") ? "stepper" : "none";
  const entityCount = Array.isArray(observable && observable.entities) ? observable.entities.length : 0;
  const layout = entityCount > 12 ? "wide" : hint.layout || "balanced";
  return { base, overlays: inferOverlays(base, observable, hint), control, layout };
}

module.exports = { inferBase, inferOverlays, planView };
