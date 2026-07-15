"use strict";

// routes/arena-weekly.js — S9 "Đấu Trường Cuối Tuần". Mounted at /api/arena.
// A self-contained mini-domain: it reuses whatever real problems the student
// already has, judged through the EXISTING /judge route (this file never
// compiles/runs anything), and only wraps that with a server-enforced cutoff
// clock + ICPC-style standings. No AI import anywhere in this file, by design.

const path = require("path");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const weeklyStore = require("../arena/weeklyStore");
const weekly = require("../arena/weekly");
const { asyncHandler } = require("./_util");

const router = express.Router();
const WEEKLY_FILE = path.join(config.DATA_DIR, "arena-weekly.json");

function withStatus(session) {
  const cutoff = weekly.computeCutoffStatus(session, Date.now());
  const standing = weekly.computeStanding({ problemIds: session.problemIds, submissions: session.submissions, startedAt: session.startedAt });
  return { ...session, ...cutoff, standing };
}

// POST /api/arena/weekly/start  { problemIds: string[], durationMin }
router.post("/weekly/start", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const problemIds = Array.isArray(body.problemIds) ? [...new Set(body.problemIds.map(String))] : [];
  if (problemIds.length === 0) return res.status(400).json({ ok: false, error: "Cần chọn ít nhất một bài." });

  for (const pid of problemIds) {
    if (!(await problemStore.problemExists(pid))) {
      return res.status(400).json({ ok: false, error: `Bài "${pid}" không tồn tại.` });
    }
  }

  const session = await weeklyStore.createSession(WEEKLY_FILE, { problemIds, durationMin: body.durationMin, now: Date.now() });
  res.status(201).json({ ok: true, session: withStatus(session) });
}));

// GET /api/arena/weekly/:sessionId
router.get("/weekly/:sessionId", asyncHandler(async (req, res) => {
  const session = await weeklyStore.getSession(WEEKLY_FILE, req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: "Không tìm thấy phiên đấu." });
  res.json({ ok: true, session: withStatus(session) });
}));

// POST /api/arena/weekly/:sessionId/submit  { problemId, verdict }
// Called by the CLIENT after a normal /judge call already ran for real — this
// route never judges anything itself, it only records+gates by the cutoff.
router.post("/weekly/:sessionId/submit", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const problemId = String(body.problemId || "");
  const verdict = String(body.verdict || "");
  if (!problemId || !verdict) return res.status(400).json({ ok: false, error: "Thiếu problemId hoặc verdict." });

  const result = await weeklyStore.submit(WEEKLY_FILE, req.params.sessionId, { problemId, verdict, now: Date.now() });
  if (!result.ok) {
    const messages = { "not-found": "Không tìm thấy phiên đấu.", "not-in-session": "Bài này không thuộc phiên đấu.", closed: "Trận đã kết thúc — nộp bài không còn được tính." };
    return res.status(400).json({ ok: false, error: messages[result.reason] || "Không ghi nhận được." , reason: result.reason });
  }
  res.json({ ok: true, session: withStatus(result.session) });
}));

// POST /api/arena/weekly/:sessionId/close
router.post("/weekly/:sessionId/close", asyncHandler(async (req, res) => {
  const result = await weeklyStore.closeSession(WEEKLY_FILE, req.params.sessionId, Date.now());
  if (!result.ok) return res.status(404).json({ ok: false, error: "Không tìm thấy phiên đấu." });
  res.json({ ok: true, session: withStatus(result.session) });
}));

module.exports = router;
