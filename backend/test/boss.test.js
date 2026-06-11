"use strict";

// Tests for the pure parts of the Weekend Boss: ISO week ids (the weekly gate)
// and weakness detection (which topic the boss targets).

const test = require("node:test");
const assert = require("node:assert/strict");

const { isoWeekId, findWeakness } = require("../src/boss");

// ---- isoWeekId -----------------------------------------------------------------

test("isoWeekId matches known ISO-8601 anchors", () => {
  assert.equal(isoWeekId(new Date(2026, 0, 1)), "2026-W01");   // Thu 2026-01-01
  assert.equal(isoWeekId(new Date(2026, 5, 11)), "2026-W24");  // Thu 2026-06-11
  assert.equal(isoWeekId(new Date(2024, 11, 30)), "2025-W01"); // Mon 2024-12-30 → ISO year 2025
  assert.equal(isoWeekId(new Date(2023, 0, 1)), "2022-W52");   // Sun 2023-01-01 → ISO year 2022
});

test("isoWeekId is stable across one ISO week (Mon..Sun)", () => {
  // 2026-06-08 is a Monday.
  const monday = isoWeekId(new Date(2026, 5, 8));
  const sunday = isoWeekId(new Date(2026, 5, 14));
  const nextMonday = isoWeekId(new Date(2026, 5, 15));
  assert.equal(monday, sunday);
  assert.notEqual(sunday, nextMonday);
});

// ---- findWeakness ---------------------------------------------------------------

function meta(topic, { wa = 0, ac = false, tags = [] } = {}) {
  const history = [];
  for (let i = 0; i < wa; i++) history.push({ at: "2026-06-10T10:00:00Z", verdict: "WA" });
  if (ac) history.push({ at: "2026-06-10T11:00:00Z", verdict: "AC" });
  return { topic, tags, status: ac ? "solved" : "learning", history };
}

test("findWeakness picks the topic with the most WA (needs >=2 attempts)", () => {
  const metas = [
    meta("dp", { wa: 4 }), meta("dp", { wa: 3, ac: true }),
    meta("graphs", { wa: 1, ac: true }), meta("graphs", { ac: true }),
    meta("strings", { wa: 9 }) // only 1 attempt — not qualified while others are
  ];
  const w = findWeakness(metas);
  assert.equal(w.topic, "dp");
  assert.equal(w.waCount, 7);
  assert.equal(w.attempts, 2);
  assert.equal(w.solved, 1);
});

test("findWeakness falls back to single-attempt topics and ignores boss problems", () => {
  const metas = [
    meta("greedy", { wa: 2 }),
    meta("dp", { wa: 50, tags: ["boss"] }) // last week's boss must not skew the data
  ];
  const w = findWeakness(metas);
  assert.equal(w.topic, "greedy");
});

test("findWeakness returns null with no usable topics", () => {
  assert.equal(findWeakness([]), null);
  assert.equal(findWeakness([meta("", {})]), null);
});
