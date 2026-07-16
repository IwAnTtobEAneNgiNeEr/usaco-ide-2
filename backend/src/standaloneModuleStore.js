"use strict";

const path = require("path");
const crypto = require("crypto");
const { DATA_DIR } = require("./config");
const fileStore = require("./fileStore");
const settingsStore = require("./settingsStore");
const judgeService = require("./judgeService");
const derivedStore = require("./derivedArtifactStore");
const { MODULE_METADATA, decorateWorkspace } = require("./moduleWorkspaceContract");

const MODULES_DIR = path.join(DATA_DIR, "algorithm-modules");
const PUBLISHED_AT = "2026-07-16T00:00:00.000Z";
const MODULE_IDS = Object.freeze(["grid-pathfinder", "weighted-graph-router", "range-sum-module"]);

function definitionFor(id) {
  if (!MODULE_IDS.includes(id)) {
    const error = new Error("Algorithm module does not exist in the Applied Algorithms pilot.");
    error.status = 404;
    throw error;
  }
  return derivedStore.definitionFor(id);
}

function moduleDir(id) { return path.join(MODULES_DIR, id); }
function manifestPath(id) { return path.join(moduleDir(id), "artifact.json"); }

function virtualScaffold(id) {
  const definition = definitionFor(id);
  const scaffold = definition.buildScaffold({
    problemId: null,
    sourceTitle: "Applied Algorithms catalog",
    evidence: { id: null, runId: "catalog", codeHash: null, inputHash: null, verdict: null },
    createdAt: PUBLISHED_AT,
  });
  scaffold.manifest = {
    ...scaffold.manifest,
    track: "algorithm-engineering",
    provider: "local",
    collection: "applied-algorithms-v1",
    origin: "catalog",
    activityKind: "algorithm-module",
    derivedFrom: null,
    createdAt: scaffold.manifest.createdAt || PUBLISHED_AT,
    updatedAt: scaffold.manifest.updatedAt || PUBLISHED_AT,
  };
  return scaffold;
}

async function readRuns(id) {
  const names = (await fileStore.listFiles(path.join(moduleDir(id), "runs")))
    .filter((name) => /^check-[a-f0-9-]+\.json$/.test(name));
  const runs = await Promise.all(names.map((name) => fileStore.readJson(path.join(moduleDir(id), "runs", name), null)));
  return runs.filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

async function readFiles(id, definition, fallback) {
  const pairs = await Promise.all(definition.FILE_NAMES.map(async (name) => [
    name,
    await fileStore.readText(path.join(moduleDir(id), name), fallback.files[name]),
  ]));
  return Object.fromEntries(pairs.filter(([, content]) => content != null));
}

async function getModule(id) {
  const definition = definitionFor(id);
  const fallback = virtualScaffold(id);
  const manifest = await fileStore.readJson(manifestPath(id), fallback.manifest);
  const [files, runs] = await Promise.all([readFiles(id, definition, fallback), readRuns(id)]);
  return decorateWorkspace({
    ...manifest,
    track: "algorithm-engineering",
    activityKind: "algorithm-module",
    files,
    runs,
    derivedStatus: definition.deriveStatus(manifest, runs, files),
    nextAction: definition.nextAction(manifest, runs, files),
  }, { storage: await fileStore.pathExists(manifestPath(id)) ? "local" : "catalog-default" });
}

async function materialize(id) {
  const definition = definitionFor(id);
  return fileStore.withLock(`module:${id}`, async () => {
    if (await fileStore.pathExists(manifestPath(id))) return getModule(id);
    const scaffold = virtualScaffold(id);
    await Promise.all(Object.entries(scaffold.files).map(([name, content]) =>
      fileStore.writeText(path.join(moduleDir(id), name), content)
    ));
    await fileStore.writeJson(manifestPath(id), scaffold.manifest);
    return getModule(id);
  });
}

async function listModules() {
  const modules = await Promise.all(MODULE_IDS.map(getModule));
  return modules.map((artifact) => {
    const requirement = (artifact.requirements || []).find((item) => item.id === artifact.currentRequirementId) || null;
    return {
      id: `module:${artifact.id}`,
      artifactId: artifact.id,
      title: artifact.title,
      track: "algorithm-engineering",
      activityKind: "algorithm-module",
      itemType: "module",
      concept: artifact.concept,
      provider: artifact.provider,
      collection: artifact.collection,
      origin: artifact.origin,
      derivedFrom: null,
      derivedStatus: artifact.derivedStatus,
      status: artifact.derivedStatus === "verified" ? "verified" : "needs-work",
      requirement: requirement && (requirement.brief || requirement.summary || requirement.id),
      currentRequirementId: artifact.currentRequirementId,
      difficulty: MODULE_METADATA[artifact.id].difficulty,
      updatedAt: artifact.updatedAt,
      createdAt: artifact.createdAt,
      open: { type: "module", scope: "standalone", artifactId: artifact.id },
    };
  });
}

async function readSource(id) {
  const definition = definitionFor(id);
  const artifact = await getModule(id);
  return { artifactId: id, file: definition.SOURCE_FILE, source: artifact.files[definition.SOURCE_FILE] };
}

async function saveSource(id, source) {
  const definition = definitionFor(id);
  if (typeof source !== "string" || !source.trim()) { const error = new Error("Module source cannot be empty."); error.status = 400; throw error; }
  if (source.length > 200000) { const error = new Error("Module source exceeds the size limit."); error.status = 400; throw error; }
  await materialize(id);
  return fileStore.withLock(`module:${id}`, async () => {
    const manifest = await fileStore.readJson(manifestPath(id), null);
    await fileStore.writeText(path.join(moduleDir(id), definition.SOURCE_FILE), source);
    manifest.updatedAt = new Date().toISOString();
    await fileStore.writeJson(manifestPath(id), manifest);
    return getModule(id);
  });
}

async function verifyModule(id, suite) {
  const definition = definitionFor(id);
  suite = suite || "baseline";
  if (!["baseline", "requirement-change"].includes(suite)) { const error = new Error("Suite must be baseline or requirement-change."); error.status = 400; throw error; }
  await materialize(id);
  const artifact = await getModule(id);
  const code = definition.composeTranslationUnit(artifact.files, suite);
  const settings = await settingsStore.getSettings();
  const result = await judgeService.compileAndRun({ code, settings, input: "", expected: "OK\n" });
  const hiddenCode = typeof definition.composeHiddenTranslationUnit === "function"
    ? definition.composeHiddenTranslationUnit(artifact.files, suite)
    : null;
  const hiddenResult = hiddenCode
    ? await judgeService.compileAndRun({ code: hiddenCode, settings, input: "", expected: "OK\n" })
    : null;
  const primaryVerdict = result.compilerMissing || !result.compileOk ? "CE" : result.verdict;
  const hiddenVerdict = hiddenResult && (hiddenResult.compilerMissing || !hiddenResult.compileOk ? "CE" : hiddenResult.verdict);
  const check = {
    version: 1,
    kind: "module-check",
    id: `check-${crypto.randomUUID()}`,
    artifactId: id,
    suite,
    requirementId: artifact.checks[suite].requirementId,
    verdict: primaryVerdict === "AC" && (!hiddenResult || hiddenVerdict === "AC") ? "AC" : primaryVerdict === "AC" ? hiddenVerdict : primaryVerdict,
    codeHash: definition.sourceHash(artifact.files, suite),
    stdout: result.stdout || "",
    stderr: [result.stderr, hiddenResult && hiddenResult.stderr].filter(Boolean).join("\n"),
    timeMs: (result.timeMs || 0) + (hiddenResult && hiddenResult.timeMs || 0),
    suites: hiddenResult ? { public: primaryVerdict, hidden: hiddenVerdict } : { public: primaryVerdict },
    at: new Date().toISOString(),
  };
  await fileStore.writeJson(path.join(moduleDir(id), "runs", `${check.id}.json`), check);
  return { check, artifact: await getModule(id) };
}

async function activateRequirementChange(id, changeId) {
  const definition = definitionFor(id);
  if (changeId !== definition.CHANGE_REQUIREMENT) { const error = new Error("Requirement change does not exist."); error.status = 404; throw error; }
  await materialize(id);
  return fileStore.withLock(`module:${id}`, async () => {
    const artifact = await getModule(id);
    if (artifact.currentRequirementId === changeId) return artifact;
    if (artifact.derivedStatus !== "verified") { const error = new Error("Baseline must pass before activating a requirement change."); error.status = 409; throw error; }
    const manifest = await fileStore.readJson(manifestPath(id), null);
    manifest.requirements = manifest.requirements.map((requirement) =>
      requirement.id === manifest.currentRequirementId ? { ...requirement, status: "superseded" }
        : requirement.id === changeId ? { ...requirement, status: "active", activatedAt: new Date().toISOString() }
          : requirement
    );
    manifest.currentRequirementId = changeId;
    manifest.updatedAt = new Date().toISOString();
    await fileStore.writeJson(manifestPath(id), manifest);
    return getModule(id);
  });
}

function inputError(message) { const error = new Error(message); error.status = 400; return error; }

function parseRouteInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw inputError("Route input must be a JSON object.");
  const nodeCount = value.nodeCount;
  const edgesInput = value.edges;
  const start = value.start;
  const target = value.target;
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 1 || nodeCount > 200) throw inputError("nodeCount must be an integer from 1 to 200.");
  if (!Array.isArray(edgesInput) || edgesInput.length > 2000) throw inputError("edges must be an array with at most 2000 directed edges.");
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(target) || start < 0 || start >= nodeCount || target < 0 || target >= nodeCount) throw inputError("start and target must be valid node indices.");
  const edges = edgesInput.map((edge, index) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) throw inputError(`Edge ${index + 1} must be an object.`);
    const { from, to, weight } = edge;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from >= nodeCount || to < 0 || to >= nodeCount) throw inputError(`Edge ${index + 1} has an invalid node.`);
    if (!Number.isSafeInteger(weight) || weight < 0 || weight > 1000000000000) throw inputError(`Edge ${index + 1} must have a safe non-negative integer weight.`);
    return { from, to, weight };
  });
  return { nodeCount, edges, start, target };
}

function assertValidModuleOutput(graph, output) {
  if (!output.reachable) return;
  if (!Number.isSafeInteger(output.distance) || output.distance < 0 || !Array.isArray(output.path) || output.path.length < 1) throw Object.assign(new Error("Verified module returned an invalid simulation result."), { status: 422 });
  if (output.path[0] !== graph.start || output.path[output.path.length - 1] !== graph.target || output.path.some((node) => !Number.isSafeInteger(node) || node < 0 || node >= graph.nodeCount)) throw Object.assign(new Error("Verified module returned an invalid route."), { status: 422 });
  let total = 0;
  for (let i = 1; i < output.path.length; i += 1) {
    const weights = graph.edges.filter((edge) => edge.from === output.path[i - 1] && edge.to === output.path[i]).map((edge) => edge.weight);
    if (!weights.length) throw Object.assign(new Error("Verified module returned a path containing a missing edge."), { status: 422 });
    total += Math.min(...weights);
  }
  if (total !== output.distance) throw Object.assign(new Error("Verified module returned a path whose weight does not match its distance."), { status: 422 });
}

async function simulateRoute(input) {
  const id = "weighted-graph-router";
  const definition = definitionFor(id);
  const artifact = await getModule(id);
  if (artifact.derivedStatus !== "verified") { const error = new Error("WeightedGraphRouter must pass its active requirement before simulation can run."); error.status = 409; throw error; }
  const graph = parseRouteInput(input);
  const strip = (text) => String(text || "").replace(/^#include\s+"WeightedGraphRouter\.hpp"\s*$/gm, "");
  const harness = `
#include <iostream>
int main(){
  int n,m; if(!(std::cin>>n>>m)) return 2; WeightedGraphRouter router(n);
  for(int i=0;i<m;++i){int u,v; long long w; std::cin>>u>>v>>w; router.addDirectedEdge(u,v,w);}
  int s,t; std::cin>>s>>t; auto result=router.shortestPath(s,t);
  if(!result.reachable){std::cout<<"UNREACHABLE\\n";return 0;}
  std::cout<<"DISTANCE "<<result.distance<<"\\nPATH";
  for(int node:result.path) std::cout<<' '<<node; std::cout<<"\\n";
}
`;
  const code = [artifact.files["WeightedGraphRouter.hpp"], strip(artifact.files[definition.SOURCE_FILE]), harness].join("\n");
  const stdin = [
    `${graph.nodeCount} ${graph.edges.length}`,
    ...graph.edges.map((edge) => `${edge.from} ${edge.to} ${edge.weight}`),
    `${graph.start} ${graph.target}`,
    "",
  ].join("\n");
  const result = await judgeService.compileAndRun({ code, settings: await settingsStore.getSettings(), input: stdin, expected: "" });
  if (!result.compileOk || !result.runtimeOk) {
    const error = new Error(result.stderr || `Route simulation failed with ${result.verdict}.`);
    error.status = 422;
    throw error;
  }
  const lines = String(result.stdout || "").trim().split(/\r?\n/);
  const codeHash = definition.sourceHash(artifact.files, artifact.currentRequirementId === definition.CHANGE_REQUIREMENT ? "requirement-change" : "baseline");
  if (lines[0] === "UNREACHABLE") return { output: { reachable: false, distance: null, path: [] }, module: { artifactId: id, derivedStatus: artifact.derivedStatus, codeHash }, run: { verdict: "AC", timeMs: result.timeMs || 0 } };
  const distance = Number((lines[0] || "").replace(/^DISTANCE\s+/, ""));
  const route = (lines[1] || "").replace(/^PATH\s*/, "").trim();
  const routePath = route ? route.split(/\s+/).map(Number) : [];
  const output = { reachable: true, distance, path: routePath };
  assertValidModuleOutput(graph, output);
  return { output, module: { artifactId: id, derivedStatus: artifact.derivedStatus, codeHash }, run: { verdict: "AC", timeMs: result.timeMs || 0 } };
}

module.exports = {
  MODULE_IDS,
  MODULES_DIR,
  MODULE_METADATA,
  getModule,
  materialize,
  listModules,
  readSource,
  saveSource,
  verifyModule,
  activateRequirementChange,
  readRuns,
  parseRouteInput,
  simulateRoute,
};
