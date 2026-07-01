"use strict";

// Canonical problem lifecycle. Workflow describes what the learner intends to
// do next; verdict describes judge evidence. The legacy `status` field remains
// a derived compatibility projection for older frontends/workspaces.

const WORKFLOW_STATES = new Set(["learning", "reviewing", "archived"]);
const VERDICT_STATES = new Set(["unsolved", "attempted", "solved"]);

function normalizeWorkflow(value, legacyStatus) {
  const raw = String(value || "").toLowerCase();
  if (WORKFLOW_STATES.has(raw)) return raw;
  if (raw === "review") return "reviewing";
  const legacy = String(legacyStatus || "").toLowerCase();
  if (legacy === "review" || legacy === "reviewing") return "reviewing";
  if (legacy === "archived") return "archived";
  return "learning";
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function acceptedAt(history) {
  const values = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && entry.verdict === "AC")
    .map((entry) => validTimestamp(entry.timestamp || entry.at))
    .filter(Boolean)
    .sort();
  return values[0] || null;
}

function deriveLifecycle(meta = {}) {
  const history = Array.isArray(meta.history) ? meta.history : [];
  const historyAcceptedAt = acceptedAt(history);
  const firstAcceptedAt = validTimestamp(meta.firstAcceptedAt) || historyAcceptedAt;
  const historyLastVerdict = history.find((entry) => entry && entry.verdict)?.verdict || null;
  const lastVerdict = meta.lastVerdict || historyLastVerdict || null;
  const explicitAttempts = Number.isFinite(Number(meta.attemptCount))
    ? Math.max(0, Math.floor(Number(meta.attemptCount)))
    : 0;
  const attemptCount = Math.max(explicitAttempts, history.length, lastVerdict ? 1 : 0);

  const explicitVerdict = VERDICT_STATES.has(meta.verdictState) ? meta.verdictState : null;
  let verdictState = "unsolved";
  if (explicitVerdict === "solved" || firstAcceptedAt || historyAcceptedAt || meta.status === "solved") {
    verdictState = "solved";
  } else if (attemptCount > 0 || explicitVerdict === "attempted") {
    verdictState = "attempted";
  }

  return {
    workflowState: normalizeWorkflow(meta.workflowState, meta.status),
    verdictState,
    firstAcceptedAt,
    lastVerdict,
    attemptCount
  };
}

function legacyStatus({ workflowState, verdictState }) {
  if (verdictState === "solved") return "solved";
  if (workflowState === "reviewing") return "review";
  return workflowState;
}

function syncLifecycle(meta) {
  const lifecycle = deriveLifecycle(meta);
  Object.assign(meta, lifecycle);
  meta.status = legacyStatus(lifecycle);
  return meta;
}

function applyLifecyclePatch(meta, patch = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, "workflowState")) {
    meta.workflowState = normalizeWorkflow(patch.workflowState, meta.status);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    const status = String(patch.status || "").toLowerCase();
    if (status === "solved") meta.verdictState = "solved"; // legacy/import compatibility
    else meta.workflowState = normalizeWorkflow(status, status);
  }
  return syncLifecycle(meta);
}

function isSolved(meta) {
  return deriveLifecycle(meta).verdictState === "solved";
}

module.exports = {
  WORKFLOW_STATES,
  VERDICT_STATES,
  normalizeWorkflow,
  deriveLifecycle,
  syncLifecycle,
  applyLifecyclePatch,
  legacyStatus,
  isSolved
};
