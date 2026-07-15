// trace-model.js — pure view-model builders for the deterministic analysis
// traces (B3: Dijkstra + Prefix Sum). No DOM, no fetch — unit-tested against
// contract fixtures so a partial/malformed payload can never crash the modal.
//
// Real contract (backend/src/dijkstraTrace.js + prefixSumTrace.js, bound to
// evidence by routes/verified-artifacts.js):
//   POST /api/problems/:id/analysis/dijkstra-trace   body { evidenceId }
//   POST /api/problems/:id/analysis/prefix-sum-trace body { evidenceId }
// The server always re-runs from the evidence's own code+input; when
// `supported` is false there are NO steps and the client renders the honest
// fallback (never a simulated stand-in).

function num(v) {
  if (v == null || v === "") return null; // Number(null) is 0 — never coerce absence into a value
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return typeof v === "string" ? v : "";
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function unsupported(analysis) {
  const fb = (analysis && analysis.fallback) || {};
  return {
    supported: false,
    reason: str(analysis && analysis.reason) || str(fb.reason),
    details: arr(analysis && analysis.details),
    fallback: { input: typeof fb.input === "string" ? fb.input : null, visualizer: fb.visualizer || null },
    nextAction: (analysis && analysis.nextAction) || null,
  };
}

// ---------------------------------------------------------------------------
// Dijkstra — analysis shape:
//   graph { nodeCount, edgeCount, directed, indexBase, source, target }
//   sourceLines { heapDeclaration, minHeap, loop, pop, relaxation, heapPush }
//   steps [{ index, heapBefore: [{node,distance}], popped {node,distance},
//            stale, visited [nodes], relaxations [{from,to,weight,
//            previousDistance, candidateDistance, accepted, reason}],
//            heapAfter, dist [{node,distance|null}] }]
//   result { reachable, distance, path [nodes], distances, visited [nodes] }
// ---------------------------------------------------------------------------

// Heap snapshot → compact display string: [{node,distance},…] → "3(d=2) 5(d=4)".
export function heapStr(entries) {
  return arr(entries)
    .map((e) => (e && e.node != null ? `${e.node}(d=${e.distance})` : ""))
    .filter(Boolean)
    .join(" ");
}

export function pathStr(path) {
  return arr(path).map(String).join(" → ");
}

export function distancesStr(entries) {
  return arr(entries)
    .map((e) => {
      if (!e || e.node == null) return "";
      return `${e.node}:${e.distance == null ? "∞" : e.distance}`;
    })
    .filter(Boolean)
    .join(" ");
}

const RELAX_REASONS = {
  "shorter-distance": "nhận — ngắn hơn",
  "already-visited": "bỏ — đỉnh đã chốt",
  "not-shorter": "bỏ — không ngắn hơn",
};

export function normalizeDijkstraAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || analysis.supported !== true) return unsupported(analysis);

  const lines = analysis.sourceLines && typeof analysis.sourceLines === "object" ? analysis.sourceLines : {};
  const steps = arr(analysis.steps).map((s, i) => {
    const popped = s && s.popped && typeof s.popped === "object" ? s.popped : {};
    return {
      index: num(s && s.index) != null ? num(s.index) : i,
      node: popped.node != null ? String(popped.node) : "",
      dist: num(popped.distance),
      stale: (s && s.stale) === true,
      kindLabel: (s && s.stale) === true ? "bỏ qua (entry cũ / đã chốt)" : "chốt đỉnh",
      heapBefore: heapStr(s && s.heapBefore),
      heapAfter: heapStr(s && s.heapAfter),
      distances: distancesStr(s && s.dist),
      visited: arr(s && s.visited).map(String),
      relaxations: arr(s && s.relaxations).map((r) => ({
        from: r && r.from != null ? String(r.from) : "",
        to: r && r.to != null ? String(r.to) : "",
        weight: num(r && r.weight),
        previous: r && r.previousDistance == null ? "∞" : String(r.previousDistance),
        candidate: r && r.candidateDistance != null ? String(r.candidateDistance) : "",
        accepted: (r && r.accepted) === true,
        reasonLabel: RELAX_REASONS[str(r && r.reason)] || str(r && r.reason),
      })),
      // The step's own code anchor: the pop marker line (the relaxation marker
      // is exposed separately via sourceLines chips).
      line: num(lines.pop),
    };
  });

  const r = analysis.result && typeof analysis.result === "object" ? analysis.result : {};
  const g = analysis.graph && typeof analysis.graph === "object" ? analysis.graph : {};
  return {
    supported: true,
    deterministic: analysis.deterministic === true,
    basis: analysis.basis || null,
    invariant: str(analysis.invariant),
    sourceLines: lines,
    graph: {
      nodeCount: num(g.nodeCount), edgeCount: num(g.edgeCount),
      directed: g.directed !== false, indexBase: num(g.indexBase),
      source: g.source != null ? String(g.source) : "", target: g.target != null ? String(g.target) : "",
    },
    steps,
    result: {
      reachable: r.reachable === true,
      distance: num(r.distance),
      path: arr(r.path).map(String),
      visitedCount: arr(r.visited).length,
    },
    nextAction: analysis.nextAction || null,
    truncated: analysis.truncated === true,
  };
}

// ---------------------------------------------------------------------------
// Prefix Sum — analysis shape:
//   sourceLines { construction, query }
//   array [n values], prefix [n+1 values]
//   construction [{ step, inputIndex, prefixIndex, previousPrefix, value, prefixValue }]
//   queries [{ index, left, right, mapping, formula, terms {rightPrefix,
//              leftPrefix}, result, directSum }]
//   indexMapping { inputBase, prefixBase, rule }
//   offByOneCounterexample { available, range, correctFormula,
//              commonWrongFormula, correctResult, wrongResult, evidence }
// ---------------------------------------------------------------------------

export function normalizePrefixSumAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || analysis.supported !== true) return unsupported(analysis);

  const lines = analysis.sourceLines && typeof analysis.sourceLines === "object" ? analysis.sourceLines : {};
  const mapping = analysis.indexMapping && typeof analysis.indexMapping === "object" ? analysis.indexMapping : {};

  const buildSteps = arr(analysis.construction).map((s, i) => ({
    index: num(s && s.step) != null ? num(s.step) : i,
    inputIndex: num(s && s.inputIndex),
    prefixIndex: num(s && s.prefixIndex),
    previousPrefix: num(s && s.previousPrefix),
    value: num(s && s.value),
    prefixValue: num(s && s.prefixValue),
    line: num(lines.construction),
  }));

  const queries = arr(analysis.queries).map((q, i) => {
    const terms = q && q.terms && typeof q.terms === "object" ? q.terms : {};
    const result = num(q && q.result);
    const directSum = num(q && q.directSum);
    return {
      index: num(q && q.index) != null ? num(q.index) : i,
      left: num(q && q.left),
      right: num(q && q.right),
      formula: str(q && q.formula),
      rightPrefix: num(terms.rightPrefix),
      leftPrefix: num(terms.leftPrefix),
      result,
      directSum,
      // both sides come from the server's own computation over the evidence
      mismatch: result != null && directSum != null && result !== directSum,
      line: num(lines.query),
    };
  });

  const ce = analysis.offByOneCounterexample && typeof analysis.offByOneCounterexample === "object"
    ? analysis.offByOneCounterexample : null;
  return {
    supported: true,
    deterministic: analysis.deterministic === true,
    basis: analysis.basis || null,
    sourceLines: lines,
    indexBase: num(mapping.inputBase) === 0 ? 0 : 1,
    rule: str(mapping.rule),
    a: arr(analysis.array).map((x) => num(x)),
    prefix: arr(analysis.prefix).map((x) => num(x)),
    buildSteps,
    queries,
    mismatchCount: queries.filter((q) => q.mismatch).length,
    offByOne: ce && ce.available === true
      ? {
          available: true,
          left: ce.range && num(ce.range.left),
          right: ce.range && num(ce.range.right),
          correctFormula: str(ce.correctFormula),
          wrongFormula: str(ce.commonWrongFormula),
          correctResult: num(ce.correctResult),
          wrongResult: num(ce.wrongResult),
          evidence: str(ce.evidence),
        }
      : { available: false, reason: str(ce && ce.reason) },
    nextAction: analysis.nextAction || null,
    truncated: analysis.truncated === true,
  };
}
