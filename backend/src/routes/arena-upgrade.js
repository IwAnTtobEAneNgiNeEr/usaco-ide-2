"use strict";

// routes/arena-upgrade.js — "Nâng Kèo RATED 1-click" HTTP surface. Zero AI
// calls in this entire file: every promotion reuses the student's OWN AC'd
// code as the reference, verified against samples the exact same way a
// manual paste is (referenceStore.verifyCodeAgainstSamples). Mounted at
// /api/arena (list + bulk) and /api/problems (single-problem promote).

const express = require("express");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const ai = require("../ai");
const referenceStore = require("../arena/referenceStore");
const upgrade = require("../arena/upgrade");
const match = require("../arena/match");
const { statementHash } = require("../trustLayer");
const { asyncHandler, requireProblem } = require("./_util");

const arenaRouter = express.Router();
const problemsRouter = express.Router();

// The newest history entry that was actually AC, with its code snapshot —
// falling back to the current code file when the problem is currently AC but
// history predates snapshotting. Never invents code that wasn't really run.
async function findAcCode(id, meta) {
  const history = await problemStore.listHistory(id); // newest first
  const acEntry = history.find((h) => h.verdict === "AC" && typeof h.code === "string" && h.code.trim());
  if (acEntry) return acEntry.code;
  if (meta.lastVerdict === "AC") return problemStore.getFile(id, "code");
  return null;
}

async function evaluateOne(summary) {
  const meta = await problemStore.readMeta(summary.id);
  const solved = match.wasEverSolved(meta);
  if (!solved) return null; // not a candidate at all — cheapest possible skip
  const statement = await problemStore.getFile(summary.id, "statement");
  const samples = ai.extractSamples(statement);
  const vaultMeta = await referenceStore.readMeta(summary.id);
  const vaultUsable = referenceStore.evaluateTrust(vaultMeta, statementHash(statement)).usable;
  const evaluation = upgrade.evaluateCandidate({ meta, hasSample: samples.length > 0, vaultUsable });
  return { meta, statement, samples, evaluation };
}

// GET /api/arena/upgrade-candidates — everything actionable right now.
arenaRouter.get("/upgrade-candidates", asyncHandler(async (req, res) => {
  const summaries = await problemStore.listProblems();
  const candidates = [];
  for (const s of summaries) {
    const info = await evaluateOne(s);
    if (!info || !info.evaluation.actionable) continue;
    candidates.push({
      id: s.id, title: info.meta.title,
      cfRating: (info.meta.analysis && Number(info.meta.analysis.cfRating)) || 0,
      evaluation: info.evaluation,
    });
  }
  res.json({ ok: true, candidates, summary: upgrade.summarize(candidates) });
}));

// Promote ONE problem's AC code into its vault + confirm rating if possible.
// Shared by the single-problem route and the bulk one below.
async function promoteOne(id, info, judgeSettings) {
  const { meta, statement, samples, evaluation } = info;
  const out = { id, referencePromoted: false, ratingConfirmed: false, reason: null };

  if (evaluation.canPromoteReference) {
    const code = await findAcCode(id, meta);
    if (!code) {
      out.reason = "no-ac-code";
    } else {
      const check = await referenceStore.verifyCodeAgainstSamples(code, judgeSettings, samples);
      if (check.compilerMissing) out.reason = "no-compiler";
      else if (!check.compiled) out.reason = "compile-failed";
      else if (!check.trusted) out.reason = "sample-mismatch"; // statement likely edited since the AC
      else {
        await referenceStore.setReference(id, code, {
          source: "ac-code", trusted: true, samplesChecked: check.samplesChecked, statementHash: statementHash(statement),
        });
        out.referencePromoted = true;
      }
    }
  }

  if (evaluation.canConfirmRating) {
    await problemStore.updateProblem(id, { analysis: { ...meta.analysis, ratingConfirmed: true } });
    out.ratingConfirmed = true;
  }

  return out;
}

// POST /api/problems/:id/reference/promote-from-ac
problemsRouter.post("/:id/reference/promote-from-ac", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const info = await evaluateOne({ id });
  if (!info) return res.status(400).json({ ok: false, error: "Bài chưa AC — không có code để nâng làm tham chiếu." });
  if (!info.evaluation.actionable) {
    return res.json({ ok: true, referencePromoted: false, ratingConfirmed: false, reason: "already-done" });
  }
  const judgeSettings = await settingsStore.getSettings();
  const result = await promoteOne(id, info, judgeSettings);
  res.json({ ok: true, ...result });
}));

// POST /api/arena/upgrade-candidates/promote-all  { budgetMs? }
// Bulk, one click across the whole workspace. Bounded by wall-clock budget —
// the compile CACHE (runCpp.js) makes a re-promote of anything just judged
// nearly free, so this is fast in practice even across dozens of problems.
arenaRouter.post("/upgrade-candidates/promote-all", asyncHandler(async (req, res) => {
  const budgetMs = Math.min(Math.max(Number((req.body || {}).budgetMs) || 25000, 3000), 60000);
  const startedAt = Date.now();
  const judgeSettings = await settingsStore.getSettings();
  const summaries = await problemStore.listProblems();

  const results = [];
  let budgetHit = false;
  for (const s of summaries) {
    if (Date.now() - startedAt > budgetMs) { budgetHit = true; break; }
    const info = await evaluateOne(s);
    if (!info || !info.evaluation.actionable) continue;
    results.push(await promoteOne(s.id, info, judgeSettings));
  }

  res.json({
    ok: true,
    processed: results.length,
    referencePromoted: results.filter((r) => r.referencePromoted).length,
    ratingConfirmed: results.filter((r) => r.ratingConfirmed).length,
    skipped: results.filter((r) => r.reason).map((r) => ({ id: r.id, reason: r.reason })),
    budgetHit,
  });
}));

module.exports = { arenaRouter, problemsRouter };
