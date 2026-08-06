"use strict";

// routes/arena-rush.js — "Sới Đập Lỗi" (Bug Rush) HTTP surface. Mounted at
// /api/arena. One player, one run at a time: the run itself (not a separate
// id-keyed store) holds the full in-flight drill, since there's never more
// than one in flight — see arena/rush.js's defaultRun header comment.
//
// Deck-first serving: POST /start and the "give me the next drill" step
// inside POST /submit both try arena/rushStore.takeDrill() before ever
// calling the AI — the whole point of the background low-water-mark top-up
// below is that a player mid-run almost never waits on generation.

const path = require("path");
const express = require("express");
const config = require("../config");
const settingsStore = require("../settingsStore");
const judgeService = require("../judgeService");
const studentModel = require("../studentModel");
const rush = require("../arena/rush");
const rushStore = require("../arena/rushStore");
const orchestrator = require("../arena/rushOrchestrator");
const cardStore = require("../arena/cardStore");
const { asyncHandler } = require("./_util");

const router = express.Router();
const RUN_FILE = path.join(config.DATA_DIR, "arena-rush-run.json");
const DECK_FILE = path.join(config.DATA_DIR, "arena-rush-deck.json");
const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");

// ---- drill sourcing --------------------------------------------------------

/** Generate ONE fresh, self-verified drill (blocking — only used when the
 *  deck is empty and the player is waiting right now). */
async function generateFreshDrill(level) {
  const aiSettings = await settingsStore.getAiSettings();
  if (!aiSettings.apiKey) {
    const e = new Error("Cần API key (Settings → AI) để chơi Sới Đập Lỗi.");
    e.code = "NO_KEY";
    throw e;
  }
  const judgeSettings = await settingsStore.getSettings();
  const model = await studentModel.load(STUDENT_MODEL_FILE);
  const tag = rush.chooseTargetTag(model.recurringBugs);
  const difficultyLabel = rush.difficultyLabelForLevel(level);
  const avoidTitles = await rushStore.recentTitles(DECK_FILE);
  return orchestrator.generateAndVerifyDrill({ aiSettings, judgeSettings, tag, difficultyLabel, avoidTitles });
}

/** Deck-first: pop a ready drill if one exists, else generate synchronously. */
async function ensureDrill(level) {
  const fromDeck = await rushStore.takeDrill(DECK_FILE);
  if (fromDeck) return fromDeck;
  return generateFreshDrill(level);
}

/** Fire-and-forget top-up so the NEXT few drills are usually already sitting
 *  in the deck — never awaited by the request that triggers it (same
 *  discipline as recorder.js's "must never slow down the real response").
 *
 *  Attached to `router` (not called as a bare local function) and always
 *  invoked as `router.maybeRefillDeck(...)` below — a fire-and-forget call
 *  can keep running AFTER a test's try/finally block has already restored
 *  ai.generateRushDrill/settingsStore.getAiSettings to the REAL ones, so
 *  tests need a hook that can replace this specific call with a no-op for
 *  their whole duration. Routing every call through the shared `router`
 *  object (the same object `module.exports` points at) is what makes that
 *  override actually take effect — reassigning a captured local reference
 *  would not. */
router.maybeRefillDeck = function maybeRefillDeck(level) {
  rushStore.deckSize(DECK_FILE).then(async (size) => {
    if (size >= config.RUSH.deckLowWaterMark) return;
    for (let i = 0; i < config.RUSH.deckRefillBatch; i++) {
      try {
        const drill = await generateFreshDrill(level);
        await rushStore.addDrill(DECK_FILE, drill);
      } catch { /* best-effort — a failed background top-up just means the next
                   player-facing fetch falls back to synchronous generation */ }
    }
  }).catch(() => {});
};

// ---- client-safe shaping ----------------------------------------------------

// The client gets exactly enough to attempt: buggyCode + a clock deadline —
// never `tests` (the answer key) or `bugSummary`/`tag` (revealed only after
// this drill resolves, win or lose).
function clientRun(state) {
  const { run, highScore, totalRunsPlayed } = state;
  const sample = run.currentDrill && Array.isArray(run.currentDrill.tests)
    ? run.currentDrill.tests.find((test) => String(test.input || "").trim())
    : null;
  return {
    state: run.state, lives: run.lives, score: run.score, level: run.level,
    deadlineAt: run.deadlineAt,
    hintLevel: run.hintLevel || 0,
    drill: run.currentDrill ? {
      drillId: run.currentDrill.id,
      title: run.currentDrill.title,
      buggyCode: run.currentDrill.buggyCode,
      difficultyLabel: run.currentDrill.difficultyLabel,
      samples: sample ? [{ input: sample.input, output: sample.expected }] : []
    } : null,
    highScore, totalRunsPlayed
  };
}

// Legacy deck drills predate hint1/hint2 — derive a usable fallback from what
// they DO carry so the hint button never dead-ends mid-run.
function hintTextFor(drill, level) {
  if (level <= 1) {
    return (drill.hint1 && String(drill.hint1).trim())
      || "Chạy thử code với một input nhỏ em tự nghĩ, so kết quả với tính tay — vùng nào cho số lệch, bug nằm quanh đó.";
  }
  return (drill.hint2 && String(drill.hint2).trim())
    || (drill.tag ? `Loài bug của bài này: «${drill.tag}». Soát lại đúng chỗ hay dính loại lỗi đó.` : "Soát kỹ điều kiện biên của vòng lặp và các phép so sánh.");
}

// ---- routes -------------------------------------------------------------------

// POST /api/arena/rush/start — abandons any in-progress run, starts fresh.
router.post("/rush/start", asyncHandler(async (req, res) => {
  const now = Date.now();
  let run = rush.startRun(now);
  let drill;
  try {
    drill = await ensureDrill(run.level);
  } catch (error) {
    const status = error.code === "NO_KEY" || error.code === "NO_COMPILER" ? 400 : 502;
    return res.status(status).json({ ok: false, error: error.message, code: error.code || "" });
  }
  run = rush.assignDrill(run, { drill, now });
  const state = await rushStore.saveRun(RUN_FILE, run);
  router.maybeRefillDeck(run.level);
  res.json({ ok: true, run: clientRun(state) });
}));

// GET /api/arena/rush/state — reload-resilient view of whatever is current.
// An active run whose deadline already passed (the app was closed mid-drill)
// is resolved as a timeout HERE, so a resumed session never shows a dead
// "Còn 0s" clock on a drill the server already considers lost.
router.get("/rush/state", asyncHandler(async (req, res) => {
  let state = await rushStore.loadRunState(RUN_FILE);
  let expired = false;
  let expiredReveal = "";
  const now = Date.now();
  const active = state.run.state === "active" && state.run.currentDrill;
  if (active && state.run.deadlineAt != null && now > state.run.deadlineAt) {
    expiredReveal = (state.run.currentDrill && state.run.currentDrill.bugSummary) || "";
    const { run: resolved } = rush.resolveAttempt(state.run, { correct: false, now });
    state = await rushStore.saveRun(RUN_FILE, resolved);
    expired = true;
  }
  res.json({ ok: true, run: clientRun(state), expired, expiredReveal });
}));

// POST /api/arena/rush/run  { code, input, expected }
// Custom-input run for the canonical coding workspace. It is intentionally
// side-effect free: no hidden tests, no score/life change, no next drill.
router.post("/rush/run", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code : "";
  const input = typeof body.input === "string" ? body.input : "";
  const expected = typeof body.expected === "string" ? body.expected : "";
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiáº¿u code." });

  const state = await rushStore.loadRunState(RUN_FILE);
  if (state.run.state !== "active" || !state.run.currentDrill) {
    return res.status(400).json({ ok: false, error: "KhÃ´ng cÃ³ vÃ¡n Rush nÃ o Ä‘ang diá»…n ra." });
  }
  const judgeSettings = await settingsStore.getSettings();
  const result = await judgeService.compileAndRun({ code, settings: judgeSettings, input, expected });
  res.json({ ok: true, ...result });
}));

// POST /api/arena/rush/hint — progressive, server-authoritative hints for the
// CURRENT drill. Level 1 khoanh vùng (free), level 2 kỹ thuật (costs 1 điểm).
// Never returns bugSummary or the fix — those stay sealed until the drill
// resolves. Asking again past level 2 just replays the level-2 hint.
router.post("/rush/hint", asyncHandler(async (req, res) => {
  const state = await rushStore.loadRunState(RUN_FILE);
  const run = state.run;
  if (run.state !== "active" || !run.currentDrill) {
    return res.status(400).json({ ok: false, error: "Không có ván Rush nào đang diễn ra." });
  }
  const { run: nextRun, level } = rush.useHint(run);
  const savedState = await rushStore.saveRun(RUN_FILE, nextRun);
  res.json({
    ok: true,
    level,
    hint: hintTextFor(run.currentDrill, level),
    run: clientRun(savedState)
  });
}));

// POST /api/arena/rush/submit  { code }
router.post("/rush/submit", asyncHandler(async (req, res) => {
  const code = typeof (req.body || {}).code === "string" ? req.body.code : "";
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiếu code." });

  const state = await rushStore.loadRunState(RUN_FILE);
  const run = state.run;
  if (run.state !== "active" || !run.currentDrill) {
    return res.status(400).json({ ok: false, error: "Không có ván Rush nào đang diễn ra." });
  }

  const drill = run.currentDrill;
  const judgeSettings = await settingsStore.getSettings();
  const judged = await judgeService.compileAndJudge({ code, settings: judgeSettings, tests: drill.tests });
  const correct = judged.verdict === "AC";
  const now = Date.now();

  const { run: resolvedRun, outcome } = rush.resolveAttempt(run, { correct, now });

  // A real squash trains the card — same ledger, same day-cap, as Flash Quiz
  // (cardStore.js). Deliberately ONE-directional: a Rush miss costs a life
  // but never un-tames a card — arcade panic isn't the same signal as real
  // mastery loss, and conflating the two would make losing a life punish you
  // twice. See cardStore.applyTraining's own anti-farm gate for the day-cap.
  if (outcome === "correct") {
    try { await cardStore.mint(CARDS_FILE, drill.tag, { evidence: `rush:${drill.id}`, seenAt: new Date(now).toISOString() }); } catch { /* best-effort */ }
    try { await cardStore.applyTraining(CARDS_FILE, drill.tag, { correct: true, now: new Date(now).toISOString() }); } catch { /* best-effort */ }
  }

  let finalRun = resolvedRun;
  // A "wrong" with lives left keeps the SAME drill on the SAME clock — only a
  // resolved drill (correct/timeout) or a dead run needs the next one fetched.
  if (finalRun.state === "active" && !finalRun.currentDrill) {
    try {
      const nextDrill = await ensureDrill(finalRun.level);
      finalRun = rush.assignDrill(finalRun, { drill: nextDrill, now });
    } catch (error) {
      // Can't fetch a next drill (no key / AI down) — end the run honestly
      // rather than leaving it silently stuck with nothing to serve.
      finalRun = { ...finalRun, state: "over", finishedAt: now, currentDrill: null, deadlineAt: null };
    }
  }
  const savedState = await rushStore.saveRun(RUN_FILE, finalRun);
  router.maybeRefillDeck(finalRun.level);

  // The reveal (tag + bugSummary) is earned, not blurted: it ships only once
  // this drill is actually over — solved, timed out, or the run ended. A
  // wrong-but-alive attempt gets nothing; that's what the hint route is for.
  const drillResolved = outcome !== "wrong" || finalRun.state !== "active";
  res.json({
    ok: true, outcome,
    result: drillResolved ? { tag: drill.tag, bugSummary: drill.bugSummary } : null,
    judge: { verdict: judged.verdict, summary: judged.summary },
    run: clientRun(savedState)
  });
}));

module.exports = router;
