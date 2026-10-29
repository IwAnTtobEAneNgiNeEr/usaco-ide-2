import test from "node:test";
import assert from "node:assert/strict";
import * as statement from "../src/statement.js";

const priorAc = [{ type: "judge", verdict: "AC", at: "2026-01-01T00:00:00.000Z" }];

test("statement brief distinguishes current, unsaved, stale and historical AC", () => {
  const label = statement.statementTruthLabel;
  assert.equal(typeof label, "function");
  assert.match(label({ truth: { derivedStatus: "verified" }, history: priorAc }, false), /AC hiện tại/);
  assert.match(label({ truth: { derivedStatus: "verified" }, history: priorAc }, true), /chưa lưu.*Judge lại/i);
  assert.match(label({ truth: { derivedStatus: "stale" }, history: priorAc }, false), /Judge lại.*từng AC/i);
  assert.match(label({ truth: { derivedStatus: "historically-accepted" }, history: priorAc }, false), /từng AC/i);
  assert.doesNotMatch(label({ truth: { derivedStatus: "unverified" }, history: [] }, false), /AC hiện tại|Đã giải/);
});
