"use strict";

// routes/arena-corefill.js — "Điền Lõi" HTTP surface. Mounted at /api/arena.
// GET next serves an unsolved drill from the deck, generating+self-verifying
// a fresh one (arena/coreFillOrchestrator.js) when the deck has nothing left
// in band. POST attempt reassembles the student's fill into the scaffold and
// judges it against the REAL, execution-derived test set — the same
// judgeService.compileAndJudge every other judge path in this app uses.

const path = require("path");
const express = require("express");
const config = require("../config");
const settingsStore = require("../settingsStore");
const judgeService = require("../judgeService");
const coreFill = require("../arena/coreFill");
const coreFillStore = require("../arena/coreFillStore");
const orchestrator = require("../arena/coreFillOrchestrator");
const { asyncHandler } = require("./_util");

const router = express.Router();
const DECK_FILE = path.join(config.DATA_DIR, "arena-corefill-deck.json");

function drillForClient(d) {
  // Never ship `tests[].expected` or anything about the original core — the
  // client gets exactly what it needs to attempt, nothing that leaks the answer.
  return {
    drillId: d.id,
    title: d.title,
    topic: d.topic,
    rating: d.rating,
    statement: d.statement,
    gapContract: d.gapContract,
    // v2 drills carry labeled multi-gap data + a pre-rendered scaffold;
    // legacy deck entries only have before/after (single anonymous gap).
    gaps: Array.isArray(d.gaps) && d.gaps.length
      ? d.gaps
      : [{ index: 1, label: d.gapContract || "viết đoạn lõi vào đây" }],
    scaffold: typeof d.scaffold === "string" && d.scaffold
      ? d.scaffold
      : coreFill.renderScaffold(d.before, d.after),
    samples: (Array.isArray(d.tests) ? d.tests : []).slice(0, 1).map((test) => ({
      input: String(test.input || ""), output: String(test.expected || "")
    })),
  };
}

// GET /api/arena/corefill/next?topic=&minRating=&maxRating=
router.get("/corefill/next", asyncHandler(async (req, res) => {
  const topic = String(req.query.topic || "");
  const minRating = req.query.minRating != null ? Number(req.query.minRating) : undefined;
  const maxRating = req.query.maxRating != null ? Number(req.query.maxRating) : undefined;

  const state = await coreFillStore.load(DECK_FILE);
  let candidate = coreFill.pickCandidate(state.drills, { topic, minRating, maxRating });

  if (!candidate) {
    const aiSettings = await settingsStore.getAiSettings();
    if (!aiSettings.apiKey) {
      return res.status(400).json({ ok: false, error: "Cần API key (Settings → AI) để tạo bài Điền Lõi.", code: "NO_KEY" });
    }
    const judgeSettings = await settingsStore.getSettings();
    const avoidTitles = await coreFillStore.recentTitles(DECK_FILE);
    try {
      const verified = await orchestrator.generateAndVerifyDrill({ aiSettings, judgeSettings, topic, minRating, maxRating, avoidTitles });
      candidate = await coreFillStore.addDrill(DECK_FILE, verified);
    } catch (error) {
      const status = error.code === "NO_COMPILER" ? 400 : 502;
      return res.status(status).json({ ok: false, error: error.message, code: error.code || "" });
    }
  }

  res.json({ ok: true, drill: drillForClient(candidate) });
}));

// POST /api/arena/corefill/:id/run  { code, input, expected }
// A normal IDE-style custom-input run. This deliberately does NOT read the
// drill's verified hidden tests and never marks the drill solved.
router.post("/corefill/:id/run", asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const drill = await coreFillStore.getDrill(DECK_FILE, id);
  if (!drill) return res.status(404).json({ ok: false, error: "KhÃ´ng tÃ¬m tháº¥y bÃ i Äiá»n LÃµi nÃ y." });

  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code : "";
  const input = typeof body.input === "string" ? body.input : "";
  const expected = typeof body.expected === "string" ? body.expected : "";
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiáº¿u code." });

  const judgeSettings = await settingsStore.getSettings();
  const result = await judgeService.compileAndRun({ code, settings: judgeSettings, input, expected });
  res.json({ ok: true, ...result });
}));

// POST /api/arena/corefill/:id/attempt  { code } | { filledCode }
//
// Two accepted shapes, because the frontend edits the WHOLE scaffold like the
// normal IDE code screen (left: statement, right: full editable program):
//   - `code`       — the entire edited program; judged directly. This is what
//                    the UI sends. before/after are just the fixed context the
//                    student started from; if they touched anything, we judge
//                    what they actually wrote (still a real judge against the
//                    execution-derived tests — honest either way).
//   - `filledCode` — legacy/programmatic: only the gap contents, reassembled
//                    into before+after. Kept so existing callers/tests work.
router.post("/corefill/:id/attempt", asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const body = req.body || {};
  const fullCode = typeof body.code === "string" && body.code.trim() ? body.code : null;
  const filledCode = typeof body.filledCode === "string" ? body.filledCode : "";
  if (!fullCode && !filledCode.trim()) return res.status(400).json({ ok: false, error: "Thiếu code." });

  const drill = await coreFillStore.getDrill(DECK_FILE, id);
  if (!drill) return res.status(404).json({ ok: false, error: "Không tìm thấy bài Điền Lõi này." });

  // `filledCode` reassembly supports both drill generations: v2 drills carry
  // `parts` (skeleton segments around each gap — a single fill string slots
  // into a 1-gap drill), legacy drills carry before/after.
  let assembled;
  if (fullCode != null) {
    assembled = fullCode;
  } else if (Array.isArray(drill.parts) && drill.parts.length) {
    const gapCount = drill.parts.length - 1;
    if (gapCount > 1) {
      return res.status(400).json({ ok: false, error: "Bài này có nhiều đoạn lõi — gửi cả chương trình qua trường `code`." });
    }
    assembled = coreFill.assembleParts(drill.parts, [filledCode]);
  } else {
    assembled = coreFill.assemble(drill.before, filledCode, drill.after);
  }
  const judgeSettings = await settingsStore.getSettings();
  const result = await judgeService.compileAndJudge({ code: assembled, settings: judgeSettings, tests: drill.tests });

  if (result.verdict === "AC" && !drill.solvedAt) {
    await coreFillStore.markSolved(DECK_FILE, id);
  }
  res.json({ ok: true, drillId: id, ...result });
}));

module.exports = router;
