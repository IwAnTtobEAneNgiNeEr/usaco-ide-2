"use strict";

// referenceStore.js — "Kho Tham Chiếu" (Reference Vault), S1 of the Đấu Trường
// (Arena) big update. The single biggest structural waste found while auditing
// the app: a trustworthy reference/brute solution is compiled, used once, and
// thrown away in THREE different places (verifyTests.js, autopsy/orchestrator.js
// ensureReference, the Stress Lab's "AI viết" button) — every one of them pays
// the AI-generate + compile + sample-check cost again for the same problem.
//
// This module persists those assets ONCE per problem, alongside a per-problem
// special judge (checker.cpp already does exactly this — same folder-per-asset
// idiom, same atomic-write discipline as fileStore.js/problemStore.js).
//
//   workspace/problems/<id>/arena/
//     reference.cpp   — a solution trusted to be correct (source: ai-brute |
//                        ac-code | manual)
//     generator.cpp    — a random-input generator (source: ai | manual)
//     validator.cpp     — an input constraints checker (S12; source: ai | manual)
//     meta.json         — { version, statementHash, reference:{...}, generator:{...},
//                            validator:{...}, gauntlet:{...} }
//
// Trust is scoped to a SPECIFIC statement: if the statement changes after a
// reference was saved, `evaluateTrust` reports it stale rather than silently
// keeping a reference that answers a question that no longer exists. This
// mirrors the statementHash discipline already used by trustLayer.js for tests.

const path = require("path");
const fileStore = require("../fileStore");
const runCpp = require("../runCpp");

function arenaDir(id) {
  return path.join(fileStore.problemDir(id), "arena");
}
function referencePath(id) {
  return path.join(arenaDir(id), "reference.cpp");
}
function generatorPath(id) {
  return path.join(arenaDir(id), "generator.cpp");
}
function validatorPath(id) {
  return path.join(arenaDir(id), "validator.cpp");
}
function metaPath(id) {
  return path.join(arenaDir(id), "meta.json");
}

function lockKey(id) {
  return `arena-vault:${id}`;
}

function defaultMeta() {
  return {
    version: 1,
    statementHash: "",
    reference: { present: false, source: "", trusted: false, samplesChecked: 0, verifiedAt: "" },
    generator: { present: false, source: "" },
    validator: { present: false, source: "" },
    gauntlet: { lastRunAt: "", lastResult: null, survivedRuns: 0 },
  };
}

/** Merge saved JSON over the default shape so a partial/old file never crashes callers. */
function normalizeMeta(raw) {
  const base = defaultMeta();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    reference: { ...base.reference, ...(raw.reference || {}) },
    generator: { ...base.generator, ...(raw.generator || {}) },
    validator: { ...base.validator, ...(raw.validator || {}) },
    gauntlet: { ...base.gauntlet, ...(raw.gauntlet || {}) },
  };
}

async function readMeta(id) {
  return normalizeMeta(await fileStore.readJson(metaPath(id), null));
}

async function writeMeta(id, meta) {
  await fileStore.writeJson(metaPath(id), meta);
  return meta;
}

/** Read-modify-write under a per-problem lock — same hazard as problemStore's meta.json. */
async function mutateMeta(id, apply) {
  return fileStore.withLock(lockKey(id), async () => {
    const meta = await readMeta(id);
    apply(meta);
    await writeMeta(id, meta);
    return meta;
  });
}

// ---------------------------------------------------------------------------
// Pure trust decision — no I/O, easy to unit test in isolation.
// ---------------------------------------------------------------------------

/**
 * A reference is usable-without-regenerating iff it exists, was already found
 * to match the official samples, AND was saved for THIS exact statement (a
 * changed statement invalidates trust — the "reference" now answers a
 * different question).
 */
function evaluateTrust(meta, statementHash) {
  const m = normalizeMeta(meta);
  if (!m.reference.present) return { usable: false, reason: "absent" };
  if (m.statementHash !== statementHash) return { usable: false, reason: "stale-statement" };
  if (!m.reference.trusted) return { usable: false, reason: "untrusted" };
  return { usable: true, reason: "trusted" };
}

// ---------------------------------------------------------------------------
// Shared trust check: compile `code` and cross-check it against the
// statement's official samples. Same discipline verifyTests.js/orchestrator.js
// use — factored HERE (not duplicated per route) so a manually-pasted
// reference, an AI-generated one, and a student's own promoted AC code all
// clear the identical bar. Not pure (compiles/runs a real binary) — same tier
// as gauntlet.js's ensureReference.
// ---------------------------------------------------------------------------

async function verifyCodeAgainstSamples(code, judgeSettings, samples) {
  const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
  try {
    if (built.compilerMissing) return { compiled: false, compilerMissing: true, trusted: false, samplesChecked: 0 };
    if (!built.ok) return { compiled: false, compilerMissing: false, trusted: false, samplesChecked: 0, stderr: built.stderr };
    const list = (Array.isArray(samples) ? samples : []).filter((s) => s && s.output && String(s.output).trim());
    const limit = Math.min(Math.max(Number(judgeSettings && judgeSettings.timeMs) || 2000, 500), 3000);
    let checked = 0;
    for (const s of list) {
      const r = await runCpp.runBinary({ binaryPath: built.binaryPath, input: s.input, timeMs: limit });
      if (r.status !== "OK" || !runCpp.compareOutput(s.output, r.stdout, "loose").ok) {
        return { compiled: true, compilerMissing: false, trusted: false, samplesChecked: checked };
      }
      checked += 1;
    }
    return { compiled: true, compilerMissing: false, trusted: list.length > 0, samplesChecked: checked };
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
}

// ---------------------------------------------------------------------------
// Reference asset
// ---------------------------------------------------------------------------

async function getReferenceCode(id) {
  return fileStore.readText(referencePath(id), "");
}

/** Persist the reference source + its trust verdict together (never out of sync). */
async function setReference(id, code, { source, trusted, samplesChecked, statementHash } = {}) {
  await fileStore.writeText(referencePath(id), code == null ? "" : String(code));
  return mutateMeta(id, (meta) => {
    if (typeof statementHash === "string") meta.statementHash = statementHash;
    meta.reference = {
      present: true,
      source: source || "manual",
      trusted: Boolean(trusted),
      samplesChecked: Number(samplesChecked) || 0,
      verifiedAt: new Date().toISOString(),
    };
  });
}

async function clearReference(id) {
  await fileStore.removeFile(referencePath(id));
  return mutateMeta(id, (meta) => {
    meta.reference = defaultMeta().reference;
  });
}

// ---------------------------------------------------------------------------
// Generator asset
// ---------------------------------------------------------------------------

async function getGeneratorCode(id) {
  return fileStore.readText(generatorPath(id), "");
}

async function setGenerator(id, code, { source } = {}) {
  await fileStore.writeText(generatorPath(id), code == null ? "" : String(code));
  return mutateMeta(id, (meta) => {
    meta.generator = { present: true, source: source || "manual" };
  });
}

async function clearGenerator(id) {
  await fileStore.removeFile(generatorPath(id));
  return mutateMeta(id, (meta) => {
    meta.generator = defaultMeta().generator;
  });
}

// ---------------------------------------------------------------------------
// Validator asset (S12 — Người Gác Cổng)
// ---------------------------------------------------------------------------

async function getValidatorCode(id) {
  return fileStore.readText(validatorPath(id), "");
}

async function setValidator(id, code, { source } = {}) {
  await fileStore.writeText(validatorPath(id), code == null ? "" : String(code));
  return mutateMeta(id, (meta) => {
    meta.validator = { present: true, source: source || "manual" };
  });
}

// ---------------------------------------------------------------------------
// Gauntlet bookkeeping (S1) — small, honest counters; never a promise, just a log.
// ---------------------------------------------------------------------------

async function recordGauntletRun(id, { result, survivedRuns } = {}) {
  return mutateMeta(id, (meta) => {
    meta.gauntlet = {
      lastRunAt: new Date().toISOString(),
      lastResult: result || null, // "survived" | "broken"
      survivedRuns: Number(survivedRuns) || 0,
    };
  });
}

module.exports = {
  arenaDir,
  referencePath,
  generatorPath,
  validatorPath,
  metaPath,
  defaultMeta,
  normalizeMeta,
  readMeta,
  writeMeta,
  evaluateTrust,
  verifyCodeAgainstSamples,
  getReferenceCode,
  setReference,
  clearReference,
  getGeneratorCode,
  setGenerator,
  clearGenerator,
  getValidatorCode,
  setValidator,
  recordGauntletRun,
};
