import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEntry, visibleSuggestions, entryQueryString, feedbackEvent,
  parseHidden, serializeHidden, FEEDBACK_KINDS,
} from "../src/core/entry-model.js";
import { fixtures } from "./fixtures/contract-fixtures.mjs";

test("normalizeEntry: the work-in-progress item becomes the continue CTA", () => {
  const entry = normalizeEntry(fixtures.entry);
  assert.ok(entry);
  // dij-1 carries stored WA evidence → scoreBreakdown.workInProgress → Tiếp tục
  assert.equal(entry.continueItem.id, "dij-1");
  assert.ok(entry.continueItem.reason.length > 0);
  // solved problems never come back from the endpoint at all
  assert.ok(!entry.suggestions.some((s) => s.id === "bfs-1"));
  // the remaining items are suggestions, each with the server's real reason
  assert.ok(entry.suggestions.every((s) => s.reason));
});

test("normalizeEntry: absent/malformed responses → null (local ladder fallback)", () => {
  assert.equal(normalizeEntry(null), null);
  assert.equal(normalizeEntry({}), null);
  assert.equal(normalizeEntry({ items: "x" }), null);
  // items without id/title/reason are dropped, never rendered half-empty
  const entry = normalizeEntry({ items: [{ id: "a" }, { id: "b", title: "B", reason: ["vì lý do thật"] }] });
  assert.equal(entry.suggestions.length, 1);
  assert.equal(entry.suggestions[0].id, "b");
});

test("suggestions cap at 3 AFTER dismissals so a dismissal frees a slot", () => {
  const mk = (id) => ({ id, title: id, reason: "r" });
  const four = [mk("a"), mk("b"), mk("c"), mk("d")];
  assert.deepEqual(visibleSuggestions(four, new Set()).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(visibleSuggestions(four, new Set(["b"])).map((s) => s.id), ["a", "c", "d"]);
});

test("dismissals ride back to the server via the endpoint's own dismissed= param", () => {
  assert.equal(entryQueryString(new Set()), "");
  assert.equal(entryQueryString(new Set(["p1", "p2"])), "dismissed=p1%2Cp2");
});

test("feedback maps to the existing per-problem event route payload", () => {
  for (const kind of FEEDBACK_KINDS) {
    const ev = feedbackEvent("p9", kind.id);
    assert.equal(ev.type, "recommendation-feedback");
    assert.deepEqual(ev.data, { suggestionId: "p9", feedback: kind.id });
  }
  assert.equal(feedbackEvent("p9", "made-up-kind"), null);
  assert.equal(feedbackEvent("", "too-easy"), null);
});

test("hidden list round-trips localStorage and survives garbage", () => {
  const set = parseHidden(serializeHidden(new Set(["a", "b"])));
  assert.deepEqual([...set], ["a", "b"]);
  assert.deepEqual([...parseHidden("not json")], []);
  assert.deepEqual([...parseHidden('[1, "x", null]')], ["x"]);
});
