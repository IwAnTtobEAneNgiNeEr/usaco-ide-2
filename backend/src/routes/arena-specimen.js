"use strict";

// routes/arena-specimen.js — "Tiêu bản" HTTP surface: the unified rèn-lại
// queue (problems due for spaced-repetition review + bug cards due for Flash
// Quiz training, one ranked list, one due-clock) and the pre-match scouting
// report ("bạn hay chết vì lỗi gì trong topic này"). Mounted at /api/problems
// (scouting-report) and /api/arena (specimen-queue).

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const reviewQueue = require("../reviewQueue");
const cardStore = require("../arena/cardStore");
const bestiary = require("../arena/bestiary");
const studentModel = require("../studentModel");
const skills = require("../skills");
const { tagLabel } = require("../moment/diagnose");
const { asyncHandler, requireProblem } = require("./_util");

const problemsRouter = express.Router();
const arenaRouter = express.Router();
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");

// GET /api/arena/specimen-queue — problems due for review + cards due for
// training, merged into ONE ranked list (most-overdue-first). Same
// [3,7,21,60] clock powers both (reviewQueue.dueStatus / bestiary.dueForTraining).
arenaRouter.get("/specimen-queue", asyncHandler(async (req, res) => {
  const now = Date.now();
  const summaries = await problemStore.listProblems();
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
  const problemsDue = reviewQueue.computeReviewQueue(metas, { now }).map((p) => ({
    type: "problem",
    id: p.id, title: p.title, topic: p.topic, tags: p.tags,
    overdueBy: p.daysSinceReview - p.nextIntervalDays,
    waBeforeAc: p.waBeforeAc, daysSinceAc: p.daysSinceAc, daysSinceReview: p.daysSinceReview,
    reviewCount: p.reviewCount, nextIntervalDays: p.nextIntervalDays,
  }));

  const cardState = await cardStore.load(CARDS_FILE);
  const cardsDue = Object.values(cardState.cards)
    .filter((c) => c.count > 0)
    .map((c) => ({ card: c, status: bestiary.dueForTraining(c, now) }))
    .filter(({ status }) => status.due)
    .map(({ card, status }) => ({
      type: "card",
      tag: card.tag, label: card.label, level: card.level, levelName: card.levelName,
      overdueBy: status.daysSince - status.intervalDays,
      daysSince: status.daysSince, intervalDays: status.intervalDays,
    }));

  const items = [...problemsDue, ...cardsDue].sort((a, b) => b.overdueBy - a.overdueBy);
  res.json({ ok: true, items });
}));

// GET /api/problems/:id/scouting-report — cross-references studentModel's
// recurring bugs against every OTHER problem sharing this one's skills.js
// cluster, via each bug's own evidence pointers (no new tracking needed —
// evidence already encodes which problem each sighting came from).
problemsRouter.get("/:id/scouting-report", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const meta = await problemStore.readMeta(id);
  const targetCluster = skills.clusterOf(meta.topic).id;

  const [summaries, model] = await Promise.all([
    problemStore.listProblems(),
    studentModel.load(STUDENT_MODEL_FILE),
  ]);
  const clusterByProblemId = new Map(summaries.map((s) => [s.id, skills.clusterOf(s.topic).id]));

  const tally = [];
  for (const bug of Array.isArray(model.recurringBugs) ? model.recurringBugs : []) {
    const evidence = Array.isArray(bug.evidence) ? bug.evidence : [];
    const inCluster = evidence.filter((e) => {
      const match = /^problems\/([^/]+)\//.exec(String(e || ""));
      return match && clusterByProblemId.get(match[1]) === targetCluster;
    });
    if (inCluster.length) tally.push({ tag: bug.tag, label: tagLabel(bug.tag), count: inCluster.length });
  }
  tally.sort((a, b) => b.count - a.count);

  res.json({ ok: true, cluster: targetCluster, bugs: tally.slice(0, 5) });
}));

module.exports = { problemsRouter, arenaRouter };
