"use strict";

const path = require("path");
const crypto = require("crypto");
const fileStore = require("./fileStore");
const problemStore = require("./problemStore");
const settingsStore = require("./settingsStore");
const judgeService = require("./judgeService");
const evidenceStore = require("./evidenceStore");
const gridPathfinder = require("./gridPathfinder");
const weightedGraphRouter = require("./weightedGraphRouter");
const rangeSum = require("./rangeSum");
const { decorateWorkspace } = require("./moduleWorkspaceContract");

// Backward-compatible export used by the BFS tests.
const FILE_NAMES = ["GridPathfinder.hpp", "GridPathfinder.cpp", "GridPathfinder.test.cpp", "GridPathfinder.requirement-change.test.cpp"];

function definitionFor(artifactId) {
  if (artifactId === gridPathfinder.ARTIFACT_ID) return { ...gridPathfinder, SOURCE_FILE: "GridPathfinder.cpp", FILE_NAMES };
  if (artifactId === weightedGraphRouter.ARTIFACT_ID) return weightedGraphRouter;
  if (artifactId === rangeSum.ARTIFACT_ID) return rangeSum;
  const error = new Error("Derived artifact is not supported by the concrete BFS/Dijkstra/Prefix Sum slices.");
  error.status = 404;
  throw error;
}

function artifactDir(problemId, artifactId = gridPathfinder.ARTIFACT_ID) { return path.join(fileStore.problemDir(problemId), "derived", artifactId); }
function manifestPath(problemId, artifactId) { return path.join(artifactDir(problemId, artifactId), "artifact.json"); }
function assertArtifactId(artifactId) { return definitionFor(artifactId); }

async function readRuns(problemId, artifactId) {
  const dir = path.join(artifactDir(problemId, artifactId), "runs");
  const names = (await fileStore.listFiles(dir)).filter((name) => /^check-[a-f0-9-]+\.json$/.test(name));
  const runs = await Promise.all(names.map((name) => fileStore.readJson(path.join(dir, name), null)));
  return runs.filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

async function readFiles(problemId, artifactId) {
  const definition = definitionFor(artifactId);
  const pairs = await Promise.all(definition.FILE_NAMES.map(async (name) => [name, await fileStore.readText(path.join(artifactDir(problemId, artifactId), name), null)]));
  return Object.fromEntries(pairs.filter(([, content]) => content != null));
}

async function readSource(problemId, artifactId = gridPathfinder.ARTIFACT_ID) {
  const definition = assertArtifactId(artifactId);
  const source = await fileStore.readText(path.join(artifactDir(problemId, artifactId), definition.SOURCE_FILE), null);
  if (source == null) { const error = new Error("Derived artifact does not exist."); error.status = 404; throw error; }
  return { artifactId, file: definition.SOURCE_FILE, source };
}

async function saveSource(problemId, artifactId, source) {
  const definition = assertArtifactId(artifactId);
  if (typeof source !== "string" || !source.trim()) { const error = new Error("Module source cannot be empty."); error.status = 400; throw error; }
  if (source.length > 200000) { const error = new Error("Module source exceeds the size limit."); error.status = 400; throw error; }
  return fileStore.withLock(`derived:${problemId}:${artifactId}`, async () => {
    const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
    if (!manifest) { const error = new Error("Derived artifact does not exist."); error.status = 404; throw error; }
    await fileStore.writeText(path.join(artifactDir(problemId, artifactId), definition.SOURCE_FILE), source);
    manifest.updatedAt = new Date().toISOString();
    await fileStore.writeJson(manifestPath(problemId, artifactId), manifest);
    return getArtifact(problemId, artifactId);
  });
}

async function getArtifact(problemId, artifactId = gridPathfinder.ARTIFACT_ID) {
  const definition = assertArtifactId(artifactId);
  const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
  if (!manifest) return null;
  const [files, runs] = await Promise.all([readFiles(problemId, artifactId), readRuns(problemId, artifactId)]);
  return decorateWorkspace({ ...manifest, derivedStatus: definition.deriveStatus(manifest, runs, files), nextAction: definition.nextAction(manifest, runs, files), files, runs }, { storage: "local" });
}

async function listArtifacts(problemId) {
  const ids = [gridPathfinder.ARTIFACT_ID, weightedGraphRouter.ARTIFACT_ID, rangeSum.ARTIFACT_ID];
  const artifacts = await Promise.all(ids.map((id) => getArtifact(problemId, id).catch(() => null)));
  return artifacts.filter(Boolean).map(({ files, runs, ...summary }) => ({ ...summary, fileNames: Object.keys(files), runCount: runs.length }));
}

async function createConcreteArtifact(problemId, evidenceId, definition, label) {
  return fileStore.withLock(`derived:${problemId}:${definition.ARTIFACT_ID}`, async () => {
    const evidenceDoc = await evidenceStore.readEvidence(problemId, evidenceId);
    if (!evidenceDoc) { const error = new Error("AC evidence does not exist."); error.status = 404; throw error; }
    if (evidenceDoc.run.type !== "judge" || evidenceDoc.run.verdict !== "AC") { const error = new Error(`${label} requires full Judge AC evidence.`); error.status = 409; throw error; }
    if (await fileStore.pathExists(manifestPath(problemId, definition.ARTIFACT_ID))) { const error = new Error(`${label} already exists; derived artifacts are never overwritten.`); error.status = 409; throw error; }
    const meta = await problemStore.readMeta(problemId);
    const scaffold = definition.buildScaffold({ problemId, sourceTitle: meta.title, evidence: evidenceStore.toReference(evidenceDoc), createdAt: new Date().toISOString() });
    const dir = artifactDir(problemId, definition.ARTIFACT_ID);
    await Promise.all(Object.entries(scaffold.files).map(([name, content]) => fileStore.writeText(path.join(dir, name), content)));
    await fileStore.writeJson(manifestPath(problemId, definition.ARTIFACT_ID), scaffold.manifest);
    return getArtifact(problemId, definition.ARTIFACT_ID);
  });
}

function createGridPathfinder(problemId, evidenceId) { return createConcreteArtifact(problemId, evidenceId, { ...gridPathfinder, SOURCE_FILE: "GridPathfinder.cpp", FILE_NAMES }, "GridPathfinder"); }
function createWeightedGraphRouter(problemId, evidenceId) { return createConcreteArtifact(problemId, evidenceId, weightedGraphRouter, "WeightedGraphRouter"); }
function createRangeSumModule(problemId, evidenceId) { return createConcreteArtifact(problemId, evidenceId, rangeSum, "RangeSum"); }

async function verifyArtifact(problemId, artifactId, suite) {
  const definition = assertArtifactId(artifactId);
  if (!["baseline", "requirement-change"].includes(suite)) { const error = new Error("Suite must be baseline or requirement-change."); error.status = 400; throw error; }
  const artifact = await getArtifact(problemId, artifactId);
  if (!artifact) { const error = new Error("Derived artifact does not exist."); error.status = 404; throw error; }
  const code = definition.composeTranslationUnit(artifact.files, suite);
  const settings = await settingsStore.getSettings();
  const result = await judgeService.compileAndRun({ code, settings, input: "", expected: "OK\n" });
  const hiddenCode = typeof definition.composeHiddenTranslationUnit === "function"
    ? definition.composeHiddenTranslationUnit(artifact.files, suite)
    : null;
  const hiddenResult = hiddenCode
    ? await judgeService.compileAndRun({ code: hiddenCode, settings, input: "", expected: "OK\n" })
    : null;
  const publicVerdict = result.compilerMissing || !result.compileOk ? "CE" : result.verdict;
  const hiddenVerdict = hiddenResult && (hiddenResult.compilerMissing || !hiddenResult.compileOk ? "CE" : hiddenResult.verdict);
  const run = {
    version: 1, kind: "derived-check", id: `check-${crypto.randomUUID()}`, artifactId, suite,
    requirementId: artifact.checks[suite].requirementId,
    verdict: publicVerdict === "AC" && (!hiddenResult || hiddenVerdict === "AC") ? "AC" : publicVerdict === "AC" ? hiddenVerdict : publicVerdict,
    codeHash: definition.sourceHash(artifact.files, suite), stdout: result.stdout || "", stderr: [result.stderr, hiddenResult && hiddenResult.stderr].filter(Boolean).join("\n"),
    timeMs: (result.timeMs || 0) + (hiddenResult && hiddenResult.timeMs || 0), suites: hiddenResult ? { public: publicVerdict, hidden: hiddenVerdict } : { public: publicVerdict }, at: new Date().toISOString(),
  };
  await fileStore.writeJson(path.join(artifactDir(problemId, artifactId), "runs", `${run.id}.json`), run);
  return { check: run, artifact: await getArtifact(problemId, artifactId) };
}

async function activateRequirementChange(problemId, artifactId, changeId) {
  const definition = assertArtifactId(artifactId);
  if (changeId !== definition.CHANGE_REQUIREMENT) { const error = new Error("Requirement change does not exist."); error.status = 404; throw error; }
  const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
  if (!manifest) { const error = new Error("Derived artifact does not exist."); error.status = 404; throw error; }
  const runs = await readRuns(problemId, artifactId);
  const files = await readFiles(problemId, artifactId);
  if (definition.deriveStatus(manifest, runs, files) !== "verified") { const error = new Error("Baseline must pass before activating a requirement change."); error.status = 409; throw error; }
  manifest.requirements = manifest.requirements.map((requirement) => requirement.id === manifest.currentRequirementId ? { ...requirement, status: "superseded" } : requirement.id === changeId ? { ...requirement, status: "active", activatedAt: new Date().toISOString() } : requirement);
  manifest.currentRequirementId = changeId; manifest.updatedAt = new Date().toISOString();
  await fileStore.writeJson(manifestPath(problemId, artifactId), manifest);
  return getArtifact(problemId, artifactId);
}

module.exports = { FILE_NAMES, definitionFor, artifactDir, getArtifact, readSource, saveSource, listArtifacts, createGridPathfinder, createWeightedGraphRouter, createRangeSumModule, verifyArtifact, activateRequirementChange };
