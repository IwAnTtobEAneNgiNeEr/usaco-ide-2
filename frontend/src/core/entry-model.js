// entry-model.js — pure policy for the Home entry surface (B2).
//
// Real contract (backend/src/routes/recommendations.js + smartContent.js):
//   GET /api/recommendations/entry?track=competitive|algorithm-engineering
//   → { items: [ { id, title, track, concept, provider, collection, status,
//        derivedStatus, rating, ratingEvidence, reason: [string], score,
//        scoreBreakdown, action: { type, autoOpen, href } } ],
//       count, maxItems: 3, autoOpen: false, difficultyContext, policy }
//
// Home keeps one continue CTA and at most three reasoned suggestions. Feedback
// writes to PUT /api/recommendations/feedback/:itemId; it never writes mastery.

export const FEEDBACK_STORE_KEY = "usaco2.entryFeedback.v1";

// Each kind states its real effect on future suggestions — the dismissal list
// rides to the server as `dismissed=` and the kind is recorded via the
// per-problem event route. No mastery/rating is ever written from here.
export const FEEDBACK_KINDS = [
  { id: "too_easy", label: "Quá dễ", effect: "gợi ý sau ưu tiên mức phù hợp hơn; không ghi mastery" },
  { id: "too_hard", label: "Quá khó", effect: "gợi ý sau giảm độ khó tương đối; không ghi mastery" },
  { id: "not_relevant", label: "Không đúng mục tiêu", effect: "giảm ưu tiên riêng mục này; không ảnh hưởng track khác" },
  { id: "already_know", label: "Đã biết", effect: "giảm ưu tiên; KHÔNG tính là đã giải" },
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
    track: typeof raw.track === "string" ? raw.track : null,
    open: raw.action && raw.action.open ? raw.action.open : (raw.open && typeof raw.open === "object" ? raw.open : null),
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

// Hidden ids are used only while the feedback API is unavailable. On a normal
// request the backend local-first feedback store is the sole source of truth.
export function visibleSuggestions(suggestions, hidden) {
  const hide = hidden instanceof Set ? hidden : new Set(Array.isArray(hidden) ? hidden : []);
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter((s) => s && s.id && !hide.has(s.id))
    .slice(0, MAX_SUGGESTIONS);
}

// Query string for the entry endpoint. New requests write canonical tracks.
export function entryQueryString(track) {
  const usp = new URLSearchParams();
  if (track) usp.set("track", track);
  return usp.toString();
}

// The payload recorded via the existing per-problem event route.

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
