"use strict";

// File edge for verified run evidence. Verdict/status are copied here only as
// an inspectable reference to a problemStore history entry; consumers must
// derive completion from Judge history, never from this directory.

const path = require("path");
const crypto = require("crypto");
const fileStore = require("./fileStore");
const { sha256 } = require("./verifiedArtifact");

const EVIDENCE_ID_RE = /^run-[a-f0-9-]{16,80}$/;

function createRunId() {
  return `run-${crypto.randomUUID()}`;
}

function evidenceDir(problemId) {
  return path.join(fileStore.problemDir(problemId), "evidence");
}

function assertEvidenceId(id) {
  if (!EVIDENCE_ID_RE.test(String(id || ""))) {
    const error = new Error("Evidence id không hợp lệ.");
    error.status = 400;
    throw error;
  }
}

function focusTest(result, fallbackTest) {
  const rows = result && Array.isArray(result.results) ? result.results : [];
  return rows.find((row) => row && row.status !== "AC") || rows[rows.length - 1] || fallbackTest || null;
}

function normalizeTest(test) {
  if (!test) return null;
  return {
    testId: test.testId || test.id || "main",
    name: test.name || "",
    input: typeof test.input === "string" ? test.input : "",
    expected: typeof test.expected === "string" ? test.expected : "",
    actual: typeof test.actual === "string" ? test.actual : "",
    stderr: typeof test.stderr === "string" ? test.stderr : "",
    diff: test.diff || null,
    checkerMessage: test.checkerMessage || null,
    timeMs: Math.round(Number(test.timeMs) || 0),
  };
}

function toReference(doc) {
  if (!doc || !doc.run) return null;
  return {
    id: doc.run.id,
    kind: "run-evidence",
    runId: doc.run.id,
    runType: doc.run.type,
    verdict: doc.run.verdict,
    codeHash: doc.codeSnapshot && doc.codeSnapshot.hash,
    testId: doc.test && doc.test.testId || null,
    href: `/api/problems/${encodeURIComponent(doc.problemId)}/evidence/${encodeURIComponent(doc.run.id)}`,
  };
}

async function saveRunEvidence(problemId, { record, code, result, fallbackTest } = {}) {
  if (!record || !record.id) throw new Error("Run history record phải có id trước khi lưu evidence.");
  assertEvidenceId(record.id);
  const test = normalizeTest(focusTest(result, fallbackTest));
  const doc = {
    version: 1,
    kind: "run-evidence",
    problemId,
    run: {
      id: record.id,
      at: record.at,
      type: record.type,
      verdict: record.verdict,
      timeMs: record.timeMs,
      passed: record.passed,
      total: record.total,
    },
    codeSnapshot: {
      hash: sha256(code),
      code: typeof code === "string" ? code : "",
    },
    test,
    compile: {
      ok: result && result.compileOk !== false,
      stderr: result && result.compile && typeof result.compile.stderr === "string"
        ? result.compile.stderr
        : result && result.compileOk === false && typeof result.stderr === "string" ? result.stderr : "",
      timeMs: result && result.compile ? Math.round(Number(result.compile.timeMs) || 0) : 0,
    },
    savedAt: new Date().toISOString(),
  };
  await fileStore.writeJson(path.join(evidenceDir(problemId), `${record.id}.json`), doc);
  return toReference(doc);
}

async function readEvidence(problemId, evidenceId) {
  assertEvidenceId(evidenceId);
  const doc = await fileStore.readJson(path.join(evidenceDir(problemId), `${evidenceId}.json`), null);
  if (!doc || doc.problemId !== problemId || !doc.run || doc.run.id !== evidenceId) return null;
  return doc;
}

async function referenceForHistoryEntry(problemId, entry) {
  if (!entry || !entry.id) return null;
  const doc = await readEvidence(problemId, entry.id);
  return toReference(doc);
}

module.exports = {
  EVIDENCE_ID_RE,
  createRunId,
  toReference,
  saveRunEvidence,
  readEvidence,
  referenceForHistoryEntry,
};
