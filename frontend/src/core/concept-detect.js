// concept-detect.js — map a problem's REAL metadata to a supported analysis
// concept. Pure core (node:test), no DOM/no fetch.
//
// The Verified Artifact contract supports exactly three concepts. Detection
// only reads explicit signals the student/AI already wrote into meta
// (concept > topic > tags > title, first hit wins) — it never guesses from
// code content, and unknown stays null so callers fall back honestly.

export const CONCEPTS = {
  bfs: {
    id: "bfs",
    label: "BFS lưới",
    trace: "bfs-trace",
    module: { id: "grid-pathfinder", label: "GridPathfinder" },
  },
  dijkstra: {
    id: "dijkstra",
    label: "Dijkstra",
    trace: "dijkstra-trace",
    module: { id: "weighted-graph-router", label: "WeightedGraphRouter" },
  },
  "prefix-sum": {
    id: "prefix-sum",
    label: "Prefix Sum",
    trace: "prefix-sum-trace",
    module: { id: "range-sum-module", label: "RangeSum" },
  },
};

// Normalize for tolerant matching: "Prefix Sum" / "prefix_sum" / "tổng tiền tố"
// all reduce to comparable ascii tokens.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// One token table per concept. A signal must be a whole-word hit inside the
// normalized text — "dbfs" or "prefixed" never match.
const SIGNALS = [
  { id: "dijkstra", words: ["dijkstra"] },
  { id: "prefix-sum", words: ["prefixsum", "prefix sum", "tong tien to", "tien to"] },
  { id: "bfs", words: ["bfs", "breadth first"] },
];

function hit(text) {
  const t = norm(text);
  if (!t) return null;
  const padded = ` ${t} `;
  const compact = t.replace(/ /g, "");
  for (const sig of SIGNALS) {
    for (const w of sig.words) {
      if (w.includes(" ") ? padded.includes(` ${w} `) : (padded.includes(` ${w} `) || compact === w)) {
        return sig.id;
      }
    }
  }
  return null;
}

// meta: { concept?, topic?, tags?, title? } — the problem's own metadata (or a
// search/list summary row; same fields).
export function detectConcept(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.concept === "string" && CONCEPTS[meta.concept]) return meta.concept;
  const candidates = [meta.concept, meta.topic, ...(Array.isArray(meta.tags) ? meta.tags : []), meta.title];
  for (const c of candidates) {
    const found = hit(c);
    if (found) return found;
  }
  return null;
}

export function conceptInfo(conceptId) {
  return CONCEPTS[conceptId] || null;
}

// Which derived module a fresh AC on this problem can grow into. Null when the
// concept is unknown/unsupported — the caller must NOT offer a module then.
export function moduleForConcept(conceptId) {
  const c = CONCEPTS[conceptId];
  return c ? c.module : null;
}

// The analysis endpoint suffix for this concept ("bfs-trace" | "dijkstra-trace"
// | "prefix-sum-trace"). Unknown concept → default to bfs-trace: it is the one
// trace that predates concept detection, and its own server-side "supported"
// check already produces the honest fallback for non-BFS code.
export function traceKindForConcept(conceptId) {
  const c = CONCEPTS[conceptId];
  return c ? c.trace : "bfs-trace";
}
