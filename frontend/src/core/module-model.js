// module-model.js — pure policy for standalone Applied Algorithms modules (B1/B4/B5).
//
// Real contract (backend/src/routes/modules.js + standaloneModuleStore.js,
// docs/APPLIED-ALGORITHMS-V1-API.md):
//   GET  /api/modules                → { modules: [ moduleSummary ] }
//   GET  /api/modules/:id            → { artifact }  (requirements/checks/files/runs/nextAction)
//   GET  /api/modules/:id/source     → { artifactId, file, source }
//   PUT  /api/modules/:id/source     → { artifact }
//   POST /api/modules/:id/verify     → { check, artifact }   (suite: baseline | requirement-change)
//   POST /api/modules/:id/requirement-changes/:changeId/activate → { artifact }
//   POST /api/modules/weighted-graph-router/simulate  { dataset: "n m\nu v w…\ns t" }
//     → { ok, reachable, distance, path, moduleId, moduleStatus, timeMs }
//
// Everything here is pure (no DOM, no fetch) so it stays unit-testable. The
// Library merges these modules as ROWS in the one list — never a second list —
// and every projection shown comes from the server payload; nothing invented.

// ---- list normalization ------------------------------------------------------

// null → route absent/malformed (Library hides modules silently, no fake rows).
export function normalizeModules(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.modules)) return null;
  const out = [];
  for (const m of raw.modules) {
    if (!m || typeof m !== "object") continue;
    if (typeof m.artifactId !== "string" || !m.artifactId) continue;
    if (typeof m.title !== "string" || !m.title.trim()) continue;
    out.push({
      id: typeof m.id === "string" && m.id ? m.id : `module:${m.artifactId}`,
      artifactId: m.artifactId,
      title: m.title.trim(),
      itemType: "module",
      activityKind: "algorithm-module",
      track: "algorithm-engineering",
      concept: typeof m.concept === "string" ? m.concept : null,
      provider: typeof m.provider === "string" ? m.provider : null,
      collection: typeof m.collection === "string" ? m.collection : null,
      origin: typeof m.origin === "string" ? m.origin : null,
      derivedFrom: m.derivedFrom || null,
      derivedStatus: typeof m.derivedStatus === "string" ? m.derivedStatus : "unverified",
      status: m.status === "verified" ? "verified" : "needs-work",
      requirement: typeof m.requirement === "string" ? m.requirement : "",
      currentRequirementId: typeof m.currentRequirementId === "string" ? m.currentRequirementId : null,
      updatedAt: m.updatedAt || null,
    });
  }
  return out;
}

// ---- row projection (what the Library card must say) --------------------------

export const MODULE_STATUS = {
  verified: { text: "đã verified", cls: "ok" },
  "needs-work": { text: "cần làm", cls: "warn" },
};

// The one continue-CTA per state (B1: "CTA tiếp tục"). Verbs stay concrete.
export function moduleCta(m) {
  if (m.status === "verified") return { label: "Mở module →", intent: "open" };
  return { label: "Làm cho đạt →", intent: "work" };
}

// standalone vs derived provenance line.
export function moduleProvenance(m) {
  if (m.derivedFrom && (m.derivedFrom.problemId || m.derivedFrom.sourceTitle)) {
    return { kind: "derived", text: `Phát triển từ ${m.derivedFrom.sourceTitle || m.derivedFrom.problemId}` };
  }
  return { kind: "standalone", text: "Standalone" };
}

// ---- Library merge (one list, two lenses) -------------------------------------

// Map the Library's problem-status select onto module states honestly:
//   "solved"  → verified (done = the requirement passes)
//   "learning"→ needs-work (open work)
//   "review"  → no modules (spaced review is a problem concept)
function moduleMatchesStatus(m, status) {
  if (!status) return true;
  if (status === "solved") return m.status === "verified";
  if (status === "learning") return m.status !== "verified";
  return false;
}

export function moduleMatchesFilters(m, f) {
  if (f.track && f.track !== "algorithm-engineering") return false;
  if (f.source) return false;             // modules carry no legacy source field
  if (f.difficulty) return false;         // modules are not Elo/difficulty-rated
  if (f.topics && f.topics.length) {
    const hay = String(m.concept || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!f.topics.some((t) => t === hay)) return false;
  }
  if (!moduleMatchesStatus(m, f.status)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${m.title} ${m.concept || ""} ${m.requirement} ${m.collection || ""} module`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Honest local "Vì sao khớp" for module rows (same voice as localReasons).
export function moduleLocalReasons(m, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return [];
  const reasons = [];
  const has = (v) => typeof v === "string" && v.toLowerCase().includes(q);
  if (has(m.title)) reasons.push(`tên chứa “${q}”`);
  if (has(m.concept)) reasons.push(`concept: ${m.concept}`);
  if (has(m.requirement)) reasons.push("requirement nhắc tới từ khóa");
  if ("module".includes(q)) reasons.push("là module thuật toán");
  return reasons.slice(0, 2);
}

// Modules that survive the current filters, ready to pin at the top of the list.
export function visibleModules(modules, filters) {
  return (Array.isArray(modules) ? modules : []).filter((m) => moduleMatchesFilters(m, filters));
}

// ---- artifact-level helpers (module workspace, B3) ----------------------------

// The artifact's FIRST requirement is its baseline; anything else active runs
// as the "requirement-change" suite (mirrors the backend verify mapping).
export function baselineId(artifact) {
  const reqs = (artifact && artifact.requirements) || [];
  return reqs.length ? reqs[0].id : null;
}

export function currentSuite(artifact) {
  const base = baselineId(artifact);
  return artifact && base && artifact.currentRequirementId && artifact.currentRequirementId !== base
    ? "requirement-change" : "baseline";
}

export function pendingChange(artifact) {
  const reqs = (artifact && artifact.requirements) || [];
  return reqs.find((r) => r.id !== artifact.currentRequirementId && r.status !== "retired" && r.id !== baselineId(artifact)) || null;
}

// ---- Route Planner dataset (B4) -----------------------------------------------

// Contract input: { input: { nodeCount, edges:[{from,to,weight}], start, target } }
// (docs/APPLIED-ALGORITHMS-V1-API.md §Route Planner Simulation). Validate the
// SAME limits the server enforces so obvious errors show before a round-trip —
// the server stays the judge.
export function buildRouteDataset({ nodeCount, edges, source, target }) {
  const n = Number(nodeCount);
  if (!Number.isSafeInteger(n) || n < 1 || n > 200) return { error: "Số đỉnh phải là số nguyên 1–200." };
  const list = Array.isArray(edges) ? edges : [];
  if (list.length > 2000) return { error: "Tối đa 2000 cạnh có hướng." };
  const cleanEdges = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i] || {};
    const u = Number(e.from), v = Number(e.to), w = Number(e.weight);
    if (![u, v, w].every(Number.isSafeInteger)) return { error: `Cạnh ${i + 1}: from/to/weight phải là số nguyên.` };
    if (u < 0 || u >= n || v < 0 || v >= n) return { error: `Cạnh ${i + 1}: đỉnh phải trong 0…${n - 1}.` };
    if (w < 0 || w > 1000000000000) return { error: `Cạnh ${i + 1}: trọng số phải ≥ 0 (tối đa 1e12).` };
    cleanEdges.push({ from: u, to: v, weight: w });
  }
  const s = Number(source), t = Number(target);
  if (!Number.isSafeInteger(s) || s < 0 || s >= n) return { error: `Đỉnh xuất phát phải trong 0…${n - 1}.` };
  if (!Number.isSafeInteger(t) || t < 0 || t >= n) return { error: `Đỉnh đích phải trong 0…${n - 1}.` };
  return { input: { nodeCount: n, edges: cleanEdges, start: s, target: t } };
}

// Contract response: { output: { reachable, distance, path }, module, run }.
// null → malformed (UI shows an honest error, never a fake result).
export function normalizeSimulateResult(raw) {
  if (!raw || typeof raw !== "object" || !raw.output || typeof raw.output !== "object") return null;
  const out = raw.output;
  const timeMs = Number(raw.run && raw.run.timeMs) || 0;
  if (out.reachable === false) return { reachable: false, distance: null, path: [], timeMs };
  if (out.reachable !== true) return null;
  const distance = Number(out.distance);
  const path = Array.isArray(out.path) ? out.path.map(Number) : null;
  if (!Number.isSafeInteger(distance) || !path || path.some((x) => !Number.isSafeInteger(x))) return null;
  return { reachable: true, distance, path, timeMs };
}

// ---- entry-reason translation (B2) --------------------------------------------

// The recommendations endpoint speaks English (backend/src/smartContent.js).
// Translate the known sentences pattern-for-pattern; anything unrecognized
// passes through untouched — an honest raw string beats an invented one.
const REASON_PATTERNS = [
  [/^Unfinished work has stored (\w+) evidence\.$/, (m) => `Bài còn dở — đã lưu bằng chứng ${m[1]}.`],
  [/^Derived status is ([\w-]+); a concrete Work loop is open\.$/, (m) => `Module đang ở trạng thái ${m[1]} — vòng Work còn mở.`],
  [/^Selection uses recorded judge\/artifact evidence\.$/, () => "Chọn dựa trên lịch sử chấm thật."],
  [/^Matches requested track ([\w-]+)\.$/, (m) => `Đúng hướng em chọn (${m[1]}).`],
  [/^Matches requested concept ([\w-]+);.*$/, (m) => `Đúng concept em chọn (${m[1]}).`],
  [/^Explicit positive feedback for this entry\.$/, () => "Em từng đánh dấu muốn làm dạng này."],
  [/^Recorded rating (\d+) is compared with target (\d+)\.$/, (m) => `Độ khó ${m[1]} sát mức mục tiêu ${m[2]}.`],
  [/^Content freshness: updated (\d+) day\(s\) ago\.$/, (m) => `Mới cập nhật ${m[1]} ngày trước.`],
  [/^Unsolved catalog entry; no weakness or numeric rating was inferred\.$/, () => "Bài chưa giải — chưa suy ra điểm yếu hay độ khó."],
];

export function translateReason(reason) {
  const s = String(reason || "").trim();
  for (const [re, fn] of REASON_PATTERNS) {
    const m = s.match(re);
    if (m) return fn(m);
  }
  return s;
}
