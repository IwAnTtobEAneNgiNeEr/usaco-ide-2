"use strict";

const path = require("path");
const crypto = require("crypto");
const fileStore = require("./fileStore");
const problemStore = require("./problemStore");
const settingsStore = require("./settingsStore");
const judgeService = require("./judgeService");
const evidenceStore = require("./evidenceStore");
const gridPathfinder = require("./gridPathfinder");

const FILE_NAMES = [
  "GridPathfinder.hpp",
  "GridPathfinder.cpp",
  "GridPathfinder.test.cpp",
  "GridPathfinder.requirement-change.test.cpp",
];

function artifactDir(problemId, artifactId = gridPathfinder.ARTIFACT_ID) {
  return path.join(fileStore.problemDir(problemId), "derived", artifactId);
}

function manifestPath(problemId, artifactId) {
  return path.join(artifactDir(problemId, artifactId), "artifact.json");
}

function assertArtifactId(artifactId) {
  if (artifactId !== gridPathfinder.ARTIFACT_ID) {
    const error = new Error("Derived artifact không được hỗ trợ trong BFS slice này.");
    error.status = 404;
    throw error;
  }
}

async function readRuns(problemId, artifactId) {
  const dir = path.join(artifactDir(problemId, artifactId), "runs");
  const names = (await fileStore.listFiles(dir)).filter((name) => /^check-[a-f0-9-]+\.json$/.test(name));
  const runs = await Promise.all(names.map((name) => fileStore.readJson(path.join(dir, name), null)));
  return runs.filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

async function readFiles(problemId, artifactId) {
  const pairs = await Promise.all(FILE_NAMES.map(async (name) => [
    name,
    await fileStore.readText(path.join(artifactDir(problemId, artifactId), name), null),
  ]));
  return Object.fromEntries(pairs.filter(([, content]) => content != null));
}

async function readSource(problemId, artifactId = gridPathfinder.ARTIFACT_ID) {
  assertArtifactId(artifactId);
  const source = await fileStore.readText(path.join(artifactDir(problemId, artifactId), "GridPathfinder.cpp"), null);
  if (source == null) { const error = new Error("Derived artifact không tồn tại."); error.status = 404; throw error; }
  return { artifactId, file: "GridPathfinder.cpp", source };
}

async function saveSource(problemId, artifactId, source) {
  assertArtifactId(artifactId);
  if (typeof source !== "string" || !source.trim()) { const error = new Error("Source module không được rỗng."); error.status = 400; throw error; }
  if (source.length > 200000) { const error = new Error("Source module vượt giới hạn kích thước."); error.status = 400; throw error; }
  return fileStore.withLock(`derived:${problemId}:${artifactId}`, async () => {
    const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
    if (!manifest) { const error = new Error("Derived artifact không tồn tại."); error.status = 404; throw error; }
    await fileStore.writeText(path.join(artifactDir(problemId, artifactId), "GridPathfinder.cpp"), source);
    manifest.updatedAt = new Date().toISOString();
    await fileStore.writeJson(manifestPath(problemId, artifactId), manifest);
    return getArtifact(problemId, artifactId);
  });
}

async function getArtifact(problemId, artifactId = gridPathfinder.ARTIFACT_ID) {
  assertArtifactId(artifactId);
  const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
  if (!manifest) return null;
  const [files, runs] = await Promise.all([
    readFiles(problemId, artifactId),
    readRuns(problemId, artifactId),
  ]);
  return {
    ...manifest,
    derivedStatus: gridPathfinder.deriveStatus(manifest, runs),
    nextAction: gridPathfinder.nextAction(manifest, runs),
    files,
    runs,
  };
}

async function listArtifacts(problemId) {
  const artifact = await getArtifact(problemId).catch(() => null);
  if (!artifact) return [];
  const { files, runs, ...summary } = artifact;
  return [{ ...summary, fileNames: Object.keys(files), runCount: runs.length }];
}

async function createGridPathfinder(problemId, evidenceId) {
  return fileStore.withLock(`derived:${problemId}:${gridPathfinder.ARTIFACT_ID}`, async () => {
    const evidenceDoc = await evidenceStore.readEvidence(problemId, evidenceId);
    if (!evidenceDoc) {
      const error = new Error("AC evidence không tồn tại.");
      error.status = 404;
      throw error;
    }
    if (evidenceDoc.run.type !== "judge" || evidenceDoc.run.verdict !== "AC") {
      const error = new Error("GridPathfinder chỉ được derive từ full Judge AC evidence.");
      error.status = 409;
      throw error;
    }
    if (await fileStore.pathExists(manifestPath(problemId, gridPathfinder.ARTIFACT_ID))) {
      const error = new Error("GridPathfinder đã tồn tại; endpoint không ghi đè artifact.");
      error.status = 409;
      throw error;
    }

    const meta = await problemStore.readMeta(problemId);
    const evidence = evidenceStore.toReference(evidenceDoc);
    const scaffold = gridPathfinder.buildScaffold({
      problemId,
      sourceTitle: meta.title,
      evidence,
      createdAt: new Date().toISOString(),
    });
    const dir = artifactDir(problemId);
    await Promise.all(Object.entries(scaffold.files).map(([name, content]) => fileStore.writeText(path.join(dir, name), content)));
    await fileStore.writeJson(manifestPath(problemId, gridPathfinder.ARTIFACT_ID), scaffold.manifest);
    return getArtifact(problemId);
  });
}

async function verifyArtifact(problemId, artifactId, suite) {
  assertArtifactId(artifactId);
  if (!["baseline", "requirement-change"].includes(suite)) {
    const error = new Error("Suite phải là baseline hoặc requirement-change.");
    error.status = 400;
    throw error;
  }
  const artifact = await getArtifact(problemId, artifactId);
  if (!artifact) {
    const error = new Error("Derived artifact không tồn tại.");
    error.status = 404;
    throw error;
  }

  const code = gridPathfinder.composeTranslationUnit(artifact.files, suite);
  const settings = await settingsStore.getSettings();
  const result = await judgeService.compileAndRun({ code, settings, input: "", expected: "OK\n" });
  const run = {
    version: 1,
    kind: "derived-check",
    id: `check-${crypto.randomUUID()}`,
    artifactId,
    suite,
    requirementId: artifact.checks[suite].requirementId,
    verdict: result.compilerMissing || !result.compileOk ? "CE" : result.verdict,
    codeHash: gridPathfinder.sourceHash(artifact.files, suite),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timeMs: result.timeMs || 0,
    at: new Date().toISOString(),
  };
  await fileStore.writeJson(path.join(artifactDir(problemId, artifactId), "runs", `${run.id}.json`), run);
  return { check: run, artifact: await getArtifact(problemId, artifactId) };
}

async function activateRequirementChange(problemId, artifactId, changeId) {
  assertArtifactId(artifactId);
  if (changeId !== gridPathfinder.CHANGE_REQUIREMENT) {
    const error = new Error("Requirement change không tồn tại.");
    error.status = 404;
    throw error;
  }
  const manifest = await fileStore.readJson(manifestPath(problemId, artifactId), null);
  if (!manifest) {
    const error = new Error("Derived artifact không tồn tại.");
    error.status = 404;
    throw error;
  }
  const runs = await readRuns(problemId, artifactId);
  if (gridPathfinder.deriveStatus(manifest, runs) !== "verified") {
    const error = new Error("Baseline phải pass trước khi kích hoạt requirement change.");
    error.status = 409;
    throw error;
  }
  manifest.requirements = manifest.requirements.map((requirement) => {
    if (requirement.id === manifest.currentRequirementId) return { ...requirement, status: "superseded" };
    if (requirement.id === changeId) return { ...requirement, status: "active", activatedAt: new Date().toISOString() };
    return requirement;
  });
  manifest.currentRequirementId = changeId;
  manifest.updatedAt = new Date().toISOString();
  await fileStore.writeJson(manifestPath(problemId, artifactId), manifest);
  return getArtifact(problemId, artifactId);
}

module.exports = {
  FILE_NAMES,
  artifactDir,
  getArtifact,
  readSource,
  saveSource,
  listArtifacts,
  createGridPathfinder,
  verifyArtifact,
  activateRequirementChange,
};
