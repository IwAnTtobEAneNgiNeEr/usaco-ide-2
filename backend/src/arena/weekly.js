"use strict";

// weekly.js — pure core of "Đấu Trường Cuối Tuần" (S9). ICPC-style scoring
// (solved count, then penalty minutes) over a REAL cutoff — the one external,
// uncontestable clock the whole Arena leans on for its highest-stakes event.
// Deliberately its OWN small domain (NOT the AI Contest Generator's
// workspace/contests/ — that domain's whole reason to exist is AI-authored
// problems; this reuses whatever real problems the student already has and
// never calls the AI at all, so contest integrity there is untouched).
//
// Pure: no fs, no Date.now() (caller passes `now`).

const PENALTY_PER_WRONG_MIN = 20; // standard ICPC penalty convention

function computeCutoffStatus(session, now) {
  const cutoffAt = Number(session && session.cutoffAt) || 0;
  const open = now < cutoffAt && !(session && session.closedAt);
  return { open, remainingMs: Math.max(0, cutoffAt - now), closed: !open };
}

/**
 * @param {object} args
 * @param {string[]} args.problemIds
 * @param {Array} args.submissions - [{problemId, at, verdict}], any order
 * @param {number} args.startedAt
 */
function computeStanding({ problemIds, submissions, startedAt }) {
  const subsByProblem = new Map();
  for (const s of Array.isArray(submissions) ? submissions : []) {
    if (!subsByProblem.has(s.problemId)) subsByProblem.set(s.problemId, []);
    subsByProblem.get(s.problemId).push(s);
  }

  let solvedCount = 0;
  let penaltyMin = 0;
  const perProblem = {};
  for (const pid of Array.isArray(problemIds) ? problemIds : []) {
    const subs = (subsByProblem.get(pid) || []).slice().sort((a, b) => a.at - b.at);
    const acIndex = subs.findIndex((s) => s.verdict === "AC");
    if (acIndex === -1) {
      perProblem[pid] = { solved: false, wrongCount: subs.length, solveMin: null };
      continue;
    }
    const wrongBefore = acIndex; // every submission before the first AC, by construction
    const solveMin = Math.max(0, Math.round((subs[acIndex].at - startedAt) / 60000));
    perProblem[pid] = { solved: true, wrongCount: wrongBefore, solveMin };
    solvedCount += 1;
    penaltyMin += solveMin + wrongBefore * PENALTY_PER_WRONG_MIN;
  }
  return { solvedCount, penaltyMin, perProblem, formula: `phút nộp AC + ${PENALTY_PER_WRONG_MIN}·số lần sai trước AC (chuẩn ICPC)` };
}

module.exports = { PENALTY_PER_WRONG_MIN, computeCutoffStatus, computeStanding };
