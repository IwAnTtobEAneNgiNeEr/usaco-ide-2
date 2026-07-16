// entry-model.js — pure policy for the Home entry surface (B2).
//
// Real contract (backend/src/routes/recommendations.js + smartContent.js):
//   GET /api/recommendations/entry?dismissed=a,b&liked=c
//   → { items: [ { id, title, track, concept, provider, collection, status,
//        derivedStatus, rating, ratingEvidence, reason: [string], score,
//        scoreBreakdown, action: { type, autoOpen, href } } ],
//       count, maxItems: 3, autoOpen: false, difficultyContext, policy }
//
// Home policy (locked): ONE continue CTA, a search affordance, and AT MOST
// three suggestions — each carrying its real server `reason`. The server ranks
// unfinished work (WA/RE evidence, open derived Work loops) highest via
// scoreBreakdown.workInProgress — that item IS the "Tiếp tục" CTA; the rest
// render as quiet suggestions. Dismissals (quá dễ / quá khó / không phù hợp)
// go back as the `dismissed` query param the endpoint already accepts, plus a
// note through the EXISTING per-problem event route — no invented endpoints.

export const FEEDBACK_STORE_KEY = "usaco2.entryFeedback.v1";

// Each kind states its real effect on future suggestions — the dismissal list
// rides to the server as `dismissed=` and the kind is recorded via the
// per-problem event route. No mastery/rating is ever written from here.
export const FEEDBACK_KINDS = [
  { id: "too-easy", label: "Quá dễ", effect: "bài này bị ẩn; gợi ý sau ưu tiên mức khó hơn từ dữ liệu chấm" },
  { id: "too-hard", label: "Quá khó", effect: "bài này bị ẩn; gợi ý sau lùi về mức đang vững" },
  { id: "not-relevant", label: "Không đúng mục tiêu", effect: "bài này bị ẩn khỏi gợi ý; không ảnh hưởng độ khó" },
  { id: "already-known", label: "Đã biết", effect: "bài này bị ẩn; KHÔNG tính là đã giải — chỉ Judge AC mới tạo mastery" },
];

const MAX_SUGGESTIONS = 3;

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null;
  if (!id || !title) return null;
  const reasons = (Array.isArray(raw.reason) ? raw.reason : typeof raw.reason === "string" ? [raw.reason] : [])
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => r.trim());
  const breakdown = raw.scoreBreakdown && typeof raw.scoreBreakdown === "object" ? raw.scoreBreakdown : {};
  return {
    id,
    title,
    reasons,
    // the first reason is the server's strongest signal — that's the one shown
    reason: reasons[0] || "",
    workInProgress: Number(breakdown.workInProgress) > 0,
    rating: Number.isFinite(Number(raw.rating)) && Number(raw.rating) > 0 ? Number(raw.rating) : null,
    concept: typeof raw.concept === "string" ? raw.concept : null,
    derivedStatus: typeof raw.derivedStatus === "string" ? raw.derivedStatus : null,
  };
}

// null → treat as "entry API absent/malformed" (caller falls back to the old
// local ladder). The top work-in-progress item becomes the continue CTA.
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
  const items = raw.items.map(cleanItem).filter((x) => x && x.reason);
  const continueItem = items.find((x) => x.workInProgress) || null;
  const suggestions = items.filter((x) => x !== continueItem);
  return { continueItem, suggestions };
}

// hidden: array/Set of problem ids the user dismissed. The server already got
// them via `dismissed=`, but a stale cache/refresh must not resurface one.
export function visibleSuggestions(suggestions, hidden) {
  const hide = hidden instanceof Set ? hidden : new Set(Array.isArray(hidden) ? hidden : []);
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter((s) => s && s.id && !hide.has(s.id))
    .slice(0, MAX_SUGGESTIONS);
}

// Query string for the entry endpoint — the dismissal list rides along so the
// server-side ranking respects it.
export function entryQueryString(hiddenSet) {
  const ids = [...(hiddenSet instanceof Set ? hiddenSet : new Set())].filter(Boolean);
  if (!ids.length) return "";
  const usp = new URLSearchParams();
  usp.set("dismissed", ids.join(","));
  return usp.toString();
}

// The payload recorded via the existing per-problem event route.
export function feedbackEvent(suggestionId, kindId) {
  const kind = FEEDBACK_KINDS.find((k) => k.id === kindId);
  if (!suggestionId || !kind) return null;
  return { type: "recommendation-feedback", data: { suggestionId, feedback: kind.id } };
}

// (De)serialize the local dismissal list — bounded so localStorage never grows
// without limit.
export function parseHidden(json) {
  try {
    const arr = JSON.parse(json || "[]");
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(-200) : []);
  } catch {
    return new Set();
  }
}

export function serializeHidden(hiddenSet) {
  return JSON.stringify([...hiddenSet].slice(-200));
}
