"use strict";

const { sha256 } = require("./verifiedArtifact");

const ARTIFACT_ID = "weighted-graph-router";
const SOURCE_FILE = "WeightedGraphRouter.cpp";
const BASELINE_REQUIREMENT = "directed-shortest-path-v1";
const CHANGE_REQUIREMENT = "update-edge-weight-v2";
const FILE_NAMES = ["WeightedGraphRouter.hpp", SOURCE_FILE, "WeightedGraphRouter.test.cpp", "WeightedGraphRouter.requirement-change.test.cpp"];

const HEADER = `#pragma once
#include <utility>
#include <vector>
struct WeightedRoute { bool reachable; long long distance; std::vector<int> path; };
class WeightedGraphRouter {
 public:
  explicit WeightedGraphRouter(int nodeCount);
  void addDirectedEdge(int from, int to, long long weight);
  WeightedRoute shortestPath(int source, int target) const;
  bool updateDirectedEdge(int from, int to, long long newWeight);
 private:
  int nodeCount_;
  std::vector<std::vector<std::pair<int, long long>>> graph_;
  void requireVertex(int vertex) const;
};
`;

const SOURCE = `#include "WeightedGraphRouter.hpp"
#include <algorithm>
#include <functional>
#include <limits>
#include <queue>
#include <stdexcept>
WeightedGraphRouter::WeightedGraphRouter(int n) : nodeCount_(n), graph_(n < 0 ? 0 : static_cast<std::size_t>(n)) { if (n < 0) throw std::invalid_argument("negative node count"); }
void WeightedGraphRouter::requireVertex(int v) const { if (v < 0 || v >= nodeCount_) throw std::out_of_range("vertex out of range"); }
void WeightedGraphRouter::addDirectedEdge(int u, int v, long long w) { requireVertex(u); requireVertex(v); if (w < 0) throw std::invalid_argument("negative weight"); graph_[u].push_back({v, w}); }
WeightedRoute WeightedGraphRouter::shortestPath(int source, int target) const {
  requireVertex(source); requireVertex(target);
  const long long inf = std::numeric_limits<long long>::max();
  std::vector<long long> dist(nodeCount_, inf); std::vector<int> parent(nodeCount_, -1);
  using Entry = std::pair<long long, int>; std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> heap;
  dist[source] = 0; heap.push({0, source});
  while (!heap.empty()) {
    auto [du, u] = heap.top(); heap.pop(); if (du != dist[u]) continue;
    for (auto [v, w] : graph_[u]) if (du <= inf - w && du + w < dist[v]) { dist[v] = du + w; parent[v] = u; heap.push({dist[v], v}); }
  }
  if (dist[target] == inf) return {false, 0, {}};
  std::vector<int> path; for (int v = target; v != -1; v = parent[v]) path.push_back(v); std::reverse(path.begin(), path.end());
  return {true, dist[target], path};
}
bool WeightedGraphRouter::updateDirectedEdge(int, int, long long) { return false; /* TODO v2 */ }
`;

const BASELINE_TEST = `#include "WeightedGraphRouter.hpp"
#include <iostream>
#include <stdexcept>
#include <vector>
int main() {
  WeightedGraphRouter r(6); r.addDirectedEdge(0,1,4); r.addDirectedEdge(0,2,1); r.addDirectedEdge(2,1,2); r.addDirectedEdge(1,3,1); r.addDirectedEdge(2,3,5); r.addDirectedEdge(3,4,3);
  auto a=r.shortestPath(0,4); if(!a.reachable||a.distance!=7||a.path!=std::vector<int>({0,2,1,3,4})) return 1;
  auto same=r.shortestPath(2,2); if(!same.reachable||same.distance!=0||same.path!=std::vector<int>({2})) return 2;
  if(r.shortestPath(0,5).reachable) return 3;
  try { r.addDirectedEdge(0,1,-1); return 4; } catch(const std::invalid_argument&) {}
  try { r.shortestPath(-1,0); return 5; } catch(const std::out_of_range&) {}
  std::cout<<"OK\\n";
}
`;

const CHANGE_TEST = `#include "WeightedGraphRouter.hpp"
#include <iostream>
int main() {
  WeightedGraphRouter r(3); r.addDirectedEdge(0,1,5); r.addDirectedEdge(1,2,2); r.addDirectedEdge(0,2,20);
  bool ok=true; if(!r.updateDirectedEdge(0,2,1)) ok=false; if(r.updateDirectedEdge(2,0,1)) ok=false;
  auto a=r.shortestPath(0,2); if(!a.reachable||a.distance!=1) ok=false; std::cout<<(ok?"OK\\n":"FAIL\\n");
}
`;

const HIDDEN_BASELINE_TEST = `#include "WeightedGraphRouter.hpp"
#include <iostream>
#include <stdexcept>
#include <vector>
int main(){
  WeightedGraphRouter r(4); r.addDirectedEdge(0,1,8); r.addDirectedEdge(0,2,2); r.addDirectedEdge(2,1,1); r.addDirectedEdge(1,3,3);
  auto first=r.shortestPath(0,3); auto repeated=r.shortestPath(0,3);
  if(!first.reachable||first.distance!=6||first.path!=std::vector<int>({0,2,1,3})||repeated.path!=first.path) return 1;
  r.addDirectedEdge(0,3,4); auto changed=r.shortestPath(0,3); if(changed.distance!=4||changed.path!=std::vector<int>({0,3})) return 2;
  try{r.shortestPath(0,4);return 3;}catch(const std::out_of_range&){}
  std::cout<<"OK\\n";
}
`;

const HIDDEN_CHANGE_TEST = `#include "WeightedGraphRouter.hpp"
#include <iostream>
int main(){
  WeightedGraphRouter r(3); r.addDirectedEdge(0,1,9); r.addDirectedEdge(1,2,1); r.addDirectedEdge(0,2,20);
  if(!r.updateDirectedEdge(0,1,2)||r.shortestPath(0,2).distance!=3) return 1;
  if(!r.updateDirectedEdge(0,1,12)||r.shortestPath(0,2).distance!=13) return 2;
  if(r.updateDirectedEdge(2,1,7)) return 3;
  std::cout<<"OK\\n";
}
`;

function buildScaffold({ problemId, sourceTitle, evidence, createdAt }) {
  return { manifest: {
    version: 1, id: ARTIFACT_ID, title: "WeightedGraphRouter", provider: "local", collection: "verified-artifact-modules", origin: "derived", activityKind: "algorithm-module", track: "algorithm-engineering", concept: "dijkstra",
    derivedFrom: { problemId, sourceTitle, evidenceId: evidence.id, runId: evidence.runId, codeHash: evidence.codeHash, inputHash: evidence.inputHash }, createdAt, updatedAt: createdAt,
    currentRequirementId: BASELINE_REQUIREMENT,
    requirements: [
      { id: BASELINE_REQUIREMENT, status: "active", summary: "Directed non-negative shortest distance and reconstructed path." },
      { id: CHANGE_REQUIREMENT, status: "proposed", summary: "Update one existing directed edge weight." },
    ],
    checks: { baseline: { requirementId: BASELINE_REQUIREMENT, testFile: "WeightedGraphRouter.test.cpp" }, "requirement-change": { requirementId: CHANGE_REQUIREMENT, testFile: "WeightedGraphRouter.requirement-change.test.cpp" } },
  }, files: { "WeightedGraphRouter.hpp": HEADER, [SOURCE_FILE]: SOURCE, "WeightedGraphRouter.test.cpp": BASELINE_TEST, "WeightedGraphRouter.requirement-change.test.cpp": CHANGE_TEST } };
}

function composeTranslationUnit(files, suite) {
  const testFile = suite === "requirement-change" ? "WeightedGraphRouter.requirement-change.test.cpp" : "WeightedGraphRouter.test.cpp";
  const strip = (text) => String(text || "").replace(/^#include\s+"WeightedGraphRouter\.hpp"\s*$/gm, "");
  return [files["WeightedGraphRouter.hpp"], strip(files[SOURCE_FILE]), strip(files[testFile])].join("\n");
}
function composeHiddenTranslationUnit(files, suite) {
  const strip = (text) => String(text || "").replace(/^#include\s+"WeightedGraphRouter\.hpp"\s*$/gm, "");
  const test = suite === "requirement-change" ? HIDDEN_CHANGE_TEST : HIDDEN_BASELINE_TEST;
  return [files["WeightedGraphRouter.hpp"], strip(files[SOURCE_FILE]), strip(test)].join("\n");
}
function latest(runs, suite) { return (runs || []).filter((r) => r && r.suite === suite).slice().sort((a,b) => Date.parse(b.at)-Date.parse(a.at))[0] || null; }
function deriveStatus(manifest, runs, files) { const suite=manifest.currentRequirementId===CHANGE_REQUIREMENT?"requirement-change":"baseline"; const run=latest(runs,suite); if(!run)return suite==="baseline"?"unverified":"needs-work"; if(run.verdict!=="AC")return "needs-work"; if(files&&run.codeHash!==sourceHash(files,suite))return "needs-work"; return "verified"; }
function nextAction(manifest, runs, files) { const status=deriveStatus(manifest,runs,files); if(manifest.currentRequirementId===CHANGE_REQUIREMENT) return status==="verified"?{id:"continue-from-derived",state:"evolve",label:"Continue from WeightedGraphRouter",reason:"Edge update passes."}:{id:"open-derived-work",state:"work",label:"Implement edge update",reason:"Activated change does not pass yet."}; return status==="verified"?{id:"activate-requirement-change",state:"evolve",label:"Open edge-update requirement",reason:"Baseline passes."}:{id:"verify-derived-baseline",state:"verify",label:"Run module tests",reason:"Baseline needs verification."}; }
function sourceHash(files, suite) { return sha256(`${composeTranslationUnit(files, suite)}\n${composeHiddenTranslationUnit(files, suite)}`); }

module.exports = { ARTIFACT_ID, SOURCE_FILE, FILE_NAMES, BASELINE_REQUIREMENT, CHANGE_REQUIREMENT, buildScaffold, composeTranslationUnit, composeHiddenTranslationUnit, deriveStatus, nextAction, sourceHash };
