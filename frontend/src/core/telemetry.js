// core/telemetry.js — thin bus-to-backend bridge for the NCKH research
// metrics (docs/NCKH.md §5: A/B/C/D). Only events that feed those four
// numbers are sent (§8: "không thêm event telemetry không phục vụ A-D").
// Fire-and-forget: telemetry must never block the UI or throw into it.

const SESSION_KEY = "usaco-telemetry-session";
const IDLE_MS = 30000;

function sessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function send(event, payload = {}) {
  const body = JSON.stringify({ event, sessionId: sessionId(), payload });
  fetch("/api/telemetry/event", { method: "POST", headers: { "Content-Type": "application/json" }, body })
    .catch(() => {}); // best-effort — a dropped event must never surface to the student
}

export function initTelemetry(app) {
  if (!app.bus) return;

  send("session_start");

  app.bus.on("problem:opened", (payload) => send("problem_opened", { problemId: payload && payload.id }));
  app.bus.on("verdict", (payload) => {
    if (!payload || payload.kind !== "judge") return; // scratch "run" isn't a funnel step
    send("judge_verdict", { verdict: payload.verdict });
  });
  // Xưởng funnel steps — emitted directly by features/xuong.js onto the bus.
  app.bus.on("xuong:started", (payload) => send("xuong_started", { problemId: payload && payload.problemId }));
  app.bus.on("xuong:project_ran", (payload) => send("xuong_project_ran", { projectId: payload && payload.projectId }));

  // Metric A (NCKH §5): "số lần người dùng phải tự nghĩ 'giờ làm gì tiếp'".
  // v1 proxy: no click/keydown anywhere in the app for 30s straight. Coarser
  // than "stuck mid-task", but cheap and directionally right — refine once
  // real sessions show whether it over- or under-counts.
  let lastActivity = Date.now();
  let idleFired = false;
  const markActive = () => { lastActivity = Date.now(); idleFired = false; };
  document.addEventListener("click", markActive, { passive: true });
  document.addEventListener("keydown", markActive, { passive: true });
  setInterval(() => {
    if (idleFired || Date.now() - lastActivity < IDLE_MS) return;
    idleFired = true;
    send("idle_30s", { problemId: app.state.currentId || null });
  }, 5000);
}
