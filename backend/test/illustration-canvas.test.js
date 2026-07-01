"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const spec = require("../src/illustrationSpec");

test("Canvas usefulness rejects arithmetic and accepts clock/permutation/grid", () => {
  assert.equal(spec.usefulness({ statementText: "Add two integers and print their sum." }), false);
  assert.equal(spec.usefulness({ title: "Đồng hồ", statementText: "Mô phỏng HH:MM:SS" }), true);
  assert.equal(spec.usefulness({ title: "Sinh hoán vị" }), true);
  assert.equal(spec.usefulness({ topic: "grid maze" }), true);
});

test("Canvas scene validator sanitizes primitives and coordinates", () => {
  const scene = spec.validateScene({ version: 1, visualType: "permutation", elements: [{ type: "sequence", x: 2, y: -1, values: [3,2,1], label: "State" }] });
  assert.equal(scene.elements[0].x, 1);
  assert.equal(scene.elements[0].y, 0);
  assert.deepEqual(scene.elements[0].values, ["3","2","1"]);
});

test("Canvas scene validator rejects executable or unknown primitives", () => {
  assert.throws(() => spec.validateScene({ elements: [{ type: "script", text: "alert(1)" }] }), /Unsupported/);
  assert.throws(() => spec.validateScene({ elements: Array.from({ length: 41 }, () => ({ type: "label" })) }), /too many/);
});
