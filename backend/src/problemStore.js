"use strict";

const path = require("path");
const { PROBLEMS_DIR, DEFAULT_TEMPLATE, FILE_KINDS, LIMITS } = require("./config");
const store = require("./fileStore");

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function defaultMeta(id, overrides = {}) {
  const ts = nowIso();
  return {
    id,
    title: overrides.title || id,
    source: overrides.source || "",
    topic: overrides.topic || "",
    difficulty: overrides.difficulty || "unrated",
    status: overrides.status || "learning",
    tags: Array.isArray(overrides.tags) ? overrides.tags : [],
    fileName: typeof overrides.fileName === "string" ? overrides.fileName : "",
    usacoMode: Boolean(overrides.usacoMode),
    usesChecker: Boolean(overrides.usesChecker), // special judge (checker.cpp) instead of plain compare
    timeLimitMs: Number(overrides.timeLimitMs) > 0 ? Math.round(Number(overrides.timeLimitMs)) : 0, // per-problem TLE; 0 = use global Settings

    analysis: overrides.analysis && typeof overrides.analysis === "object" ? overrides.analysis : null,
    // AC Defense (viva): { passed, score, passedAt } — set when the student
    // successfully defends their accepted solution to the AI examiner.
    defense: overrides.defense && typeof overrides.defense === "object" ? overrides.defense : null,
    lastVerdict: overrides.lastVerdict || null,
    reviewCount: Number(overrides.reviewCount) > 0 ? Math.floor(Number(overrides.reviewCount)) : 0,
    lastReviewedAt: typeof overrides.lastReviewedAt === "string" ? overrides.lastReviewedAt : "",
    testNames: overrides.testNames && typeof overrides.testNames === "object" ? overrides.testNames : {},
    history: Array.isArray(overrides.history) ? overrides.history : [],
    createdAt: overrides.createdAt || ts,
    updatedAt: overrides.updatedAt || ts
  };
}

function metaPath(id) {
  return path.join(store.problemDir(id), "meta.json");
}

async function readMeta(id) {
  const raw = await store.readJson(metaPath(id), null);
  if (!raw) return defaultMeta(id);
  // Heal missing fields so old/partial data never crashes the app.
  return defaultMeta(id, raw);
}

async function writeMeta(id, meta) {
  await store.writeJson(metaPath(id), meta);
  return meta;
}

// A lightweight summary used by the problem list (no heavy file reads).
function toSummary(meta) {
  return {
    id: meta.id,
    title: meta.title,
    source: meta.source,
    topic: meta.topic,
    difficulty: meta.difficulty,
    status: meta.status,
    tags: meta.tags,
    lastVerdict: meta.lastVerdict,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt
  };
}

// ---------------------------------------------------------------------------
// Problem CRUD
// ---------------------------------------------------------------------------

async function listProblems() {
  const ids = await store.listSubdirs(PROBLEMS_DIR);
  const metas = await Promise.all(ids.map((id) => readMeta(id)));
  return metas
    .map(toSummary)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function problemExists(id) {
  return store.pathExists(store.problemDir(id));
}

async function scaffold(id, meta, files = {}) {
  const dir = store.problemDir(id);
  await store.ensureDir(path.join(dir, "tests"));
  await store.writeText(path.join(dir, FILE_KINDS.code), files.code != null ? files.code : DEFAULT_TEMPLATE);
  await store.writeText(path.join(dir, FILE_KINDS.input), files.input != null ? files.input : "");
  await store.writeText(path.join(dir, FILE_KINDS.expected), files.expected != null ? files.expected : "");
  await store.writeText(path.join(dir, FILE_KINDS.notes), files.notes != null ? files.notes : `# ${meta.title}\n`);
  await store.writeText(path.join(dir, FILE_KINDS.statement), files.statement != null ? files.statement : "");
  await writeMeta(id, meta);
}

async function createProblem(input = {}) {
  const baseSlug = store.slugify(input.id || input.title || "problem");
  const id = await store.uniqueId(baseSlug);
  const meta = defaultMeta(id, { ...input, title: input.title || baseSlug });
  await scaffold(id, meta, {
    code: input.code,
    input: input.input,
    expected: input.expected,
    notes: input.notes,
    statement: input.statement
  });
  // Seed initial test cases if provided.
  if (Array.isArray(input.tests)) {
    for (const test of input.tests) {
      await addTest(id, test);
    }
  }
  return readMeta(id);
}

const META_PATCHABLE = ["title", "source", "topic", "difficulty", "status", "tags", "lastVerdict", "fileName", "usacoMode", "usesChecker", "timeLimitMs", "analysis", "defense", "reviewCount", "lastReviewedAt"];

async function updateProblem(id, patch = {}) {
  const meta = await readMeta(id);
  for (const key of META_PATCHABLE) {
    if (key in patch) meta[key] = patch[key];
  }
  meta.updatedAt = nowIso();
  await writeMeta(id, meta);
  return meta;
}

async function deleteProblem(id) {
  await store.removeDir(store.problemDir(id));
}

async function duplicateProblem(id) {
  const meta = await readMeta(id);
  const baseSlug = await store.uniqueId(store.slugify(meta.id + "-copy"));
  const newMeta = defaultMeta(baseSlug, {
    ...meta,
    id: baseSlug,
    title: meta.title + " (copy)",
    history: [],
    lastVerdict: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  const srcDir = store.problemDir(id);
  await scaffold(baseSlug, newMeta, {
    code: await store.readText(path.join(srcDir, FILE_KINDS.code), DEFAULT_TEMPLATE),
    input: await store.readText(path.join(srcDir, FILE_KINDS.input), ""),
    expected: await store.readText(path.join(srcDir, FILE_KINDS.expected), ""),
    notes: await store.readText(path.join(srcDir, FILE_KINDS.notes), ""),
    statement: await store.readText(path.join(srcDir, FILE_KINDS.statement), "")
  });
  // Copy tests across, preserving names/reasons.
  const tests = await listTests(id);
  for (const test of tests) {
    await addTest(baseSlug, { input: test.input, expected: test.expected, name: test.name, reason: test.reason, generatedBy: test.generatedBy });
  }
  return readMeta(baseSlug);
}

// ---------------------------------------------------------------------------
// Single-file accessors (code / input / expected / notes)
// ---------------------------------------------------------------------------

function fileKindToName(kind) {
  return FILE_KINDS[kind];
}

async function getFile(id, kind) {
  const name = fileKindToName(kind);
  if (!name) throw new Error(`Unknown file kind: ${kind}`);
  const fallback = kind === "code" ? DEFAULT_TEMPLATE : "";
  return store.readText(path.join(store.problemDir(id), name), fallback);
}

async function setFile(id, kind, content) {
  const name = fileKindToName(kind);
  if (!name) throw new Error(`Unknown file kind: ${kind}`);
  await store.writeText(path.join(store.problemDir(id), name), content);
  await touch(id);
  return true;
}

// Bump updatedAt, but THROTTLED: autosave calls setFile (→ touch) on every
// debounced keystroke; rewriting the whole meta.json that often is pure disk
// churn. We persist at most once per TOUCH_MIN_MS per problem (recordRun and
// updateProblem still write meta immediately, so verdicts/edits are never lost).
const TOUCH_MIN_MS = 10000;
const lastTouch = new Map();

async function touch(id, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastTouch.get(id) || 0) < TOUCH_MIN_MS) return;
  lastTouch.set(id, now);
  const meta = await readMeta(id);
  meta.updatedAt = nowIso();
  await writeMeta(id, meta);
}

// ---------------------------------------------------------------------------
// Test cases  (tests/NN.in + tests/NN.out)
// ---------------------------------------------------------------------------

function testsDir(id) {
  return path.join(store.problemDir(id), "tests");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function inPath(id, testId) {
  return path.join(testsDir(id), `${testId}.in`);
}

function outPath(id, testId) {
  return path.join(testsDir(id), `${testId}.out`);
}

async function listTestIds(id) {
  const files = await store.listFiles(testsDir(id));
  const ids = files
    .filter((name) => name.endsWith(".in"))
    .map((name) => name.slice(0, -3));
  ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ids;
}

// Per-test metadata lives in tests/meta.json: { tests: [{id,name,reason,generatedBy,createdAt}] }.
function testsMetaPath(id) {
  return path.join(testsDir(id), "meta.json");
}

async function readTestsMeta(id) {
  const raw = await store.readJson(testsMetaPath(id), null);
  const map = {};
  if (raw && Array.isArray(raw.tests)) {
    for (const t of raw.tests) {
      if (t && t.id) map[t.id] = t;
    }
  }
  return map;
}

async function writeTestsMeta(id, map) {
  const tests = Object.keys(map)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((tid) => map[tid]);
  await store.writeJson(testsMetaPath(id), { tests });
}

// Resolve a display name, preferring tests/meta.json, then legacy meta.testNames.
async function testInfo(id, testId, testsMeta, problemMeta) {
  const entry = testsMeta[testId];
  const legacyName = problemMeta && problemMeta.testNames && problemMeta.testNames[testId];
  return {
    name: (entry && entry.name) || legacyName || `Test ${testId}`,
    reason: (entry && entry.reason) || "",
    generatedBy: (entry && entry.generatedBy) || "manual"
  };
}

async function listTests(id) {
  const problemMeta = await readMeta(id);
  const testsMeta = await readTestsMeta(id);
  const ids = await listTestIds(id);
  const tests = [];
  for (const testId of ids) {
    const info = await testInfo(id, testId, testsMeta, problemMeta);
    tests.push({
      id: testId,
      name: info.name,
      reason: info.reason,
      generatedBy: info.generatedBy,
      input: await store.readText(inPath(id, testId), ""),
      expected: await store.readText(outPath(id, testId), "")
    });
  }
  return tests;
}

async function writeTestFiles(id, testId, input, expected) {
  await store.writeText(inPath(id, testId), input != null ? input : "");
  await store.writeText(outPath(id, testId), expected != null ? expected : "");
}

async function nextTestId(id) {
  const ids = await listTestIds(id);
  let max = 0;
  for (const tid of ids) {
    const n = parseInt(tid, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return pad(max + 1);
}

async function addTest(id, { input = "", expected = "", output, name, reason, generatedBy } = {}) {
  const ids = await listTestIds(id);
  if (ids.length >= LIMITS.maxTests) {
    throw new Error(`Maximum of ${LIMITS.maxTests} test cases reached.`);
  }
  const testId = await nextTestId(id);
  await writeTestFiles(id, testId, input, expected != null ? expected : output);

  const testsMeta = await readTestsMeta(id);
  testsMeta[testId] = {
    id: testId,
    name: name ? String(name) : `Test ${testId}`,
    reason: reason ? String(reason) : "",
    generatedBy: generatedBy === "ai" ? "ai" : "manual",
    createdAt: nowIso()
  };
  await writeTestsMeta(id, testsMeta);
  await touch(id);
  return { id: testId, ...testsMeta[testId], input, expected: expected != null ? expected : output || "" };
}

async function updateTest(id, testId, patch = {}) {
  const ids = await listTestIds(id);
  if (!ids.includes(testId)) throw new Error("Test case not found.");
  const currentIn = await store.readText(inPath(id, testId), "");
  const currentOut = await store.readText(outPath(id, testId), "");
  const nextIn = patch.input != null ? patch.input : currentIn;
  const nextOut = patch.expected != null ? patch.expected : patch.output != null ? patch.output : currentOut;
  await writeTestFiles(id, testId, nextIn, nextOut);

  const testsMeta = await readTestsMeta(id);
  const entry = testsMeta[testId] || { id: testId, name: `Test ${testId}`, reason: "", generatedBy: "manual", createdAt: nowIso() };
  if (patch.name != null) entry.name = String(patch.name);
  if (patch.reason != null) entry.reason = String(patch.reason);
  testsMeta[testId] = entry;
  await writeTestsMeta(id, testsMeta);
  await touch(id);
  return { id: testId, name: entry.name, reason: entry.reason, generatedBy: entry.generatedBy, input: nextIn, expected: nextOut };
}

async function deleteTest(id, testId) {
  await store.removeFile(inPath(id, testId));
  await store.removeFile(outPath(id, testId));
  const testsMeta = await readTestsMeta(id);
  delete testsMeta[testId];
  await writeTestsMeta(id, testsMeta);
  await touch(id);
}

// ---------------------------------------------------------------------------
// History + verdict bookkeeping
// ---------------------------------------------------------------------------

function historyPath(id) {
  return path.join(store.problemDir(id), "history.json");
}

async function listHistory(id) {
  const raw = await store.readJson(historyPath(id), null);
  return raw && Array.isArray(raw.entries) ? raw.entries : [];
}

async function recordRun(id, entry) {
  const at = nowIso();
  const meta = await readMeta(id);

  // Lightweight index kept in meta.json (used for list/lastVerdict/quick timeline).
  const record = {
    at,
    type: entry.type || "run",
    verdict: entry.verdict || null,
    timeMs: Math.round(entry.timeMs || 0),
    passed: entry.passed != null ? entry.passed : null,
    total: entry.total != null ? entry.total : null,
    error: entry.error || null
  };
  meta.history.unshift(record);
  if (meta.history.length > LIMITS.historyLimit) meta.history = meta.history.slice(0, LIMITS.historyLimit);
  if (entry.verdict) meta.lastVerdict = entry.verdict;
  meta.updatedAt = at;
  await writeMeta(id, meta);

  // Detailed snapshot (code + outputs) kept in history.json for the timeline view.
  if (entry.snapshot) {
    const entries = await listHistory(id);
    entries.unshift({
      ...record,
      code: typeof entry.snapshot.code === "string" ? entry.snapshot.code : "",
      stdout: typeof entry.snapshot.stdout === "string" ? entry.snapshot.stdout : "",
      stderr: typeof entry.snapshot.stderr === "string" ? entry.snapshot.stderr : ""
    });
    const capped = entries.slice(0, LIMITS.historyLimit);
    await store.writeJson(historyPath(id), { entries: capped });
  }

  return record;
}

module.exports = {
  defaultMeta,
  readMeta,
  writeMeta,
  listProblems,
  problemExists,
  createProblem,
  updateProblem,
  deleteProblem,
  duplicateProblem,
  getFile,
  setFile,
  touch,
  listTests,
  addTest,
  updateTest,
  deleteTest,
  recordRun,
  listHistory
};
