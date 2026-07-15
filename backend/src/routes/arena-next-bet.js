"use strict";

// routes/arena-next-bet.js — "Kèo 3 cửa" (Revenge / Self-select / Mystery
// Bet) HTTP surface. Mounted at /api/arena. Assembles candidates from every
// problem's meta + its Reference Vault's Gauntlet result, feeds them through
// arena/nextBet.js's pure doors, and persists only the one thing that needs
// memory across requests: which Mystery Bet is currently committed.

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const referenceStore = require("../arena/referenceStore");
const ratingStore = require("../arena/ratingStore");
const match = require("../arena/match");
const nextBet = require("../arena/nextBet");
const nextBetStore = require("../arena/nextBetStore");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");
const NEXT_BET_FILE = path.join(config.DATA_DIR, "arena-next-bet.json");

async function buildCandidates() {
  const summaries = await problemStore.listProblems();
  const candidates = [];
  for (const s of summaries) {
    const meta = await problemStore.readMeta(s.id);
    const vault = await referenceStore.readMeta(s.id);
    const matchState = meta.match || {};
    candidates.push({
      id: s.id,
      title: meta.title,
      topic: meta.topic,
      tags: meta.tags,
      cfRating: (meta.analysis && Number(meta.analysis.cfRating)) || 0,
      updatedAt: meta.updatedAt,
      matchState: matchState.state || "none",
      matchOutcome: matchState.outcome || null,
      matchRated: matchState.rated == null ? null : matchState.rated,
      // Same predicate the rated gate uses (arena/match.js's wasEverSolved) —
      // NOT just matchState==="closed": a problem solved before the Arena
      // existed (no meta.match at all) must still count as solved here, or
      // it keeps re-offering itself as a "fresh" kèo forever.
      solved: match.wasEverSolved(meta),
      gauntletLastResult: (vault.gauntlet && vault.gauntlet.lastResult) || null,
    });
  }
  return candidates;
}

function candidateById(candidates, id) {
  return candidates.find((c) => c.id === id) || null;
}

async function loadStakeContext() {
  const state = await ratingStore.load(RATING_FILE);
  return { rating: state.rating, gamesPlayed: state.gamesPlayed };
}

// GET /api/arena/next-bet
router.get("/next-bet", asyncHandler(async (req, res) => {
  const candidates = await buildCandidates();
  const stakeCtx = await loadStakeContext();

  // Revenge is the one true exclusion boundary: a debt has its own door and
  // must never be re-offered as a casual choice or a "surprise". Self-select
  // and Mystery Bet otherwise draw from the SAME in-band pool — a coincidental
  // overlap (the RNG happens to land on a problem also visible in self-select)
  // is honest, not a bug; excluding one from the other only starves Mystery
  // Bet empty on small workspaces for no real benefit.
  const revenge = nextBet.pickRevenge(candidates).map((c) => nextBet.withStakes(c, stakeCtx));
  const revengeIds = revenge.map((c) => c.id);
  const selfSelect = nextBet.pickSelfSelect(candidates, stakeCtx.rating, { excludeIds: revengeIds })
    .slice(0, 8)
    .map((c) => nextBet.withStakes(c, stakeCtx));

  // Reconcile the committed Mystery Bet against CURRENT state: gone or
  // already-solved (student beat it through some other door) → clear it.
  let committed = await nextBetStore.getPick(NEXT_BET_FILE);
  if (committed) {
    const still = candidateById(candidates, committed.problemId);
    if (!still || (still.matchState === "closed" && still.matchOutcome === "ac")) {
      await nextBetStore.clearPick(NEXT_BET_FILE);
      committed = null;
    }
  }
  if (!committed) {
    const picked = nextBet.pickMysteryBet(candidates, stakeCtx.rating, { excludeIds: revengeIds });
    if (picked) committed = await nextBetStore.commitPick(NEXT_BET_FILE, picked.id);
  }

  let mysteryBet = null;
  if (committed) {
    const full = candidateById(candidates, committed.problemId);
    if (full) {
      const withStakes = nextBet.withStakes(full, stakeCtx);
      mysteryBet = committed.openedAt
        ? { ...withStakes, opened: true }
        : { ...nextBet.redactCandidate(withStakes), opened: false };
    }
  }

  res.json({ ok: true, revenge, selfSelect, mysteryBet });
}));

// POST /api/arena/next-bet/mystery/open — the moment of opening the pack:
// full reveal (you're about to read the statement anyway — hiding the topic
// past this point would just be lying). Idempotent.
router.post("/next-bet/mystery/open", asyncHandler(async (req, res) => {
  const opened = await nextBetStore.openPick(NEXT_BET_FILE);
  if (!opened) return res.status(400).json({ ok: false, error: "Chưa có kèo ẩn nào được chốt." });
  const candidates = await buildCandidates();
  const full = candidateById(candidates, opened.problemId);
  if (!full) return res.status(404).json({ ok: false, error: "Bài của kèo ẩn không còn tồn tại." });
  const stakeCtx = await loadStakeContext();
  res.json({ ok: true, problem: nextBet.withStakes(full, stakeCtx) });
}));

// POST /api/arena/next-bet/mystery/reroll — refused once the current pick has
// been opened (no dodging a scary fight you've already seen), or inside the
// 24h cooldown (anti-farm: rerolling isn't free just because it's unopened).
// Checked BEFORE looking for a replacement candidate — "already opened" must
// win even when there's nothing else left in the band to reroll into.
router.post("/next-bet/mystery/reroll", asyncHandler(async (req, res) => {
  const current = await nextBetStore.getPick(NEXT_BET_FILE);
  if (current && current.openedAt) {
    return res.status(409).json({ ok: false, reason: "already-opened" });
  }

  const candidates = await buildCandidates();
  const stakeCtx = await loadStakeContext();
  const excludeIds = current ? [current.problemId] : [];
  const picked = nextBet.pickMysteryBet(candidates, stakeCtx.rating, { excludeIds });
  if (!picked) return res.status(400).json({ ok: false, error: "Không còn bài nào trong tầm để đổi kèo ẩn." });

  const result = await nextBetStore.reroll(NEXT_BET_FILE, picked.id);
  if (!result.ok) return res.status(409).json({ ok: false, reason: result.reason, retryAfterMs: result.retryAfterMs });
  res.json({ ok: true, mysteryBet: { ...nextBet.redactCandidate(nextBet.withStakes(picked, stakeCtx)), opened: false } });
}));

module.exports = router;
