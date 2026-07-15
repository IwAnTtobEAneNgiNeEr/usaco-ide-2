"use strict";

// GET /api/planner/session — Giáo Án Động (README-LOOPS.md D1, README-
// AUTOPILOT.md M8). Gathers the ingredients planner.js needs from their
// single sources of truth and hands them to composeSession() — this route is
// intentionally thin; all the actual composition logic lives in the pure,
// fixture-tested planner.js.

const path = require("path");
const express = require("express");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const config = require("../config");
const { computeReviewQueue } = require("../reviewQueue");
const { computeSkillMap } = require("../skills");
const studentModel = require("../studentModel");
const { composeSession } = require("../planner");
const { buildQuiz } = require("../moment/quiz");
const { asyncHandler } = require("./_util");

const router = express.Router();
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");

// Below "gold" (skills.js TIERS: diamond 85 / gold 60 / silver 35 / bronze 15
// / seed 0) still counts as a live weak spot worth another rep.
const FRONTIER_MAX_MASTERY = 60;

router.get("/session", asyncHandler(async (req, res) => {
  const budgetMinutes = Math.min(240, Math.max(0, Number(req.query.budgetMinutes) || 45));

  const summaries = await problemStore.listProblems();
  // allSettled: a problem deleted between the listing and the read (another
  // window, a test run, a sync tool) must not 500 the whole plan.
  const metas = (await Promise.allSettled(summaries.map((s) => problemStore.readMeta(s.id))))
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const reviewQueue = computeReviewQueue(metas);

  const model = await studentModel.load(STUDENT_MODEL_FILE);
  const recurringBugs = Array.isArray(model.recurringBugs) ? model.recurringBugs : [];

  // Frontier: weakest-first topics the student has actually attempted (total
  // > 0). Reads computeSkillMap's already-computed mastery — does not
  // re-derive it (README-LOOPS.md §3.3: "KHÔNG nhân đôi nguồn sự thật").
  const { clusters } = computeSkillMap(metas);
  const skillFrontier = clusters
    .flatMap((c) => c.topics)
    .filter((t) => t.total > 0 && t.mastery < FRONTIER_MAX_MASTERY)
    .sort((a, b) => a.mastery - b.mastery)
    .map((t) => t.topic);

  const candidateProblems = metas
    .filter((m) => m.status !== "solved" && m.lastVerdict !== "AC")
    .map((m) => ({ id: m.id, title: m.title, topic: m.topic, difficulty: m.difficulty }));

  const plan = composeSession({ reviewQueue, recurringBugs, skillFrontier, candidateProblems, budgetMinutes });
  res.json({ ok: true, plan });
}));

// Local-time "2026-07-08" day key — same rotation boundary as a student's
// actual day, not a UTC one (matches progress.js's day-key reasoning for the
// same reason: a quiz that "changes for the day" should change when the
// day changes for the STUDENT).
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET /api/planner/quiz — Flash Quiz material (README-AUTOPILOT.md flow v2).
// Questions are the student's OWN recorded mistakes: the Student Model's
// recurringBugs point at moment/<ts>.json evidence files; this route resolves
// those pointers (inside the workspace only) and hands the loaded docs to the
// pure buildQuiz(). No AI call, no invented content.
//
// ?topic= (optional) — the topic of the problem currently open in the editor,
// if the caller has one. Lets buildQuiz prioritize bugs/evidence from THAT
// topic first instead of always the globally-most-frequent bug regardless of
// what the student is doing right now.
router.get("/quiz", asyncHandler(async (req, res) => {
  const model = await studentModel.load(STUDENT_MODEL_FILE);
  const bugs = Array.isArray(model.recurringBugs) ? model.recurringBugs : [];
  const currentTopic = String(req.query.topic || "");

  const topicCache = new Map(); // problemId -> topic, avoid re-reading the same problem's meta twice
  async function topicFor(problemId) {
    if (!problemId) return "";
    if (topicCache.has(problemId)) return topicCache.get(problemId);
    const exists = await problemStore.problemExists(problemId).catch(() => false);
    const topic = exists ? (await problemStore.readMeta(problemId)).topic || "" : "";
    topicCache.set(problemId, topic);
    return topic;
  }

  const evidenceDocs = [];
  for (const bug of bugs) {
    // Keep the last few pointers per bug — buildQuiz now rotates through all
    // of them by day instead of only ever reading the single newest one.
    const rels = Array.isArray(bug.evidence) ? bug.evidence.slice(-3) : [];
    for (const rel of rels) {
      const abs = path.resolve(config.WORKSPACE_DIR, String(rel));
      if (!abs.startsWith(path.resolve(config.WORKSPACE_DIR) + path.sep)) continue; // stay inside the workspace
      const doc = await fileStore.readJson(abs, null);
      if (doc) evidenceDocs.push({ tag: bug.tag, doc, topic: await topicFor(doc.problemId) });
    }
  }

  res.json({ ok: true, ...buildQuiz(bugs, evidenceDocs, { dayKey: localDayKey(), currentTopic }) });
}));

module.exports = router;
