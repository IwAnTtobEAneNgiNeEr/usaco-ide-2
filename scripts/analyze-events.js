#!/usr/bin/env node
"use strict";

// scripts/analyze-events.js — tính số A và B từ docs/NCKH.md §5, đọc thẳng
// data/events.jsonl. Chạy: node scripts/analyze-events.js
//
//   A = tổng số lần idle_30s (dừng >30s không có bước tiếp theo)
//   B = % problemId đi được mở bài -> AC -> Xưởng start -> project runs
//
// C (self-solve sau 1 tháng trên bộ held-out) và D (mutation-test catch rate)
// cần dữ liệu chưa có (bộ held-out, mutation harness) — không tính ở đây.

const fs = require("fs");
const path = require("path");

const EVENTS_FILE = path.join(__dirname, "..", "data", "events.jsonl");

function loadEvents() {
  if (!fs.existsSync(EVENTS_FILE)) {
    console.error(`Không tìm thấy ${EVENTS_FILE} — chưa có event nào được ghi.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(EVENTS_FILE, "utf8").split("\n").filter((l) => l.trim());
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip a corrupt line */ }
  }
  return events;
}

function computeA(events) {
  const idle = events.filter((e) => e.event === "idle_30s");
  const bySession = {};
  for (const e of idle) bySession[e.sessionId] = (bySession[e.sessionId] || 0) + 1;
  return { total: idle.length, sessions: Object.keys(bySession).length, bySession };
}

// Funnel B is keyed by problemId. xuong_project_ran doesn't carry problemId
// (only projectId), so it counts as "the session that opened Xưởng also ran
// a build" — a session-level proxy until the backend links project->problem.
function computeB(events) {
  const byProblem = {}; // problemId -> { opened, ac, xuongStarted }
  const sessionsWithProjectRun = new Set();

  for (const e of events) {
    if (e.event === "xuong_project_ran") sessionsWithProjectRun.add(e.sessionId);
  }

  for (const e of events) {
    const pid = e.payload && e.payload.problemId;
    if (e.event === "problem_opened" && pid) {
      byProblem[pid] = byProblem[pid] || { opened: 0, ac: 0, xuongStarted: 0, projectRan: 0 };
      byProblem[pid].opened += 1;
    }
    if (e.event === "judge_verdict" && e.payload && e.payload.verdict === "AC") {
      // AC events don't carry problemId (verdict-rail payload doesn't include
      // it) — approximate by crediting whichever problem was opened last in
      // this session.
    }
  }

  // Simpler pass: walk chronologically per session, tracking "current problem".
  const bySession = {};
  for (const e of events.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts))) {
    const s = (bySession[e.sessionId] = bySession[e.sessionId] || { currentProblem: null });
    if (e.event === "problem_opened") {
      s.currentProblem = e.payload && e.payload.problemId;
      if (s.currentProblem) {
        byProblem[s.currentProblem] = byProblem[s.currentProblem] || { opened: 0, ac: 0, xuongStarted: 0, projectRan: 0 };
        byProblem[s.currentProblem].opened += 1;
      }
    } else if (e.event === "judge_verdict" && e.payload && e.payload.verdict === "AC" && s.currentProblem) {
      byProblem[s.currentProblem].ac += 1;
    } else if (e.event === "xuong_started") {
      const pid = (e.payload && e.payload.problemId) || s.currentProblem;
      if (pid && byProblem[pid]) byProblem[pid].xuongStarted += 1;
    } else if (e.event === "xuong_project_ran" && s.currentProblem) {
      if (byProblem[s.currentProblem]) byProblem[s.currentProblem].projectRan += 1;
    }
  }

  const problems = Object.keys(byProblem);
  const reachedAc = problems.filter((p) => byProblem[p].ac > 0).length;
  const reachedXuong = problems.filter((p) => byProblem[p].xuongStarted > 0).length;
  const reachedProject = problems.filter((p) => byProblem[p].projectRan > 0).length;

  return {
    totalProblemsOpened: problems.length,
    reachedAc,
    reachedXuong,
    reachedProject,
    pctAcOfOpened: pct(reachedAc, problems.length),
    pctXuongOfAc: pct(reachedXuong, reachedAc),
    pctProjectOfXuong: pct(reachedProject, reachedXuong),
    pctFullFunnel: pct(reachedProject, problems.length),
    byProblem,
    sessionsWithProjectRun: sessionsWithProjectRun.size
  };
}

function pct(num, den) {
  if (!den) return "n/a";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function main() {
  const events = loadEvents();
  const a = computeA(events);
  const b = computeB(events);

  console.log(`\nTổng số event: ${events.length}\n`);

  console.log("== A — số lần dừng >30s không có bước tiếp theo ==");
  console.log(`  Tổng: ${a.total}  (trải trên ${a.sessions} session)\n`);

  console.log("== B — funnel mở bài -> AC -> Xưởng start -> project runs ==");
  console.log(`  Bài đã mở:        ${b.totalProblemsOpened}`);
  console.log(`  -> AC:             ${b.reachedAc}  (${b.pctAcOfOpened} của bài đã mở)`);
  console.log(`  -> Xưởng start:    ${b.reachedXuong}  (${b.pctXuongOfAc} của bài đã AC)`);
  console.log(`  -> Project chạy:   ${b.reachedProject}  (${b.pctProjectOfXuong} của bài đã vào Xưởng)`);
  console.log(`  Toàn bộ funnel:    ${b.pctFullFunnel} bài đi hết từ mở -> project chạy\n`);
}

main();
