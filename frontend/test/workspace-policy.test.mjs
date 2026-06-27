import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY, PRESETS, listWorkspaces, getPreset,
  resolvePolicy, observable, detectWorkspace
} from "../src/core/workspace-policy.js";

test("free preset resolves to the defaults exactly", () => {
  assert.deepEqual(resolvePolicy("free"), DEFAULT_POLICY);
});

test("a sparse patch only changes its own fields", () => {
  const p = resolvePolicy("learning");
  assert.equal(p.layout, "split");
  assert.equal(p.rightTab, "coach");
  assert.equal(p.autoCoachOnWA, true);
  assert.equal(p.sounds, DEFAULT_POLICY.sounds);   // untouched
  assert.equal(p.notifications, "normal");          // untouched
});

test("nested panels/widgets merge one level deep, not replace", () => {
  const p = resolvePolicy("contest");
  assert.equal(p.panels.notes, "hide");             // from patch
  assert.equal(p.widgets.dashboardBtn, false);      // from patch
  assert.equal(p.widgets.timer, true);              // default preserved
});

test("overrides win over the preset", () => {
  const p = resolvePolicy("contest", { sounds: true, layout: "split" });
  assert.equal(p.sounds, true);
  assert.equal(p.layout, "split");
});

test("every preset has a unique id and an icon, free is first", () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(ids[0], "free");
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PRESETS) assert.ok(p.icon && p.name);
});

test("detectWorkspace round-trips each preset's observable axes", () => {
  for (const p of PRESETS) {
    const obs = observable(resolvePolicy(p.id));
    assert.equal(typeof detectWorkspace(obs), "string");
  }
  assert.equal(detectWorkspace(observable(resolvePolicy("contest"))), "contest");
});

test("an unmatched observable set is reported as custom", () => {
  assert.equal(detectWorkspace({ layout: "reading", rightTab: "tests", explorer: "collapsed", zen: false }), "custom");
});

test("listWorkspaces exposes id/name/icon only", () => {
  const list = listWorkspaces();
  assert.equal(list.length, PRESETS.length);
  assert.deepEqual(Object.keys(list[0]).sort(), ["icon", "id", "name"]);
});
