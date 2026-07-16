"use strict";

const MODULE_METADATA = Object.freeze({
  "grid-pathfinder": {
    brief: "Build a reusable rectangular-grid shortest-path module with explicit invalid and unreachable behavior.",
    interface: { language: "cpp", summary: "Unweighted shortest path on a rectangular obstacle grid.", entrypoints: ["GridPathfinder::shortestPath(grid, start, target)"] },
    difficulty: 1,
    tests: {
      public: [{ id: "grid-baseline-public", intent: "Adjacent, same-cell, unreachable, rectangular, blocked and invalid grids." }],
      hidden: [{ id: "grid-baseline-hidden", intent: "Repeated calls and additional boundary layouts." }],
    },
  },
  "weighted-graph-router": {
    brief: "Implement deterministic shortest-distance and path reconstruction for a directed non-negative weighted graph.",
    interface: { language: "cpp", summary: "Reusable directed weighted route planner.", entrypoints: ["WeightedGraphRouter(nodeCount)", "addDirectedEdge(from, to, weight)", "shortestPath(start, target)", "updateDirectedEdge(from, to, weight)"] },
    difficulty: 2,
    tests: {
      public: [{ id: "router-baseline-public", intent: "Shortest path, same node, unreachable and invalid inputs." }],
      hidden: [{ id: "router-baseline-hidden", intent: "Repeated calls, alternate weights and route reconstruction." }],
    },
  },
  "range-sum-module": {
    brief: "Package prefix sums behind explicit zero-based and one-based inclusive range-query interfaces.",
    interface: { language: "cpp", summary: "Immutable range sums with an evolvable point-update requirement.", entrypoints: ["RangeSum(values)", "queryZeroBased(left, right)", "queryOneBased(left, right)", "updateZeroBased(index, value)"] },
    difficulty: 1,
    tests: {
      public: [{ id: "range-sum-baseline-public", intent: "Zero/one-based ranges, negatives, empty data and invalid bounds." }],
      hidden: [{ id: "range-sum-baseline-hidden", intent: "Repeated queries and boundary totals." }],
    },
  },
});

function decorateWorkspace(artifact, extra = {}) {
  const metadata = MODULE_METADATA[artifact.id];
  return {
    ...artifact,
    brief: metadata.brief,
    interface: metadata.interface,
    tests: metadata.tests,
    evidence: artifact.derivedFrom || null,
    ...extra,
  };
}

module.exports = { MODULE_METADATA, decorateWorkspace };
