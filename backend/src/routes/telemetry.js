"use strict";

// POST /api/telemetry/event — records one research-metric event (NCKH §5).
// Fixed allowlist: only events that feed A/B/C/D are accepted (NCKH §8:
// "không thêm event telemetry không phục vụ A-D").

const express = require("express");
const telemetryStore = require("../telemetryStore");
const { asyncHandler } = require("./_util");

const router = express.Router();

const ALLOWED_EVENTS = new Set([
  "session_start",     // funnel B: một buổi bắt đầu
  "problem_opened",    // funnel B: mở bài
  "judge_verdict",     // funnel B: AC (và verdict khác, cho ngữ cảnh)
  "xuong_started",      // funnel B: Xưởng start
  "xuong_project_ran",  // funnel B: project runs
  "idle_30s"            // metric A: dừng >30s không có bước tiếp theo
]);

router.post("/event", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const event = String(body.event || "").trim();
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ ok: false, error: "Unknown telemetry event." });
  }
  const sessionId = String(body.sessionId || "").slice(0, 64) || null;
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  await telemetryStore.appendEvent({ event, sessionId, payload });
  res.json({ ok: true });
}));

module.exports = router;
