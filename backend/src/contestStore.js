"use strict";

// contestStore.js — persistence for the AI Contest Generator. A contest is its
// OWN domain, living in workspace/contests/<contestId>/, and is NEVER mixed into
// the problems list. The on-disk layout mirrors a problem folder so the same
// judge primitives work, but the code here is self-contained: it does not touch
// problemStore or the existing problems flow.
//
//   workspace/contests/<contestId>/
//     meta.json
//     problems/
//       01/  meta.json statement.md main.cpp input.txt expected.txt history.json tests/{NN.in,NN.out,meta.json}
//       02/  ...

const path = require("path");
const { CONTESTS_DIR, DEFAULT_TEMPLATE, LIMITS } = require("./config");
const store = require("./fileStore");

const PROBLEM_FILES = Object.freeze({
  code: "main.cpp",
  input: "input.txt",
  expected: "expected.txt",
  statement: "statement.md"
});

function nowIso() {
  return new Date().toISOString();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Id safety + path helpers
// ---------------------------------------------------------------------------

// Contest ids are slugs (same rules as problem ids). Problem ids inside a
// contest are zero-padded numbers we generate ourselves (01..07).
function isSafeContestId(id) {
  return store.isSafeId(id);
}
function isSafeProblemId(pid) {
  return typeof pid === "string" && /^[0-9]{2,3}$/.test(pid);
}

function contestDir(contestId) {
  return path.join(CONTESTS_DIR, contestId);
}
function problemsRoot(contestId) {
  return path.join(contestDir(contestId), "problems");
}
function problemDir(contestId, pid) {
  return path.join(problemsRoot(contestId), pid);
}

async function contestExists(contestId) {
  return isSafeContestId(contestId) && store.pathExists(contestDir(contestId));
}
async function problemExists(contestId, pid) {
  return isSafeProblemId(pid) && store.pathExists(problemDir(contestId, pid));
}

async function uniqueContestId(baseSlug) {
  let candidate = baseSlug;
  let counter = 2;
  while (await store.pathExists(contestDir(candidate))) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Contest meta
// ---------------------------------------------------------------------------

function defaultContestMeta(id, overrides = {}) {
  const ts = nowIso();
  return {
    id,
    title: overrides.title || id,
    topic: overrides.topic || "",
    source: overrides.source || "AI Contest",
    status: overrides.status || "not_started", // not_started | in_progress | completed
    targetRatingStart: Number(overrides.targetRatingStart) || 0,
    targetRatingEnd: Number(overrides.targetRatingEnd) || 0,
    problemCount: Number(overrides.problemCount) || 0,
    basedOnProblemIds: Array.isArray(overrides.basedOnProblemIds) ? overrides.basedOnProblemIds : [],
    createdAt: overrides.createdAt || ts,
    updatedAt: overrides.updatedAt || ts,
    aiModel: overrides.aiModel || "",
    generationNotes: Array.isArray(overrides.generationNotes) ? overrides.generationNotes : []
  };
}

function contestMetaPath(contestId) {
  return path.join(contestDir(contestId), "meta.json");
}

async function readContestMeta(contestId) {
  const raw = await store.readJson(contestMetaPath(contestId), null);
  if (!raw) return defaultContestMeta(contestId);
  return defaultContestMeta(contestId, raw);
}

async function writeContestMeta(contestId, meta) {
  await store.writeJson(contestMetaPath(contestId), meta);
  return meta;
}

// ---------------------------------------------------------------------------
// Contest problem meta
// ---------------------------------------------------------------------------

function defaultProblemMeta(contestId, pid, overrides = {}) {
  const ts = nowIso();
  return {
    id: pid,
    contestId,
    title: overrides.title || pid,
    topic: overrides.topic || "",
    rating: Number(overrides.rating) || 0,
    difficultyIndex: Number(overrides.difficultyIndex) || 0,
    status: overrides.status || "learning", // learning | review | solved
    lastVerdict: overrides.lastVerdict || null,
    tags: Array.isArray(overrides.tags) ? overrides.tags : [],
    uniquenessNote: overrides.uniquenessNote || "",
    // Kept on disk for test verification / debugging — NEVER returned to the UI.
    solutionSketchPrivate: overrides.solutionSketchPrivate || "",
    history: Array.isArray(overrides.history) ? overrides.history : [],
    createdAt: overrides.createdAt || ts,
    updatedAt: overrides.updatedAt || ts
  };
}

function problemMetaPath(contestId, pid) {
  return path.join(problemDir(contestId, pid), "meta.json");
}

async function readProblemMeta(contestId, pid) {
  const raw = await store.readJson(problemMetaPath(contestId, pid), null);
  if (!raw) return defaultProblemMeta(contestId, pid);
  return defaultProblemMeta(contestId, pid, raw);
}

async function writeProblemMeta(contestId, pid, meta) {
  await store.writeJson(problemMetaPath(contestId, pid), meta);
  return meta;
}

// Strip the private solution sketch before anything reaches the browser.
function toClientProblem(meta) {
  const { solutionSketchPrivate, ...safe } = meta;
  return { ...safe, hasSolutionSketch: Boolean(solutionSketchPrivate) };
}

const PROBLEM_PATCHABLE = ["title", "status", "lastVerdict"];

async function updateProblemMeta(contestId, pid, patch = {}) {
  const meta = await readProblemMeta(contestId, pid);
  for (const key of PROBLEM_PATCHABLE) {
    if (key in patch) meta[key] = patch[key];
  }
  meta.updatedAt = nowIso();
  await writeProblemMeta(contestId, pid, meta);
  return meta;
}

async function listProblemIds(contestId) {
  const ids = await store.listSubdirs(problemsRoot(contestId));
  ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ids;
}

// ---------------------------------------------------------------------------
// Per-problem single files (code / input / expected / statement)
// ---------------------------------------------------------------------------

async function getProblemFile(contestId, pid, kind) {
  const name = PROBLEM_FILES[kind];
  if (!name) throw new Error(`Unknown contest file kind: ${kind}`);
  const fallback = kind === "code" ? DEFAULT_TEMPLATE : "";
  return store.readText(path.join(problemDir(contestId, pid), name), fallback);
}

async function setProblemFile(contestId, pid, kind, content) {
  const name = PROBLEM_FILES[kind];
  if (!name) throw new Error(`Unknown contest file kind: ${kind}`);
  await store.writeText(path.join(problemDir(contestId, pid), name), content);
  await touchProblem(contestId, pid);
  return true;
}

async function touchProblem(contestId, pid) {
  const meta = await readProblemMeta(contestId, pid);
  meta.updatedAt = nowIso();
  await writeProblemMeta(contestId, pid, meta);
}

// ---------------------------------------------------------------------------
// Test cases  (tests/NN.in + tests/NN.out + tests/meta.json) — same convention
// as a problem folder, reimplemented locally so problemStore stays untouched.
// ---------------------------------------------------------------------------

function testsDir(contestId, pid) {
  return path.join(problemDir(contestId, pid), "tests");
}
function inPath(contestId, pid, testId) {
  return path.join(testsDir(contestId, pid), `${testId}.in`);
}
function outPath(contestId, pid, testId) {
  return path.join(testsDir(contestId, pid), `${testId}.out`);
}

async function listTestIds(contestId, pid) {
  const files = await store.listFiles(testsDir(contestId, pid));
  const ids = files.filter((n) => n.endsWith(".in")).map((n) => n.slice(0, -3));
  ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ids;
}

function testsMetaPath(contestId, pid) {
  return path.join(testsDir(contestId, pid), "meta.json");
}

async function readTestsMeta(contestId, pid) {
  const raw = await store.readJson(testsMetaPath(contestId, pid), null);
  const map = {};
  if (raw && Array.isArray(raw.tests)) {
    for (const t of raw.tests) if (t && t.id) map[t.id] = t;
  }
  return map;
}

async function writeTestsMeta(contestId, pid, map) {
  const tests = Object.keys(map)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((tid) => map[tid]);
  await store.writeJson(testsMetaPath(contestId, pid), { tests });
}

async function listTests(contestId, pid) {
  const testsMeta = await readTestsMeta(contestId, pid);
  const ids = await listTestIds(contestId, pid);
  const tests = [];
  for (const testId of ids) {
    const entry = testsMeta[testId] || {};
    tests.push({
      id: testId,
      name: entry.name || `Test ${testId}`,
      reason: entry.reason || "",
      generatedBy: entry.generatedBy || "manual",
      input: await store.readText(inPath(contestId, pid, testId), ""),
      expected: await store.readText(outPath(contestId, pid, testId), "")
    });
  }
  return tests;
}

async function nextTestId(contestId, pid) {
  const ids = await listTestIds(contestId, pid);
  let max = 0;
  for (const tid of ids) {
    const n = parseInt(tid, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return pad(max + 1);
}

async function addTest(contestId, pid, { input = "", expected = "", output, name, reason, generatedBy } = {}) {
  const ids = await listTestIds(contestId, pid);
  if (ids.length >= LIMITS.maxTests) {
    throw new Error(`Maximum of ${LIMITS.maxTests} test cases reached.`);
  }
  const testId = await nextTestId(contestId, pid);
  const exp = expected != null ? expected : output;
  await store.writeText(inPath(contestId, pid, testId), input != null ? input : "");
  await store.writeText(outPath(contestId, pid, testId), exp != null ? exp : "");

  const testsMeta = await readTestsMeta(contestId, pid);
  testsMeta[testId] = {
    id: testId,
    name: name ? String(name) : `Test ${testId}`,
    reason: reason ? String(reason) : "",
    generatedBy: generatedBy === "ai" ? "ai" : "manual",
    createdAt: nowIso()
  };
  await writeTestsMeta(contestId, pid, testsMeta);
  await touchProblem(contestId, pid);
  return { id: testId, ...testsMeta[testId], input, expected: exp != null ? exp : "" };
}

async function updateTest(contestId, pid, testId, patch = {}) {
  const ids = await listTestIds(contestId, pid);
  if (!ids.includes(testId)) throw new Error("Test case not found.");
  const currentIn = await store.readText(inPath(contestId, pid, testId), "");
  const currentOut = await store.readText(outPath(contestId, pid, testId), "");
  const nextIn = patch.input != null ? patch.input : currentIn;
  const nextOut = patch.expected != null ? patch.expected : (patch.output != null ? patch.output : currentOut);
  await store.writeText(inPath(contestId, pid, testId), nextIn);
  await store.writeText(outPath(contestId, pid, testId), nextOut);

  const testsMeta = await readTestsMeta(contestId, pid);
  const entry = testsMeta[testId] || { id: testId, name: `Test ${testId}`, reason: "", generatedBy: "manual", createdAt: nowIso() };
  if (patch.name != null) entry.name = String(patch.name);
  if (patch.reason != null) entry.reason = String(patch.reason);
  testsMeta[testId] = entry;
  await writeTestsMeta(contestId, pid, testsMeta);
  await touchProblem(contestId, pid);
  return { id: testId, name: entry.name, reason: entry.reason, generatedBy: entry.generatedBy, input: nextIn, expected: nextOut };
}

async function deleteTest(contestId, pid, testId) {
  await store.removeFile(inPath(contestId, pid, testId));
  await store.removeFile(outPath(contestId, pid, testId));
  const testsMeta = await readTestsMeta(contestId, pid);
  delete testsMeta[testId];
  await writeTestsMeta(contestId, pid, testsMeta);
  await touchProblem(contestId, pid);
}

// ---------------------------------------------------------------------------
// History + verdict bookkeeping (mirrors problemStore.recordRun)
// ---------------------------------------------------------------------------

function historyPath(contestId, pid) {
  return path.join(problemDir(contestId, pid), "history.json");
}

async function listHistory(contestId, pid) {
  const raw = await store.readJson(historyPath(contestId, pid), null);
  return raw && Array.isArray(raw.entries) ? raw.entries : [];
}

async function recordRun(contestId, pid, entry) {
  const at = nowIso();
  const meta = await readProblemMeta(contestId, pid);

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
  if (entry.verdict === "AC") meta.status = "solved";
  meta.updatedAt = at;
  await writeProblemMeta(contestId, pid, meta);

  if (entry.snapshot) {
    const entries = await listHistory(contestId, pid);
    entries.unshift({
      ...record,
      code: typeof entry.snapshot.code === "string" ? entry.snapshot.code : "",
      stdout: typeof entry.snapshot.stdout === "string" ? entry.snapshot.stdout : "",
      stderr: typeof entry.snapshot.stderr === "string" ? entry.snapshot.stderr : ""
    });
    await store.writeJson(historyPath(contestId, pid), { entries: entries.slice(0, LIMITS.historyLimit) });
  }

  // Keep the contest's roll-up status fresh after every run.
  await refreshContestStatus(contestId);
  return record;
}

// Recompute contest progress/status from its problem metas.
async function contestProgress(contestId) {
  const ids = await listProblemIds(contestId);
  let solved = 0;
  let attempted = 0;
  for (const pid of ids) {
    const m = await readProblemMeta(contestId, pid);
    if (m.status === "solved" || m.lastVerdict === "AC") solved += 1;
    if ((m.history && m.history.length) || m.lastVerdict) attempted += 1;
  }
  const total = ids.length;
  let status = "not_started";
  if (total > 0 && solved === total) status = "completed";
  else if (attempted > 0) status = "in_progress";
  return { total, solved, attempted, status };
}

async function refreshContestStatus(contestId) {
  const meta = await readContestMeta(contestId);
  const { status } = await contestProgress(contestId);
  meta.status = status;
  meta.updatedAt = nowIso();
  await writeContestMeta(contestId, meta);
  return meta;
}

// ---------------------------------------------------------------------------
// Listing + reading whole contests for the UI
// ---------------------------------------------------------------------------

function contestSummary(meta, progress) {
  return {
    id: meta.id,
    title: meta.title,
    topic: meta.topic,
    source: meta.source,
    status: meta.status,
    targetRatingStart: meta.targetRatingStart,
    targetRatingEnd: meta.targetRatingEnd,
    problemCount: progress.total || meta.problemCount,
    solvedCount: progress.solved,
    aiModel: meta.aiModel,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt
  };
}

async function listContests() {
  const ids = await store.listSubdirs(CONTESTS_DIR);
  const out = [];
  for (const id of ids) {
    const meta = await readContestMeta(id);
    const progress = await contestProgress(id);
    out.push(contestSummary(meta, progress));
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getContest(contestId) {
  const meta = await readContestMeta(contestId);
  const ids = await listProblemIds(contestId);
  const problems = [];
  for (const pid of ids) {
    const pm = await readProblemMeta(contestId, pid);
    const testCount = (await listTestIds(contestId, pid)).length;
    problems.push({ ...toClientProblem(pm), testCount });
  }
  const progress = await contestProgress(contestId);
  return { contest: { ...contestSummary(meta, progress), basedOnProblemIds: meta.basedOnProblemIds, generationNotes: meta.generationNotes }, problems };
}

async function deleteContest(contestId) {
  await store.removeDir(contestDir(contestId));
}

// ---------------------------------------------------------------------------
// Creation from a VALIDATED AI payload
// ---------------------------------------------------------------------------

// Assemble a clean Markdown statement from the structured AI fields so the
// reader UI (and sample extraction) see one coherent document.
function buildStatementMd(p) {
  const lines = [`# ${p.title || "Problem"}`, "", (p.statement || "").trim(), ""];
  if (p.inputFormat && p.inputFormat.trim()) lines.push("## Input", "", p.inputFormat.trim(), "");
  if (p.outputFormat && p.outputFormat.trim()) lines.push("## Output", "", p.outputFormat.trim(), "");
  if (Array.isArray(p.constraints) && p.constraints.length) {
    lines.push("## Constraints", "", ...p.constraints.map((c) => `- ${String(c).trim()}`), "");
  } else if (typeof p.constraints === "string" && p.constraints.trim()) {
    lines.push("## Constraints", "", p.constraints.trim(), "");
  }
  const samples = Array.isArray(p.samples) ? p.samples : [];
  samples.forEach((s, i) => {
    lines.push(`## Sample ${i + 1}`, "", "Input:", "```", String(s.input == null ? "" : s.input).replace(/\s+$/, ""), "```", "");
    if (s.expected != null) lines.push("Output:", "```", String(s.expected).replace(/\s+$/, ""), "```", "");
    if (s.explanation && String(s.explanation).trim()) lines.push("", String(s.explanation).trim(), "");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// `generated` is the normalized + validated object from ai.generateContest:
// { title, topic, difficultyPlan, problems:[{ title, rating, tags, uniquenessNote,
//   statement, inputFormat, outputFormat, constraints, solutionSketchPrivate,
//   samples:[{input,expected,explanation}], verifiedTests:[{name,input,expected,reason}] }],
//   warnings:[] }
async function createContest({ topic, minRating, maxRating, basedOnProblemIds, aiModel, generated }) {
  const problems = Array.isArray(generated.problems) ? generated.problems : [];
  const baseSlug = store.slugify((generated.title || `${topic}-contest`) + "");
  const id = await uniqueContestId(baseSlug || "contest");

  const ratings = problems.map((p) => Number(p.rating) || 0).filter(Boolean);
  const meta = defaultContestMeta(id, {
    title: generated.title || `${topic} Contest`,
    topic: topic || generated.topic || "",
    status: "not_started",
    targetRatingStart: ratings.length ? Math.min(...ratings) : (Number(minRating) || 0),
    targetRatingEnd: ratings.length ? Math.max(...ratings) : (Number(maxRating) || 0),
    problemCount: problems.length,
    basedOnProblemIds: Array.isArray(basedOnProblemIds) ? basedOnProblemIds : [],
    aiModel: aiModel || "",
    generationNotes: [
      ...(generated.difficultyPlan ? [String(generated.difficultyPlan)] : []),
      ...(Array.isArray(generated.warnings) ? generated.warnings.map(String) : [])
    ]
  });

  await store.ensureDir(problemsRoot(id));
  await writeContestMeta(id, meta);

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const pid = pad(i + 1);
    const dir = problemDir(id, pid);
    await store.ensureDir(path.join(dir, "tests"));

    await store.writeText(path.join(dir, PROBLEM_FILES.code), DEFAULT_TEMPLATE);
    await store.writeText(path.join(dir, PROBLEM_FILES.statement), buildStatementMd(p));

    // Scratch input/expected: seed from the first verified test (or first sample).
    const seed = (p.verifiedTests && p.verifiedTests[0]) || (p.samples && p.samples[0]) || { input: "", expected: "" };
    await store.writeText(path.join(dir, PROBLEM_FILES.input), seed.input != null ? seed.input : "");
    await store.writeText(path.join(dir, PROBLEM_FILES.expected), seed.expected != null ? seed.expected : "");

    const pm = defaultProblemMeta(id, pid, {
      title: p.title || `Problem ${pid}`,
      topic: topic || generated.topic || "",
      rating: Number(p.rating) || 0,
      difficultyIndex: i + 1,
      status: "learning",
      tags: Array.isArray(p.tags) ? p.tags : [],
      uniquenessNote: p.uniquenessNote || "",
      solutionSketchPrivate: p.solutionSketchPrivate || ""
    });
    await writeProblemMeta(id, pid, pm);

    // Persist only verified (expectedKnown) tests — the judge needs an expected
    // output, so input-only tests are dropped and surfaced as a contest warning.
    const verified = Array.isArray(p.verifiedTests) ? p.verifiedTests : [];
    for (const t of verified) {
      await addTest(id, pid, {
        input: t.input, expected: t.expected, name: t.name, reason: t.reason, generatedBy: "ai"
      });
    }
  }

  return getContest(id);
}

module.exports = {
  isSafeContestId,
  isSafeProblemId,
  contestExists,
  problemExists,
  listContests,
  getContest,
  createContest,
  deleteContest,
  readContestMeta,
  refreshContestStatus,
  // problem-level
  readProblemMeta,
  updateProblemMeta,
  toClientProblem,
  listProblemIds,
  getProblemFile,
  setProblemFile,
  listTests,
  addTest,
  updateTest,
  deleteTest,
  listHistory,
  recordRun
};
