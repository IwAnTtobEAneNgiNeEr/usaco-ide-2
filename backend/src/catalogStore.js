"use strict";

const problemStore = require("./problemStore");
const derivedStore = require("./derivedArtifactStore");
const standaloneModules = require("./standaloneModuleStore");
const { normalizeCatalogItem, TRACKS, ACTIVITY_KINDS } = require("./trackContract");

function currentRequirement(artifact) {
  return (artifact.requirements || []).find((requirement) => requirement.id === artifact.currentRequirementId) || null;
}

function summaryText(requirement) {
  return requirement && (requirement.brief || requirement.summary || requirement.id) || "";
}

function problemItem(problem) {
  return normalizeCatalogItem({
    ...problem,
    itemType: "problem",
    derivedStatus: null,
    derivedFrom: null,
    requirement: null,
    track: problem.track,
    activityKind: problem.activityKind || ACTIVITY_KINDS.COMPETITIVE_PROBLEM,
    open: { type: "problem", problemId: problem.id },
  });
}

function derivedModuleItem(problem, artifact) {
  const requirement = currentRequirement(artifact);
  return normalizeCatalogItem({
    id: `module:${artifact.id}@${problem.id}`,
    artifactId: artifact.id,
    problemId: problem.id,
    title: artifact.title || artifact.id,
    itemType: "module",
    activityKind: ACTIVITY_KINDS.ALGORITHM_MODULE,
    track: TRACKS.ALGORITHM_ENGINEERING,
    concept: artifact.concept || problem.concept,
    provider: artifact.provider || "local",
    collection: artifact.collection || "verified-artifact-modules",
    origin: artifact.origin || "derived",
    derivedFrom: artifact.derivedFrom,
    derivedStatus: artifact.derivedStatus,
    status: artifact.derivedStatus === "verified" ? "verified" : "needs-work",
    requirement: summaryText(requirement),
    currentRequirementId: artifact.currentRequirementId,
    updatedAt: artifact.updatedAt || artifact.createdAt || problem.updatedAt,
    createdAt: artifact.createdAt || problem.createdAt,
    open: { type: "module", scope: "derived", problemId: problem.id, artifactId: artifact.id },
  });
}

function requirementTasks(modules) {
  return modules.flatMap((module) => {
    const artifactId = module.artifactId;
    const change = artifactId === "grid-pathfinder"
      ? { id: "allow-diagonal-v2", concept: "bfs", title: "GridPathfinder · Diagonal movement", requirement: "Mở rộng shortest path grid để hỗ trợ di chuyển chéo." }
      : artifactId === "weighted-graph-router"
        ? { id: "update-edge-weight-v2", concept: "dijkstra", title: "WeightedGraphRouter · Edge updates", requirement: "Cập nhật trọng số một cạnh có hướng rồi định tuyến lại đúng." }
        : { id: "point-update-v2", concept: "prefix-sum", title: "RangeSum · Point updates", requirement: "Cập nhật một phần tử rồi trả lời range sum chính xác." };
    return [normalizeCatalogItem({
      id: `task:${artifactId}:${change.id}`,
      title: change.title,
      itemType: "module",
      activityKind: ACTIVITY_KINDS.ALGORITHM_MODULE,
      track: TRACKS.ALGORITHM_ENGINEERING,
      concept: change.concept,
      provider: "local",
      collection: "applied-algorithms-v1",
      origin: "catalog",
      derivedStatus: module.derivedStatus,
      status: module.currentRequirementId === change.id && module.derivedStatus === "verified" ? "verified" : "needs-work",
      requirement: change.requirement,
      requirementId: change.id,
      difficulty: Math.min(3, Number(module.difficulty || 1) + 1),
      derivedFrom: null,
      updatedAt: module.updatedAt,
      createdAt: module.createdAt,
      open: { type: "module", scope: "standalone", artifactId, requirementId: change.id },
    })];
  });
}

function simulationTask(module) {
  return normalizeCatalogItem({
    id: "simulation:route-planner",
    title: "Route Planning Simulation",
    itemType: "simulation",
    activityKind: ACTIVITY_KINDS.APPLIED_SIMULATION,
    track: TRACKS.ALGORITHM_ENGINEERING,
    concept: "dijkstra",
    provider: "local",
    collection: "applied-algorithms-v1",
    origin: "catalog",
    derivedStatus: module.derivedStatus,
    derivedFrom: null,
    difficulty: 2,
    status: module.derivedStatus === "verified" ? "verified" : "needs-work",
    requirement: "Nhập graph, chọn start/end và chạy WeightedGraphRouter đã verified để nhận path, distance hoặc unreachable.",
    updatedAt: module.updatedAt,
    createdAt: module.createdAt,
    open: { type: "simulation", simulationId: "route-planner", artifactId: "weighted-graph-router" },
  });
}

async function listCatalog() {
  const [problems, modules] = await Promise.all([problemStore.listProblems(), standaloneModules.listModules()]);
  const derivedLists = await Promise.all(problems.map((problem) => derivedStore.listArtifacts(problem.id).catch(() => [])));
  const derivedItems = derivedLists.flatMap((artifacts, index) => artifacts.map((artifact) => derivedModuleItem(problems[index], artifact)));
  const standaloneItems = modules.map(normalizeCatalogItem);
  const tasks = requirementTasks(standaloneItems);
  const router = standaloneItems.find((item) => item.artifactId === "weighted-graph-router");
  if (router) tasks.push(simulationTask(router));
  return [
    ...standaloneItems,
    ...derivedItems,
    ...tasks,
    ...problems.map(problemItem),
  ].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || String(a.id).localeCompare(String(b.id)));
}

module.exports = { listCatalog, problemItem, derivedModuleItem, requirementTasks, simulationTask };
