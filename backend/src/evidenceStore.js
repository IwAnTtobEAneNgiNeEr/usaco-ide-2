"use strict";

// Immutable attempt store. Legacy v1 documents remain readable; v2 snapshots
// are the authoritative input to history/current-verification projections.

const path = require("path");
const crypto = require("crypto");
const fileStore = require("./fileStore");
const fsp = require("node:fs/promises");
const { sha256 } = require("./verifiedArtifact");
const { fingerprint } = require("./judgeFingerprint");

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
    judgeFingerprint: doc.judgeFingerprint || null,
    scope: doc.scope || null,
    testId: doc.test && doc.test.testId || null,
    href: `/api/problems/${encodeURIComponent(doc.problemId)}/evidence/${encodeURIComponent(doc.run.id)}`,
  };
}

async function saveRunEvidence(problemId, { record, code, result, fallbackTest, inputSnapshot, judgeFingerprint, scope, cancelled = false } = {}) {
  if (!record || !record.id) throw new Error("Run history record phải có id trước khi lưu evidence.");
  assertEvidenceId(record.id);
  if (inputSnapshot && (judgeFingerprint !== fingerprint(inputSnapshot) || inputSnapshot.source?.code !== code || inputSnapshot.source?.sha256 !== sha256(code))) throw new Error("Attempt source/fingerprint does not match submitted judge inputs.");
  const test = normalizeTest(focusTest(result, fallbackTest));
  const doc = {
    version: inputSnapshot ? 2 : 1,
    kind: "run-evidence",
    problemId,
    run: {
      id: record.id,
      at: record.at,
      startedAt: record.startedAt || record.at,
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
    ...(inputSnapshot ? {
      model: "JudgeAttempt.v1", inputSnapshot, judgeFingerprint, problemRevision: inputSnapshot.problemRevision, scope, cancelled,
      results: (result.results || []).map(row => ({ ...row })),
      testEvidence: inputSnapshot.tests.map(t => ({ ...t, execution: (result.results || []).find(r => r.testId === t.id) || null })),
    } : {}),
    compile: {
      ok: result && result.compileOk !== false,
      target: result?.checkerBroken ? "checker" : "solution",
      stderr: result && result.compile && typeof result.compile.stderr === "string"
        ? result.compile.stderr
        : result && result.compileOk === false && typeof result.stderr === "string" ? result.stderr : "",
      timeMs: result && result.compile ? Math.round(Number(result.compile.timeMs) || 0) : 0,
      command: result?.compile?.command || null,
      cached: Boolean(result?.compile?.cached),
      stdout: result?.compile?.stdout || "",
      exitCode: result?.compile?.exitCode ?? null,
      timedOut: Boolean(result?.compile?.timedOut),
      errorCode: result?.compile?.errorCode || null,
      toolchain: inputSnapshot?.compiler || null,
    },
    savedAt: new Date().toISOString(),
  };
  // Reserve a unique directory exclusively, then publish by atomic rename.
  // MXC denies hard links. A failed/crashed reservation is never reused.
  await fileStore.withLock(`evidence:${problemId}`, async () => {
    const existing = await listAttempts(problemId);
    doc.run.sequence = Math.max(0, ...existing.map(d => d.run.sequence || 0)) + 1;
    await fsp.mkdir(evidenceDir(problemId), { recursive: true });
    const directory = path.join(evidenceDir(problemId), record.id);
    if (await fileStore.readJson(path.join(evidenceDir(problemId), `${record.id}.json`), null)) throw Object.assign(new Error("Attempt already exists."), { code: "EEXIST" });
    await fsp.mkdir(directory);
    const destination = path.join(directory, "attempt.json");
    const temporary = destination + "." + crypto.randomUUID() + ".tmp";
    try {
      const file = await fsp.open(temporary, "wx");
      try { await file.writeFile(JSON.stringify(doc, null, 2), "utf8"); await file.sync(); } finally { await file.close(); }
      await fsp.rename(temporary, destination);
    } finally { await fsp.unlink(temporary).catch(() => {}); }
  });
  return toReference(doc);
}

async function listAttempts(problemId) {
  let entries;
  try { entries = await fsp.readdir(evidenceDir(problemId), { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const ids = entries.filter(e => e.isDirectory() && EVIDENCE_ID_RE.test(e.name) || e.isFile() && e.name.endsWith(".json") && EVIDENCE_ID_RE.test(e.name.slice(0, -5))).map(e => e.isDirectory() ? e.name : e.name.slice(0, -5));
  const docs = await Promise.all(ids.map(id => readEvidence(problemId, id)));
  return docs.filter(Boolean).sort((a, b) => (b.run.sequence || 0) - (a.run.sequence || 0) || String(b.run.at).localeCompare(String(a.run.at)));
}

async function readEvidence(problemId, evidenceId) {
  assertEvidenceId(evidenceId);
  const doc = await fileStore.readJson(path.join(evidenceDir(problemId), evidenceId, "attempt.json"), null)
    || await fileStore.readJson(path.join(evidenceDir(problemId), `${evidenceId}.json`), null);
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
  listAttempts,
};
