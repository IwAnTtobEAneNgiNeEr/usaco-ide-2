// search-model.js — pure logic for the Smart Library search/filter (B1).
//
// Real contract (backend/src/routes/catalog.js + smartContent.searchProblems):
//   GET /api/catalog/search?q=…&track=…&status=…&concept=…&provider=…&collection=…
//   → { results: [ { …problem summary, track, concept, rating,
//        whyMatched: [string], matchScore } ], filters }
//
// `whyMatched` is the server's own "Vì sao khớp". Track is canonical across
// Search, Library, Home, recommendations and feedback.

// Normalize a topic/tag for tolerant matching: "Binary Search" /
// "binary_search" → "binarysearch". (Moved from problems.js; re-exported there.)
export function normTopic(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function trackOf(p) {
  return p && p.activityKind === "algorithm-module" ? "algorithm-engineering" : "competitive";
}

export function matchesFilters(p, f) {
  if (f.track && trackOf(p) !== f.track) return false;
  if (f.source && p.source !== f.source) return false;
  if (f.status && p.status !== f.status) return false;
  if (f.difficulty && p.difficulty !== f.difficulty) return false;
  if (f.topics && f.topics.length) {
    const hay = new Set([p.topic, ...(p.tags || [])].filter(Boolean).map(normTopic));
    if (!f.topics.some((t) => hay.has(t))) return false;
  }
  if (f.search) {
    const hay = `${p.title} ${p.topic} ${p.source} ${p.provider || ""} ${p.collection || ""} ${p.concept || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
    if (!hay.includes(f.search.toLowerCase())) return false;
  }
  return true;
}

// Query params for the real search endpoint. The current compact Library UI
// supplies q/status; explicit contract consumers may also supply every
// supported metadata/rating filter.
export function buildSearchParams(filters) {
  const out = {};
  if (filters.search) out.q = filters.search;
  if (filters.status) out.status = filters.status;
  for (const key of ["track", "concept", "provider", "collection", "minRating", "maxRating"]) {
    if (filters[key] !== "" && filters[key] != null) out[key] = filters[key];
  }
  return out;
}

// The Library's remaining local filters, applied OVER server search results
// (the server only handled q/status).
export function applyLocalFilters(items, filters) {
  const residual = { ...filters, search: "", status: "" };
  return (Array.isArray(items) ? items : []).filter((p) => matchesFilters(p, residual));
}

export function searchQueryString(filters) {
  const params = buildSearchParams(filters);
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, v);
  return usp.toString();
}

// null → malformed/absent response (caller falls back to local filtering).
// Items keep every projection field the row renderer reads; `whyMatched` is
// clamped to short strings so a bad payload can't flood the list UI.
export function normalizeSearchResults(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.results)) return null;
  const items = [];
  for (const r of raw.results) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) continue;
    const reasons = (Array.isArray(r.whyMatched) ? r.whyMatched : [])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim().slice(0, 120))
      .slice(0, 3);
    items.push({ ...r, reasons });
  }
  return items;
}

// Display title: prefer the server's cleaned title when the search contract
// provides one; otherwise strip decorative boss glyphs + collapse whitespace.
// This is display-only — the stored title is never rewritten from here.
export function displayTitle(p) {
  const t = String((p && (p.titleClean || p.title)) || "").replace(/\s+/g, " ").trim();
  return t.replace(/^[⚔️🐲\s]+/u, "");
}

// Honest local "Vì sao khớp" for the fallback path: name the actual field the
// query hit. Returns [] when there is no text query (plain filter browsing
// needs no justification).
export function localReasons(p, filters) {
  const q = String(filters.search || "").trim().toLowerCase();
  if (!q) return [];
  const reasons = [];
  const has = (v) => typeof v === "string" && v.toLowerCase().includes(q);
  if (has(p.title)) reasons.push(`tên chứa “${q}”`);
  if (has(p.topic)) reasons.push(`chủ đề: ${p.topic}`);
  if (has(p.concept)) reasons.push(`concept: ${p.concept}`);
  const tag = (p.tags || []).find((t) => has(t));
  if (tag) reasons.push(`tag: ${tag}`);
  // Provider/collection are catalog internals; never repeat them in learner UI.
  if (has(p.source)) reasons.push(`nguồn: ${p.source}`);
  return reasons.slice(0, 2);
}
