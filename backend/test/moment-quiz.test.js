"use strict";

// Tests for moment/quiz.js — Flash Quiz pure core (README-AUTOPILOT.md flow
// v2). Fixture-only, deterministic by design (choice order + evidence
// rotation derive from a caller-supplied dayKey, never Math.random or
// Date.now()).

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildQuiz, buildChoices, MAX_QUESTIONS, CHOICES } = require("../src/moment/quiz");
const { TAXONOMY } = require("../src/moment/diagnose");

function doc(tag, savedAt, over = {}) {
  return {
    tag,
    doc: {
      verdict: "WA", problemId: "p1", savedAt,
      diagnosis: { ok: true, tag, why: `lý do của ${tag}`, hint: `gợi ý của ${tag}` },
      ...over,
    },
  };
}
function bug(tag, count) {
  return { tag, count, lastSeen: "2026-07-01", evidence: ["problems/p1/moment/1.json"] };
}

test("buildChoices: exactly 4 unique choices, correct answer present, deterministic", () => {
  for (const seed of [0, 1, 7, 123, 999]) {
    const a = buildChoices("bien-tran", seed);
    const b = buildChoices("bien-tran", seed);
    assert.deepEqual(a, b, "same seed must yield same order");
    assert.equal(a.length, CHOICES);
    assert.equal(new Set(a.map((c) => c.tag)).size, CHOICES, "choices must be unique");
    assert.ok(a.some((c) => c.tag === "bien-tran"), "correct answer must be among the choices");
    assert.ok(!a.some((c) => c.tag === "khac"), "the escape-hatch tag is never a choice");
  }
});

test("buildChoices: correct answer's slot varies with the seed (not always first)", () => {
  const positions = new Set();
  for (let seed = 0; seed < 8; seed += 1) {
    positions.add(buildChoices("off-by-one", seed).findIndex((c) => c.tag === "off-by-one"));
  }
  assert.ok(positions.size > 1, "answer position must not be constant");
});

test("buildQuiz: most-frequent bugs first, capped at MAX_QUESTIONS", () => {
  const bugs = [bug("off-by-one", 2), bug("bien-tran", 9), bug("canh-bien", 5), bug("tran-mang", 7)];
  const docs = [doc("off-by-one", 1), doc("bien-tran", 2), doc("canh-bien", 3), doc("tran-mang", 4)];
  const { questions } = buildQuiz(bugs, docs);
  assert.equal(questions.length, MAX_QUESTIONS);
  assert.deepEqual(questions.map((q) => q.tag), ["bien-tran", "tran-mang", "canh-bien"]);
  assert.equal(questions[0].why, "lý do của bien-tran");
  assert.equal(questions[0].seenCount, 9);
});

test("buildQuiz: a bug with no readable evidence yields NO question (never invented)", () => {
  const { questions } = buildQuiz([bug("bien-tran", 9), bug("off-by-one", 3)], [doc("off-by-one", 5)]);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].tag, "off-by-one");
});

test("buildQuiz: broken/not-ok/null docs are ignored regardless of day rotation", () => {
  const docs = [
    doc("bien-tran", 100, { diagnosis: { ok: true, tag: "bien-tran", why: "cũ", hint: "" } }),
    doc("bien-tran", 200, { diagnosis: { ok: true, tag: "bien-tran", why: "mới nhất", hint: "" } }),
    { tag: "bien-tran", doc: { savedAt: 300, diagnosis: { ok: false, raw: "hỏng" } } },
    { tag: "bien-tran", doc: null },
  ];
  for (const dayKey of ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]) {
    const { questions } = buildQuiz([bug("bien-tran", 2)], docs, { dayKey });
    assert.equal(questions.length, 1);
    assert.ok(["cũ", "mới nhất"].includes(questions[0].why), `unexpected evidence for dayKey ${dayKey}: ${questions[0].why}`);
  }
});

test("buildQuiz: a tag with multiple evidence rotates by dayKey instead of freezing on one forever", () => {
  const docs = [
    doc("bien-tran", 100, { diagnosis: { ok: true, tag: "bien-tran", why: "ngày 1", hint: "" } }),
    doc("bien-tran", 200, { diagnosis: { ok: true, tag: "bien-tran", why: "ngày 2", hint: "" } }),
    doc("bien-tran", 300, { diagnosis: { ok: true, tag: "bien-tran", why: "ngày 3", hint: "" } }),
  ];
  const seen = new Set();
  for (const dayKey of ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"]) {
    const { questions } = buildQuiz([bug("bien-tran", 2)], docs, { dayKey });
    seen.add(questions[0].why);
  }
  assert.ok(seen.size > 1, "rotation must eventually surface more than one piece of evidence across different days");
});

test("buildQuiz: same dayKey always yields the same question (deterministic, testable/replayable)", () => {
  const docs = [
    doc("bien-tran", 100, { diagnosis: { ok: true, tag: "bien-tran", why: "a", hint: "" } }),
    doc("bien-tran", 200, { diagnosis: { ok: true, tag: "bien-tran", why: "b", hint: "" } }),
  ];
  const bugs = [bug("bien-tran", 2)];
  const q1 = buildQuiz(bugs, docs, { dayKey: "2026-07-08" }).questions[0];
  const q2 = buildQuiz(bugs, docs, { dayKey: "2026-07-08" }).questions[0];
  assert.deepEqual(q1, q2);
});

test("buildQuiz: currentTopic prioritizes a matching bug ahead of a higher-count non-matching one", () => {
  const bugs = [bug("bien-tran", 9), bug("off-by-one", 1)];
  // `topic` lives on the evidence WRAPPER (sibling of tag/doc), not inside
  // the moment/<ts>.json doc itself — routes/planner.js resolves it via a
  // separate problemStore lookup, since the doc only carries a problemId.
  const docs = [
    { ...doc("bien-tran", 100), topic: "graph" },
    { ...doc("off-by-one", 200), topic: "binary-search" },
  ];
  const withoutTopic = buildQuiz(bugs, docs, { dayKey: "d" }).questions.map((q) => q.tag);
  assert.deepEqual(withoutTopic, ["bien-tran", "off-by-one"], "no topic given -> pure count order, unchanged");

  const withTopic = buildQuiz(bugs, docs, { dayKey: "d", currentTopic: "binary-search" }).questions.map((q) => q.tag);
  assert.deepEqual(withTopic, ["off-by-one", "bien-tran"], "matching topic jumps ahead of a higher-count bug");
});

test("buildQuiz: 'khac' bugs are skipped; empty inputs give an empty quiz", () => {
  assert.equal(buildQuiz([bug("khac", 50)], [doc("khac", 1)]).questions.length, 0);
  assert.deepEqual(buildQuiz([], []).questions, []);
  assert.deepEqual(buildQuiz(null, null).questions, []);
});

test("every taxonomy tag (except khac) can produce a valid 4-choice question", () => {
  for (const t of TAXONOMY) {
    if (t.tag === "khac") continue;
    const { questions } = buildQuiz([bug(t.tag, 1)], [doc(t.tag, 42)]);
    assert.equal(questions.length, 1, t.tag);
    assert.equal(questions[0].choices.length, CHOICES, t.tag);
  }
});
