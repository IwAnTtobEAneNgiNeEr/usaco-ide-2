"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ai = require("../src/ai");

test("normalizeStatementText function is exported", () => {
  assert.equal(typeof ai.normalizeStatementText, "function");
});
