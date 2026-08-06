"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planView } = require("../src/xuongViewPlanner");

const observable = (patch = {}) => ({
  entities: [],
  relations: [],
  events: [],
  anchors: [],
  metrics: [],
  outputs: [],
  controls: [{ id: "trace-step", type: "stepper", value: 0 }],
  ...patch,
});

test("ViewPlanner derives grid/path/target from the observable instead of an arc recipe", () => {
  const plan = planView(observable({
    entities: [
      { kind: "cell", display: { label: "Xuất phát" }, state: { row: 0, col: 0, role: "start" } },
      { kind: "cell", display: { label: "Đích" }, state: { row: 1, col: 1, role: "destination" } },
    ],
    relations: [{ from: "a", to: "b" }],
  }), { base: "text", overlays: ["diff"], layout: "balanced" });
  assert.equal(plan.base, "grid");
  assert.deepEqual(plan.overlays, ["target", "path"]);
});

test("ViewPlanner derives graph + error anchor for a failing non-list run", () => {
  const plan = planView(observable({
    entities: [
      { kind: "node", state: { x: 0, y: 0 } },
      { kind: "node", state: { x: 10, y: 10 } },
    ],
    relations: [{ from: "a", to: "b" }],
    anchors: [{ id: "broken-edge" }],
    events: [{ changedFields: [{ fieldId: "weight", before: 2, after: 7 }] }],
  }));
  assert.equal(plan.base, "graph");
  assert.equal(plan.overlays[0], "error-anchor");
  assert.equal(plan.overlays[1], "path");
});

test("ViewPlanner uses a registered base hint for sparse models but lets changed fields choose the first overlay", () => {
  const plan = planView(observable({
    entities: [{ kind: "adapter-item", state: { actual: 3, expected: 4 } }],
    events: [{ changedFields: [{ fieldId: "actual", before: null, after: 3 }] }],
  }), { base: "state-machine", overlays: ["dependency", "constraint"] });
  assert.equal(plan.base, "state-machine");
  assert.deepEqual(plan.overlays, ["diff", "dependency"]);
});

test("ViewPlanner selects the resource surface from resource metrics", () => {
  const plan = planView(observable({
    entities: [{ kind: "adapter-item", state: { actual: 3 } }],
    metrics: [{ id: "memory", display: { label: "Bộ nhớ" }, value: 64 }],
  }), { base: "table", overlays: [] });
  assert.equal(plan.base, "runtime-resource");
  assert.deepEqual(plan.overlays, ["resource-usage"]);
});
