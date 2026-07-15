"use strict";

// quiz.js — pure core of Flash Quiz (README-AUTOPILOT.md flow v2; resurrects
// the feature README-LOOPS §5 promised but nobody ever built — journey.css
// has carried its dead .quiz-* styles since v4.6).
//
// The honest quiz: every question is the student's OWN past mistake. The
// Khoảnh Khắc autopilot already recorded a diagnosis file per bug (why + tag
// + hint, README-AUTOPILOT §3); the quiz simply shows the "why" back and asks
// the student to CLASSIFY it — active recall of last week's lesson, zero AI
// calls, zero invented content (README-LOOPS §1.2).
//
// Pure: no fs, no AI, no Math.random. `dayKey` (a caller-supplied "2026-07-08"
// string, NOT Date.now()) is what makes this both deterministic (same dayKey
// -> same quiz, still testable/replayable) AND fresh (a different dayKey ->
// different evidence + different distractor order) — the previous version
// seeded everything off the evidence file's OWN savedAt, which meant the
// exact same 3 questions in the exact same order repeated forever until a new
// bug outranked one by raw count. That's also why a tag with more than one
// piece of evidence now ROTATES through all of it by dayKey instead of always
// showing only the single newest file — "same bug, different day it bit you"
// instead of memorizing one frozen sentence.

const { TAXONOMY, tagLabel } = require("./diagnose");

const MAX_QUESTIONS = 3;
const CHOICES = 4;
const EVIDENCE_PER_TAG = 3; // matches routes/planner.js's bug.evidence.slice(-3)

/** Small deterministic string->int hash (day-key rotation only needs a stable
 *  spread, not cryptographic quality). */
function hashKey(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic "shuffle": pick 3 distractors walking the taxonomy from a
 *  seed offset, then rotate the correct answer into a seed-chosen slot. */
function buildChoices(correctTag, seed) {
  const others = TAXONOMY.filter((t) => t.tag !== correctTag && t.tag !== "khac");
  const picked = [];
  for (let i = 0; picked.length < CHOICES - 1 && i < others.length; i += 1) {
    picked.push(others[(seed + i * 3) % others.length]);
    // de-dup (stride can wrap onto an already-picked entry)
    if (new Set(picked.map((p) => p.tag)).size !== picked.length) picked.pop();
  }
  const choices = picked.map((t) => ({ tag: t.tag, label: t.label }));
  choices.splice(seed % CHOICES, 0, { tag: correctTag, label: tagLabel(correctTag) });
  return choices.slice(0, CHOICES);
}

/**
 * @param {Array} recurringBugs - Student Model entries {tag, count, lastSeen, evidence[]}
 * @param {Array} evidenceDocs - loaded evidence files, each {tag, doc, topic?}
 *   where doc is the moment/<ts>.json content ({verdict, problemId, diagnosis,
 *   savedAt}) and `topic` (optional) is the ALGORITHM topic of that evidence's
 *   problem (dp/graph/binary-search/...), resolved by the caller so this core
 *   stays fs-free. The caller resolves paths and reads files.
 * @param {object} [opts]
 * @param {string} [opts.dayKey] - "2026-07-08"-style caller-supplied day
 *   string. Same dayKey -> same quiz (testable); a new day rotates both which
 *   piece of evidence gets shown per tag AND the distractor order — without
 *   this, the exact same 3 questions in the exact same order repeat forever.
 * @param {string} [opts.currentTopic] - the topic of the problem currently
 *   open, if any. Bugs with evidence in this topic are asked first, and that
 *   topic-matching evidence is preferred over other evidence for the SAME
 *   tag — so a student mid-binary-search isn't handed a question whose only
 *   readable evidence happens to be from an old graph problem.
 * @returns {{questions: object[]}} up to MAX_QUESTIONS.
 */
function buildQuiz(recurringBugs, evidenceDocs, opts = {}) {
  const dayKey = opts.dayKey || "";
  const currentTopic = opts.currentTopic || "";

  const byTag = new Map(); // tag -> valid docs, oldest-first, capped
  for (const e of evidenceDocs || []) {
    const d = e && e.doc;
    if (!d || !d.diagnosis || !d.diagnosis.ok || !d.diagnosis.why) continue;
    const list = byTag.get(e.tag) || [];
    list.push({ ...d, topic: e.topic || "" });
    byTag.set(e.tag, list);
  }
  for (const [tag, list] of byTag) {
    list.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    byTag.set(tag, list.slice(-EVIDENCE_PER_TAG));
  }

  /** Pick one doc for `tag` — topic-matching evidence preferred when
   *  available, rotated by dayKey so it doesn't freeze on one forever. */
  function pickDoc(tag) {
    const pool = byTag.get(tag);
    if (!pool || !pool.length) return null;
    const matching = currentTopic ? pool.filter((d) => d.topic === currentTopic) : [];
    const use = matching.length ? matching : pool;
    const idx = hashKey(`${dayKey}:${tag}`) % use.length;
    return use[idx];
  }

  const questions = [];
  const bugs = [...(recurringBugs || [])]
    .filter((b) => b && b.tag && b.tag !== "khac")
    .sort((a, b) => {
      if (currentTopic) {
        const aMatch = (byTag.get(a.tag) || []).some((d) => d.topic === currentTopic) ? 1 : 0;
        const bMatch = (byTag.get(b.tag) || []).some((d) => d.topic === currentTopic) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return (b.count || 0) - (a.count || 0);
    });

  for (const bug of bugs) {
    if (questions.length >= MAX_QUESTIONS) break;
    const doc = pickDoc(bug.tag);
    if (!doc) continue; // a bug with no readable evidence yields no question — never invent one
    const seed = hashKey(`${dayKey}:${bug.tag}`) % 1000;
    questions.push({
      tag: bug.tag,
      tagLabel: tagLabel(bug.tag),
      verdict: doc.verdict || "WA",
      problemId: doc.problemId || "",
      seenCount: bug.count || 1,
      lastSeen: bug.lastSeen || "",
      why: String(doc.diagnosis.why),
      hint: String(doc.diagnosis.hint || ""),
      choices: buildChoices(bug.tag, seed),
    });
  }

  return { questions };
}

module.exports = { buildQuiz, buildChoices, MAX_QUESTIONS, CHOICES };
