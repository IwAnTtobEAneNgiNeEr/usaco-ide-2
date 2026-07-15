"use strict";

// routes/arena-seal.js — "Ấn" (Seal) HTTP surface. Read-only: the tier is
// always DERIVED fresh from meta.history + match + the Reference Vault's
// Gauntlet result + hintsUsed + reviewCount — never its own mutable store, so
// it can never drift from the data it's judging (see arena/seal.js header).
// Mounted at /api/problems (single) and /api/arena (Tàng Ấn archive).

const express = require("express");
const problemStore = require("../problemStore");
const referenceStore = require("../arena/referenceStore");
const seal = require("../arena/seal");
const { asyncHandler, requireProblem } = require("./_util");

const problemsRouter = express.Router();
const arenaRouter = express.Router();

async function computeSealFor(id) {
  const [meta, vault] = await Promise.all([
    problemStore.readMeta(id),
    referenceStore.readMeta(id),
  ]);
  // meta.history (lightweight verdict index, ALWAYS populated by recordRun) —
  // same source reviewQueue.js's computeReviewQueue walks for this exact
  // "chronological verdicts" purpose. problemStore.listHistory() is a
  // DIFFERENT, separate file (detailed code/output snapshots, only written
  // when a run explicitly includes one) — the wrong source here.
  const profile = seal.deriveSolveProfile(meta.history);
  return seal.computeSeal({
    profile,
    gauntletLastResult: (vault.gauntlet && vault.gauntlet.lastResult) || null,
    hintsUsed: meta.hintsUsed,
    reviewCount: meta.reviewCount,
  });
}

// GET /api/problems/:id/seal
problemsRouter.get("/:id/seal", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, seal: await computeSealFor(req.problemId) });
}));

// GET /api/arena/seals — Tàng Ấn: every problem with at least Thô (tier >= 1),
// most recently updated first.
arenaRouter.get("/seals", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const entries = [];
  for (const s of summaries) {
    const result = await computeSealFor(s.id);
    if (result.tier > 0) entries.push({ id: s.id, title: s.title, ...result });
  }
  entries.sort((a, b) => b.tier - a.tier);
  res.json({ ok: true, seals: entries });
}));

module.exports = { problemsRouter, arenaRouter };
