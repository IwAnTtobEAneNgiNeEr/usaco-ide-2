"use strict";

// session-analyze.js — Game Review's pure analysis core (README-LOOPS.md
// tasks C1/C2). Turns the raw event timeline from recorder.js into a
// chess.com-style "how did this game go" verdict: a process score plus the
// signals behind it.
//
// The one rule this file exists to enforce: score only what is actually
// recorded. Today that's "verdict" (from the judge route) and "run" (from
// the single-test route) events. There is deliberately no "read the
// statement before coding" term yet — no open-statement event is wired, and
// inventing a number for it would break the project's evidence-only rule
// (README-LOOPS.md §1.2). Add that term the day the event exists, not before.

const DEFAULT_IDLE_GAP_MS = 2 * 60 * 60 * 1000; // 2h — beyond this, it's a new sitting

const W_MANUAL = 20; // reward: fraction of submits preceded by a manual test run
const W_REPEAT = 15; // penalty per repeated-no-progress WA (same passed count twice running)
const REPEAT_CAP = 3; // stop compounding the penalty past 3 occurrences
const W_DEBUG = 25; // penalty for time spent after a failing verdict, beyond the free ratio
const DEBUG_FREE_RATIO = 0.6;

const FORMULA =
  "100 + 20·tỉLệTựKiểmTraTrướcKhiNộp − 15·min(lầnLặpKhôngTiếnBộ,3) − 25·max(0, tỉLệThờiGianGỡLỗi − 0.6)";

/** Sort ascending by t, then break into sessions wherever the gap exceeds idleGapMs. */
function splitSessions(events, opts = {}) {
  const idleGapMs = opts.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
  const sorted = [...(events || [])].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return [];
  const sessions = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].t - sorted[i - 1].t;
    if (gap > idleGapMs) sessions.push([]);
    sessions[sessions.length - 1].push(sorted[i]);
  }
  return sessions;
}

/** Pure scoring arithmetic — kept separate so the formula can be tested by number, not by timeline. */
function computeProcessScore({ manualTestRate, repeatedNoProgressCount, debugRatio }) {
  const raw =
    100 +
    W_MANUAL * manualTestRate -
    W_REPEAT * Math.min(repeatedNoProgressCount, REPEAT_CAP) -
    W_DEBUG * Math.max(0, debugRatio - DEBUG_FREE_RATIO);
  const value = Math.max(0, Math.min(100, Math.round(raw)));
  return { value, manualTestRate, repeatedNoProgressCount, debugRatio, formula: FORMULA };
}

/**
 * Analyze one session's worth of events (already split by splitSessions, or
 * the whole per-problem history if the caller doesn't care about splitting).
 * Only verdicts up to and including the first AC count — later re-submits
 * are a different "game" and shouldn't dilute this one's score.
 */
function analyzeSession(events) {
  const sorted = [...(events || [])].sort((a, b) => a.t - b.t);
  const sessionStart = sorted.length ? sorted[0].t : 0;
  const verdicts = sorted.filter((e) => e.type === "verdict");

  if (verdicts.length === 0) {
    return {
      attempts: 0,
      acAt: null,
      timeline: [],
      manualTestRate: 0,
      repeatedNoProgressCount: 0,
      debugRatio: 0,
      totalMs: 0,
      score: null,
    };
  }

  const acIndex = verdicts.findIndex((v) => v.data && v.data.verdict === "AC");
  const relevant = acIndex >= 0 ? verdicts.slice(0, acIndex + 1) : verdicts;

  const timeline = relevant.map((v, i) => {
    const windowStart = i === 0 ? sessionStart : relevant[i - 1].t;
    const manualTestBeforeSubmit = sorted.some(
      (e) => e.type === "run" && e.t >= windowStart && e.t < v.t
    );
    return {
      t: v.t,
      verdict: v.data && v.data.verdict,
      passed: v.data && v.data.passed,
      total: v.data && v.data.total,
      manualTestBeforeSubmit,
    };
  });

  const manualTestRate = timeline.filter((e) => e.manualTestBeforeSubmit).length / timeline.length;

  let repeatedNoProgressCount = 0;
  for (let i = 1; i < relevant.length; i += 1) {
    const prev = relevant[i - 1].data || {};
    const cur = relevant[i].data || {};
    if (prev.verdict !== "AC" && cur.verdict !== "AC" && prev.passed === cur.passed) {
      repeatedNoProgressCount += 1;
    }
  }

  let debugMs = 0;
  for (let i = 1; i < relevant.length; i += 1) {
    if ((relevant[i - 1].data || {}).verdict !== "AC") {
      debugMs += relevant[i].t - relevant[i - 1].t;
    }
  }
  const totalMs = relevant[relevant.length - 1].t - sessionStart;
  const debugRatio = totalMs > 0 ? debugMs / totalMs : 0;

  return {
    attempts: relevant.length,
    acAt: acIndex >= 0 ? verdicts[acIndex].t : null,
    timeline,
    manualTestRate,
    repeatedNoProgressCount,
    debugRatio,
    totalMs,
    score: computeProcessScore({ manualTestRate, repeatedNoProgressCount, debugRatio }),
  };
}

/**
 * Rule-based, deterministic commentary (no AI) — the chess.com "good move /
 * mistake" voice, but every line traces back to a field on `analysis`. Add a
 * rule only when there's a real signal to hang it on.
 */
function buildNotes(analysis) {
  if (!analysis || analysis.attempts === 0) return ["Chưa có lần nộp nào để tổng kết."];
  const notes = [];
  if (analysis.attempts === 1 && analysis.acAt) {
    notes.push("✅ AC ngay lần nộp đầu tiên.");
  }
  if (analysis.manualTestRate === 0 && analysis.attempts > 1) {
    notes.push("⚠ Không có lần test tay nào trước khi nộp — thử chạy thử trước khi nộp lần sau.");
  }
  if (analysis.repeatedNoProgressCount > 0) {
    notes.push(
      `⚠ Có ${analysis.repeatedNoProgressCount} lần nộp liên tiếp không cải thiện số test qua — có thể đang sửa nhầm chỗ.`
    );
  }
  if (analysis.debugRatio > DEBUG_FREE_RATIO) {
    notes.push("🔍 Phần lớn thời gian nằm ở gỡ lỗi sau khi WA — thử đọc kỹ lại đề/test trước khi sửa tiếp.");
  }
  if (!analysis.acAt) {
    notes.push("⏳ Bài chưa AC trong phiên này.");
  }
  return notes;
}

module.exports = { splitSessions, analyzeSession, computeProcessScore, buildNotes, FORMULA };
