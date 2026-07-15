"use strict";

// Pure read-model for the Verified Artifact Loop. It never reads/writes files
// and never persists a verdict/status: Judge history remains the only
// competitive completion truth. Legacy meta fields are compatibility inputs.

const crypto = require("crypto");

const ACTIVITY_KINDS = new Set([
  "competitive-problem",
  "algorithm-module",
  "exercise",
  "contest-item",
]);

const ORIGINS = new Set([
  "imported",
  "ocr",
  "user-authored",
  "ai-generated",
  "derived",
]);

const FAILURE_VERDICTS = new Set(["WA", "CE", "RE", "TLE"]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value == null ? "" : value)).digest("hex");
}

function normalizeMetadata(meta = {}) {
  const legacySource = clean(meta.source);
  const activityKind = ACTIVITY_KINDS.has(meta.activityKind)
    ? meta.activityKind
    : "competitive-problem";
  const origin = ORIGINS.has(meta.origin)
    ? meta.origin
    : legacySource ? "imported" : "user-authored";

  return {
    activityKind,
    // Legacy `source` often names a course/series rather than a publisher.
    // Keep it as collection and use the honest local fallback for provider.
    provider: clean(meta.provider) || "local",
    collection: clean(meta.collection) || legacySource,
    origin,
  };
}

function entryTime(entry) {
  const value = entry && (entry.at || entry.timestamp);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isJudgeEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.type === "run") return false;
  // History before `type` existed represented full submissions. Preserve it.
  return entry.type === "judge" || !entry.type;
}

function judgeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter(isJudgeEntry)
    .slice()
    .sort((a, b) => entryTime(b) - entryTime(a));
}

function hasJudgeAcceptance(history) {
  return judgeHistory(history).some((entry) => entry.verdict === "AC");
}

function hasHistoricalAcceptance(meta = {}) {
  const history = Array.isArray(meta.history) ? meta.history : [];
  if (hasJudgeAcceptance(history)) return true;
  if (meta.status === "solved") return true;
  if (meta.match && meta.match.state === "closed" && meta.match.outcome === "ac") return true;
  // Very old metas may only have lastVerdict. Keep that compatibility signal,
  // but never promote an explicitly typed exploratory Run AC.
  const latest = history.slice().sort((a, b) => entryTime(b) - entryTime(a))[0];
  return meta.lastVerdict === "AC" && (!latest || latest.type !== "run");
}

function matchingSnapshot(entry, detailedHistory) {
  const list = Array.isArray(detailedHistory) ? detailedHistory : [];
  if (entry && entry.id) {
    const byId = list.find((item) => item && item.id === entry.id);
    if (byId) return byId;
  }
  return list.find((item) => item && isJudgeEntry(item) && item.at === entry.at) || null;
}

function deriveStatus({ history, detailedHistory, currentCode } = {}) {
  const all = Array.isArray(history) ? history : [];
  const judges = judgeHistory(all);
  if (!judges.length) return all.length ? "in-progress" : "unverified";

  const latest = judges[0];
  if (latest.verdict !== "AC") return "needs-work";

  const snapshot = matchingSnapshot(latest, detailedHistory);
  if (!snapshot || typeof snapshot.code !== "string") return "historically-accepted";
  if (typeof currentCode !== "string") return "historically-accepted";
  return sha256(snapshot.code) === sha256(currentCode) ? "verified" : "stale";
}

function nextAction({ operation = "summary", verdict, derivedStatus, intent = "competitive", evidence = null } = {}) {
  const evidenceRef = evidence || null;

  if (operation === "run") {
    if (verdict === "CE") {
      return { id: "open-compiler-output", state: "feedback", label: "Mở lỗi biên dịch", reason: "Run bị CE; sửa compiler error trước khi Verify lại.", evidence: evidenceRef };
    }
    if (FAILURE_VERDICTS.has(verdict)) {
      return { id: "inspect-run-evidence", state: "feedback", label: "Xem run đang lỗi", reason: `Run ${verdict} là evidence khám phá, không phải completion.`, evidence: evidenceRef };
    }
    return { id: "judge-full-suite", state: "verify", label: "Judge toàn bộ test", reason: "Run chỉ kiểm tra input hiện tại và không tạo completion.", evidence: evidenceRef };
  }

  if (verdict === "CE") {
    return { id: "open-compiler-output", state: "feedback", label: "Mở lỗi biên dịch", reason: "Full Judge chưa chạy được vì CE.", evidence: evidenceRef };
  }
  if (["WA", "RE", "TLE"].includes(verdict)) {
    return { id: "return-to-work", state: "feedback", label: "Sửa từ evidence", reason: `Judge ${verdict}; quay lại Work với đúng run/test đang fail.`, evidence: evidenceRef };
  }
  if (verdict === "AC") {
    if (intent === "derive-module") {
      if (!evidenceRef) {
        return { id: "judge-full-suite", state: "verify", label: "Tạo evidence mới", reason: "AC cũ chưa có evidence link; Judge lại để bind derivedFrom vào đúng run/snapshot." };
      }
      return { id: "create-grid-pathfinder", state: "evolve", label: "Tạo GridPathfinder", reason: "Judge AC cho snapshot hiện tại; có thể tạo artifact dẫn xuất mà không ghi đè solution.", evidence: evidenceRef };
    }
    return { id: "continue-plan", state: "evolve", label: "Tiếp tục kế hoạch", reason: "Judge AC đã verify solution; AC lịch sử không tự trở thành fresh/rated progress.", evidence: evidenceRef };
  }

  if (derivedStatus === "stale") {
    return { id: "judge-full-suite", state: "verify", label: "Judge lại code hiện tại", reason: "Code hiện tại khác snapshot AC gần nhất." };
  }
  if (derivedStatus === "historically-accepted") {
    return { id: "judge-full-suite", state: "verify", label: "Tạo evidence mới", reason: "Có AC cũ nhưng thiếu snapshot để verify code hiện tại." };
  }
  if (derivedStatus === "needs-work") {
    return { id: "return-to-work", state: "work", label: "Tiếp tục sửa code", reason: "Full Judge gần nhất chưa AC.", evidence: evidenceRef };
  }
  return { id: "open-work", state: "work", label: "Mở Work", reason: "Artifact chưa có full Judge AC cho code hiện tại." };
}

function buildContract({ meta = {}, history, detailedHistory, currentCode, evidence = null, intent = "competitive" } = {}) {
  const effectiveHistory = Array.isArray(history) ? history : Array.isArray(meta.history) ? meta.history : [];
  const derivedStatus = deriveStatus({ history: effectiveHistory, detailedHistory, currentCode });
  const latestJudge = judgeHistory(effectiveHistory)[0] || null;
  const normalized = normalizeMetadata(meta);

  return {
    version: 1,
    id: meta.id || "",
    title: meta.title || meta.id || "",
    ...normalized,
    concept: clean(meta.concept) || clean(meta.topic) || (Array.isArray(meta.tags) ? clean(meta.tags[0]) : ""),
    difficulty: meta.difficulty || "unrated",
    derivedStatus,
    evidence,
    derivedFrom: meta.derivedFrom && typeof meta.derivedFrom === "object" ? meta.derivedFrom : null,
    nextAction: nextAction({
      operation: latestJudge ? "judge" : "summary",
      verdict: latestJudge && latestJudge.verdict,
      derivedStatus,
      intent,
      evidence,
    }),
    freshness: {
      freshWin: false,
      ratedProgress: false,
      reason: "Historical/read-model responses never manufacture a fresh attempt.",
    },
    compatibility: {
      legacySource: clean(meta.source),
      legacyStatus: clean(meta.status),
    },
  };
}

module.exports = {
  ACTIVITY_KINDS,
  ORIGINS,
  FAILURE_VERDICTS,
  sha256,
  normalizeMetadata,
  isJudgeEntry,
  judgeHistory,
  hasJudgeAcceptance,
  hasHistoricalAcceptance,
  deriveStatus,
  nextAction,
  buildContract,
};
