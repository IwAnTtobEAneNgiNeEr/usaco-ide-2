"use strict";

// Tests for the progression engine (src/progress.js). The XP economy must be
// deterministic: same metas in → same XP/level/quests out, or the Journey UI
// would show "lost progress" after a restart.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeProgress, levelFloor, levelFromXp, rankName, dayKey,
  SOLVE_XP, BOSS_XP_MULT, DEFENSE_XP, COMEBACK_XP, REVIEW_XP,
  DAY_ACTIVE_XP, DAY_AC_XP, DAY_GRIND_XP, GRIND_TARGET
} = require("../src/progress");

// ---- helpers ---------------------------------------------------------------

const NOW = new Date("2026-06-11T15:00:00"); // local time, mid-afternoon

function isoAt(daysAgo, hour = 10) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// meta.history is stored newest-first; build it that way.
function meta(overrides = {}) {
  return {
    id: overrides.id || "p1",
    title: overrides.title || "P1",
    topic: overrides.topic || "",
    tags: overrides.tags || [],
    difficulty: overrides.difficulty || "unrated",
    status: overrides.status || "learning",
    reviewCount: overrides.reviewCount || 0,
    lastReviewedAt: overrides.lastReviewedAt || "",
    defense: overrides.defense || null,
    lastVerdict: overrides.lastVerdict || null,
    updatedAt: overrides.updatedAt || isoAt(0),
    history: overrides.history || []
  };
}

function run(verdict, daysAgo, hour) {
  return { at: isoAt(daysAgo, hour), type: "judge", verdict, timeMs: 10 };
}

// ---- level curve -------------------------------------------------------------

test("level curve: floors are triangular and levelFromXp matches", () => {
  assert.equal(levelFloor(0), 0);
  assert.equal(levelFloor(1), 60);
  assert.equal(levelFloor(2), 180);
  assert.equal(levelFloor(3), 360);
  assert.equal(levelFromXp(0), 0);
  assert.equal(levelFromXp(59), 0);
  assert.equal(levelFromXp(60), 1);
  assert.equal(levelFromXp(359), 2);
  assert.equal(levelFromXp(360), 3);
});

test("rank names are defined for every level and clamp at the top", () => {
  assert.equal(rankName(0), "Tân binh");
  assert.equal(typeof rankName(4), "string");
  assert.equal(rankName(99), rankName(1000)); // clamps, never undefined
  assert.notEqual(rankName(99), undefined);
});

// ---- XP rules ----------------------------------------------------------------

test("empty workspace → zero XP, level 0, empty skills, 3 base quests", () => {
  const p = computeProgress([], { now: NOW });
  assert.equal(p.xp.total, 0);
  assert.equal(p.xp.level, 0);
  assert.equal(p.streak.current, 0);
  assert.equal(p.skills.length, 0);
  assert.equal(p.quests.length, 3); // review quest hidden when nothing is due
  assert.equal(p.totals.problems, 0);
});

test("first AC earns difficulty XP + day bonuses; extra ACs do not double-count", () => {
  const m = meta({
    difficulty: "easy",
    history: [run("AC", 0, 14), run("AC", 0, 12)] // two ACs today, newest first
  });
  const p = computeProgress([m], { now: NOW });
  // easy 20 + active day 5 + AC day 10 = 35 (second AC adds nothing)
  assert.equal(p.xp.total, SOLVE_XP.easy + DAY_ACTIVE_XP + DAY_AC_XP);
  assert.equal(p.xp.today, p.xp.total);
});

test("comeback bonus applies when >=3 WA precede the first AC", () => {
  const hist = [run("AC", 0, 14), run("WA", 0, 13), run("WA", 0, 12), run("WA", 0, 11)];
  const p = computeProgress([meta({ difficulty: "medium", history: hist })], { now: NOW });
  assert.equal(p.xp.total, SOLVE_XP.medium + COMEBACK_XP + DAY_ACTIVE_XP + DAY_AC_XP);
});

test("WA after AC does not earn the comeback bonus", () => {
  const hist = [run("WA", 0, 15), run("WA", 0, 14), run("WA", 0, 13), run("AC", 0, 12)];
  const p = computeProgress([meta({ difficulty: "medium", history: hist })], { now: NOW });
  assert.equal(p.xp.total, SOLVE_XP.medium + DAY_ACTIVE_XP + DAY_AC_XP);
});

test("reviews earn XP per stamp; today's review counts toward xp.today", () => {
  const m = meta({
    difficulty: "easy",
    history: [run("AC", 5)],
    reviewCount: 2,
    lastReviewedAt: isoAt(0, 9)
  });
  const p = computeProgress([m], { now: NOW });
  assert.equal(p.xp.total, SOLVE_XP.easy + 2 * REVIEW_XP + DAY_ACTIVE_XP + DAY_AC_XP);
  assert.equal(p.xp.today, REVIEW_XP); // only the review happened today
});

test("grind day bonus at GRIND_TARGET runs in one day", () => {
  const hist = [];
  for (let i = 0; i < GRIND_TARGET; i++) hist.push(run("WA", 0, 8 + (i % 12)));
  const p = computeProgress([meta({ history: hist })], { now: NOW });
  assert.equal(p.xp.total, DAY_ACTIVE_XP + DAY_GRIND_XP);
});

// ---- streak ------------------------------------------------------------------

test("streak counts consecutive days and tolerates an inactive today", () => {
  // runs yesterday and the day before, nothing today → streak 2 (grace)
  const hist = [run("WA", 1), run("WA", 2)];
  const p = computeProgress([meta({ history: hist })], { now: NOW });
  assert.equal(p.streak.current, 2);
  assert.equal(p.streak.todayActive, false);
});

test("streak breaks across a gap; best streak remembers the longest", () => {
  const hist = [run("AC", 0), run("WA", 1), run("WA", 4), run("WA", 5), run("WA", 6)];
  const p = computeProgress([meta({ history: hist })], { now: NOW });
  assert.equal(p.streak.current, 2);  // today + yesterday
  assert.equal(p.streak.best, 3);     // days 4-5-6 ago
  assert.equal(p.streak.todayActive, true);
});

// ---- quests ------------------------------------------------------------------

test("quests reflect today's activity and mark done at target", () => {
  const hist = [run("AC", 0, 14), run("WA", 0, 13)];
  const p = computeProgress([meta({ history: hist })], { now: NOW });
  const byId = Object.fromEntries(p.quests.map((q) => [q.id, q]));
  assert.equal(byId.warmup.done, true);
  assert.equal(byId.ac.done, true);
  assert.equal(byId.grind.done, false);
  assert.equal(byId.grind.progress, 2);
});

test("review quest appears only when something is due or was reviewed today", () => {
  // AC 10 days ago, never reviewed → due (interval 3d) → quest shows
  const due = meta({ id: "a", history: [run("AC", 10)] });
  const p1 = computeProgress([due], { now: NOW });
  assert.ok(p1.quests.find((q) => q.id === "review"));
  assert.equal(p1.reviewDue, 1);

  // reviewed 1 day ago (interval for count 1 = 7d) → not due, none today → hidden
  const fresh = meta({ id: "b", history: [run("AC", 10)], reviewCount: 1, lastReviewedAt: isoAt(1) });
  const p2 = computeProgress([fresh], { now: NOW });
  assert.equal(p2.quests.find((q) => q.id === "review"), undefined);
  assert.equal(p2.reviewDue, 0);
});

// ---- skills + week -----------------------------------------------------------

test("skills group by topic (fallback to first tag), stars grow with solves", () => {
  const metas = [
    meta({ id: "a", topic: "DP", history: [run("AC", 1)] }),
    meta({ id: "b", topic: "dp ", history: [run("AC", 2)] }),  // same bucket, case/space-insensitive
    meta({ id: "c", topic: "", tags: ["graphs"], history: [] }),
    meta({ id: "d", topic: "", tags: [], history: [] })          // → "khác"
  ];
  const p = computeProgress(metas, { now: NOW });
  const dp = p.skills.find((s) => s.topic === "dp");
  assert.equal(dp.total, 2);
  assert.equal(dp.solved, 2);
  assert.equal(dp.stars, 2); // thresholds [1,2,...]
  assert.ok(p.skills.find((s) => s.topic === "graphs"));
  assert.ok(p.skills.find((s) => s.topic === "khác"));
});

test("week array spans exactly 7 days ending today, oldest first", () => {
  const p = computeProgress([meta({ history: [run("AC", 0), run("WA", 3)] })], { now: NOW });
  assert.equal(p.week.length, 7);
  assert.equal(p.week[6].date, dayKey(NOW));
  assert.equal(p.week[6].runs, 1);
  assert.equal(p.week[6].ac, 1);
  assert.equal(p.week[3].runs, 1);
  assert.equal(p.week[3].ac, 0);
});

// ---- boss + defense ------------------------------------------------------------

test("boss-tagged problem pays first-AC XP ×3 (comeback added after)", () => {
  const m = meta({ difficulty: "hard", tags: ["boss", "dp"], history: [run("AC", 0)] });
  const p = computeProgress([m], { now: NOW });
  assert.equal(p.xp.total, SOLVE_XP.hard * BOSS_XP_MULT + DAY_ACTIVE_XP + DAY_AC_XP);
});

test("passed defense pays +25 once; today's pass counts toward xp.today + quest", () => {
  const m = meta({
    difficulty: "easy",
    history: [run("AC", 4)],
    defense: { passed: true, score: 8, passedAt: isoAt(0, 9) }
  });
  const p = computeProgress([m], { now: NOW });
  assert.equal(p.xp.total, SOLVE_XP.easy + DEFENSE_XP + DAY_ACTIVE_XP + DAY_AC_XP);
  assert.equal(p.xp.today, DEFENSE_XP);
  const q = p.quests.find((x) => x.id === "defense");
  assert.equal(q.done, true);
});

test("defense quest shows for undefended ACs, hides when nothing to defend", () => {
  const undefended = meta({ id: "a", history: [run("AC", 2)] });
  const p1 = computeProgress([undefended], { now: NOW });
  const q1 = p1.quests.find((x) => x.id === "defense");
  assert.ok(q1);
  assert.equal(q1.done, false);

  const noAc = meta({ id: "b", history: [run("WA", 1)] });
  const p2 = computeProgress([noAc], { now: NOW });
  assert.equal(p2.quests.find((x) => x.id === "defense"), undefined);
});

// ---- robustness ----------------------------------------------------------------

test("garbage history entries (bad dates, missing verdicts) never crash or NaN", () => {
  const m = meta({
    history: [
      { at: "not-a-date", verdict: "AC" },
      { verdict: "WA" },
      null && {},
      { at: isoAt(0), verdict: null }
    ].filter(Boolean)
  });
  const p = computeProgress([m], { now: NOW });
  assert.ok(Number.isFinite(p.xp.total));
  assert.ok(Number.isFinite(p.streak.current));
  assert.ok(p.xp.total >= 0);
});
