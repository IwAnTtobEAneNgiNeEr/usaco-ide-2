"use strict";

// Deterministic semantic trace for a deliberately narrow Dijkstra slice.
// It recognizes a min-heap + relaxation C++ shape, then simulates the exact
// graph stored in run evidence. It is not an arbitrary C++ execution tracer.

const { sha256 } = require("./verifiedArtifact");

const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_TRACE_STEPS = 512;

function fallback(input, reason) {
  return { kind: "input-visualizer", reason, input: typeof input === "string" ? input : "", visualizer: { kind: "weighted-edge-list" } };
}

function unsupported(input, reason, details = []) {
  const evidenceFallback = fallback(input, reason);
  return {
    supported: false,
    reason,
    details,
    fallback: evidenceFallback,
    nextAction: { id: "open-visualizer", state: "work", label: "Open weighted graph input", reason },
  };
}

function parseGraphInput(input) {
  const raw = typeof input === "string" ? input : "";
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return { ok: false, result: unsupported(raw, "input-format: expected n m, m weighted edges, then source target") };
  const values = tokens.map(Number);
  if (values.some((value) => !Number.isSafeInteger(value))) return { ok: false, result: unsupported(raw, "input-non-integer: Dijkstra slice accepts safe integers only") };
  const [n, m] = values;
  if (n <= 0 || m < 0) return { ok: false, result: unsupported(raw, "input-header: n must be positive and m non-negative") };
  if (n > MAX_NODES || m > MAX_EDGES) return { ok: false, result: unsupported(raw, `input-too-large: limit ${MAX_NODES} nodes and ${MAX_EDGES} edges`) };
  if (values.length !== 2 + 3 * m + 2) return { ok: false, result: unsupported(raw, "input-shape: token count does not match m edges plus source target") };

  const edges = [];
  for (let i = 0; i < m; i += 1) {
    const [u, v, weight] = values.slice(2 + i * 3, 5 + i * 3);
    if (weight < 0) return { ok: false, result: unsupported(raw, "negative-weight: Dijkstra trace requires non-negative weights", [{ edge: i, u, v, weight }]) };
    if (weight > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, n))) return { ok: false, result: unsupported(raw, "distance-overflow-risk: path sums would not be exact JavaScript integers", [{ edge: i, u, v, weight }]) };
    edges.push({ index: i, u, v, weight });
  }
  const source = values[2 + 3 * m];
  const target = values[3 + 3 * m];
  const vertices = edges.flatMap((edge) => [edge.u, edge.v]).concat([source, target]);
  const zeroBased = vertices.every((value) => value >= 0 && value < n);
  const oneBased = vertices.every((value) => value >= 1 && value <= n);
  if (!zeroBased && !oneBased) return { ok: false, result: unsupported(raw, "vertex-range: vertices do not fit either 0-based or 1-based n") };
  const indexBase = zeroBased && vertices.includes(0) ? 0 : 1;
  return { ok: true, raw, n, m, edges, source, target, indexBase };
}

function lineOf(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  return index < 0 ? null : index + 1;
}

function recognizeSource(code) {
  const source = String(code || "");
  const lines = source.split(/\r?\n/);
  const markers = {
    heapDeclaration: lineOf(lines, /priority_queue\s*</),
    minHeap: lineOf(lines, /greater\s*</),
    loop: lineOf(lines, /while\s*\([^\n]*\.empty\s*\(\s*\)/),
    pop: lineOf(lines, /\.pop\s*\(\s*\)/),
    relaxation: lineOf(lines, /dist\s*\[\s*v\s*\]\s*>\s*dist\s*\[\s*u\s*\]\s*\+\s*w/),
    heapPush: lineOf(lines, /\.push\s*\(\s*\{\s*dist\s*\[\s*v\s*\]\s*,\s*v\s*\}/),
  };
  const missing = Object.entries(markers).filter(([, line]) => !line).map(([name]) => name);
  const hasVisited = /visited\s*\[\s*u\s*\]/.test(source);
  const hasStaleGuard = /(?:d|du)\s*!=\s*dist\s*\[\s*u\s*\]/.test(source);
  if (!hasVisited && !hasStaleGuard) missing.push("visited-or-stale-entry guard");
  if (missing.length) return { ok: false, reason: "unsupported-code-shape", details: missing, markers };

  const undirected = /(?:adj|g)\s*\[\s*v\s*\]\s*\.push_back\s*\(\s*\{\s*u\s*,\s*w\s*\}/.test(source);
  return { ok: true, directed: !undirected, markers };
}

function sortedHeap(heap) {
  return heap.slice().sort((a, b) => a.distance - b.distance || a.node - b.node);
}

function distanceSnapshot(dist, indexBase) {
  return dist.map((distance, index) => ({ node: index + indexBase, distance: Number.isFinite(distance) ? distance : null }));
}

function buildPath(parent, sourceIndex, targetIndex, indexBase) {
  const path = [];
  let current = targetIndex;
  while (current != null) {
    path.push(current + indexBase);
    if (current === sourceIndex) return path.reverse();
    current = parent[current];
  }
  return [];
}

function simulate(parsed, recognized) {
  const graph = Array.from({ length: parsed.n }, () => []);
  for (const edge of parsed.edges) {
    const u = edge.u - parsed.indexBase;
    const v = edge.v - parsed.indexBase;
    graph[u].push({ to: v, weight: edge.weight, edgeIndex: edge.index });
    if (!recognized.directed) graph[v].push({ to: u, weight: edge.weight, edgeIndex: edge.index });
  }
  graph.forEach((list) => list.sort((a, b) => a.to - b.to || a.weight - b.weight || a.edgeIndex - b.edgeIndex));

  const sourceIndex = parsed.source - parsed.indexBase;
  const targetIndex = parsed.target - parsed.indexBase;
  const dist = Array(parsed.n).fill(Infinity);
  const parent = Array(parsed.n).fill(null);
  const visited = Array(parsed.n).fill(false);
  const heap = [{ node: sourceIndex, distance: 0 }];
  const steps = [];
  let popCount = 0;
  dist[sourceIndex] = 0;

  while (heap.length) {
    heap.sort((a, b) => a.distance - b.distance || a.node - b.node);
    const heapBefore = sortedHeap(heap).map((item) => ({ node: item.node + parsed.indexBase, distance: item.distance }));
    const current = heap.shift();
    popCount += 1;
    const stale = visited[current.node] || current.distance !== dist[current.node];
    const relaxations = [];
    if (!stale) {
      visited[current.node] = true;
      for (const edge of graph[current.node]) {
        const candidate = current.distance + edge.weight;
        const previous = dist[edge.to];
        const accepted = !visited[edge.to] && candidate < previous;
        if (accepted) {
          dist[edge.to] = candidate;
          parent[edge.to] = current.node;
          heap.push({ node: edge.to, distance: candidate });
        }
        relaxations.push({
          from: current.node + parsed.indexBase,
          to: edge.to + parsed.indexBase,
          weight: edge.weight,
          previousDistance: Number.isFinite(previous) ? previous : null,
          candidateDistance: candidate,
          accepted,
          reason: accepted ? "shorter-distance" : visited[edge.to] ? "already-visited" : "not-shorter",
        });
      }
    }
    if (steps.length < MAX_TRACE_STEPS) {
      steps.push({
        index: popCount - 1,
        heapBefore,
        popped: { node: current.node + parsed.indexBase, distance: current.distance },
        stale,
        visited: visited.map((value, index) => value ? index + parsed.indexBase : null).filter((value) => value != null),
        relaxations,
        heapAfter: sortedHeap(heap).map((item) => ({ node: item.node + parsed.indexBase, distance: item.distance })),
        dist: distanceSnapshot(dist, parsed.indexBase),
      });
    }
  }

  const reachable = Number.isFinite(dist[targetIndex]);
  return {
    steps,
    truncated: popCount > MAX_TRACE_STEPS,
    result: {
      reachable,
      distance: reachable ? dist[targetIndex] : null,
      path: reachable ? buildPath(parent, sourceIndex, targetIndex, parsed.indexBase) : [],
      distances: distanceSnapshot(dist, parsed.indexBase),
      visited: visited.map((value, index) => value ? index + parsed.indexBase : null).filter((value) => value != null),
    },
  };
}

function traceDijkstra({ code, input, verdict } = {}) {
  const parsed = parseGraphInput(input);
  if (!parsed.ok) return parsed.result;
  const recognized = recognizeSource(code);
  if (!recognized.ok) return unsupported(parsed.raw, recognized.reason, recognized.details);
  return {
    supported: true,
    model: "recognized-dijkstra-semantic-v1",
    deterministic: true,
    executionMode: "semantic-model-not-arbitrary-cpp-instrumentation",
    basis: { codeHash: sha256(code), inputHash: sha256(input) },
    graph: { nodeCount: parsed.n, edgeCount: parsed.m, directed: recognized.directed, indexBase: parsed.indexBase, source: parsed.source, target: parsed.target },
    sourceLines: recognized.markers,
    invariant: "The min-heap extracts the smallest tentative distance; only a strictly shorter relaxation changes dist and parent.",
    ...simulate(parsed, recognized),
    fallback: fallback(parsed.raw, "Uses the exact weighted edge-list from stored evidence."),
    nextAction: verdict && verdict !== "AC"
      ? { id: "return-to-work", state: "work", label: "Compare heap and relaxations", reason: `Trace is bound to the stored Judge ${verdict} evidence.` }
      : { id: "verify-edge-case", state: "verify", label: "Verify another weighted case", reason: "The recognized Dijkstra model reproduced this evidence input." },
  };
}

module.exports = { MAX_NODES, MAX_EDGES, MAX_TRACE_STEPS, parseGraphInput, recognizeSource, traceDijkstra };
