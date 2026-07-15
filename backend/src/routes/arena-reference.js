"use strict";

// routes/arena-reference.js — Kho Tham Chiếu (S1) HTTP surface: inspect/edit
// the per-problem reference/generator/validator vault, and trigger the
// post-AC Gauntlet. Mounted under /api/problems (same convention as
// routes/autopsy.js, routes/lab.js).

const path = require("path");
const express = require("express");
const config = require("../config");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const runCpp = require("../runCpp");
const ai = require("../ai");
const referenceStore = require("../arena/referenceStore");
const gauntlet = require("../arena/gauntlet");
const bossCaseStore = require("../arena/bossCaseStore");
const { statementHash, PROVENANCE } = require("../trustLayer");
const { recordProblemEvent } = require("../recorder");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();
const BOSS_FILE = path.join(config.DATA_DIR, "arena-boss-cases.json");

// GET /api/problems/:id/reference — vault status, trust evaluated against the CURRENT statement.
router.get("/:id/reference", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const statement = await problemStore.getFile(id, "statement");
  const meta = await referenceStore.readMeta(id);
  const trust = referenceStore.evaluateTrust(meta, statementHash(statement));
  res.json({ ok: true, vault: meta, trust });
}));

// PUT /api/problems/:id/reference  { code } — manual save; recomputes trust.
router.put("/:id/reference", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const code = String((req.body || {}).code || "");
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiếu code tham chiếu." });
  const statement = await problemStore.getFile(id, "statement");
  const judgeSettings = await settingsStore.getSettings();
  const check = await referenceStore.verifyCodeAgainstSamples(code, judgeSettings, ai.extractSamples(statement));
  if (check.compilerMissing) return res.status(400).json({ ok: false, error: "g++ chưa sẵn sàng." });
  if (!check.compiled) return res.status(400).json({ ok: false, error: "Code tham chiếu không biên dịch được.", stderr: check.stderr });
  const vault = await referenceStore.setReference(id, code, {
    source: "manual", trusted: check.trusted, samplesChecked: check.samplesChecked, statementHash: statementHash(statement),
  });
  res.json({ ok: true, vault, trusted: check.trusted, samplesChecked: check.samplesChecked });
}));

router.delete("/:id/reference", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, vault: await referenceStore.clearReference(req.problemId) });
}));

// PUT /api/problems/:id/generator  { code } — manual save; must at least compile.
router.put("/:id/generator", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const code = String((req.body || {}).code || "");
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiếu code generator." });
  const judgeSettings = await settingsStore.getSettings();
  const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
  try {
    if (built.compilerMissing) return res.status(400).json({ ok: false, error: "g++ chưa sẵn sàng." });
    if (!built.ok) return res.status(400).json({ ok: false, error: "Generator không biên dịch được.", stderr: built.stderr });
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
  const vault = await referenceStore.setGenerator(id, code, { source: "manual" });
  res.json({ ok: true, vault });
}));

router.delete("/:id/generator", requireProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, vault: await referenceStore.clearGenerator(req.problemId) });
}));

// PUT /api/problems/:id/validator  { code } — S12 asset, lives in the same vault folder.
router.put("/:id/validator", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const code = String((req.body || {}).code || "");
  if (!code.trim()) return res.status(400).json({ ok: false, error: "Thiếu code validator." });
  const judgeSettings = await settingsStore.getSettings();
  const built = await runCpp.compileStandalone({ code, settings: judgeSettings });
  try {
    if (built.compilerMissing) return res.status(400).json({ ok: false, error: "g++ chưa sẵn sàng." });
    if (!built.ok) return res.status(400).json({ ok: false, error: "Validator không biên dịch được.", stderr: built.stderr });
  } finally {
    await runCpp.cleanupWorkdir(built.workdir);
  }
  const vault = await referenceStore.setValidator(id, code, { source: "manual" });
  res.json({ ok: true, vault });
}));

// Shared by the plain-JSON route and the SSE stream route below: runs the
// Gauntlet, and on a BROKEN result persists both side effects every caller
// needs (test-suite add + "Đối Thủ v1" boss-case bookkeeping) exactly once.
// Never throws — every persistence step is best-effort, same discipline as
// the rest of this file (a bookkeeping failure must never cost the student
// their actual Gauntlet result).
async function runGauntletAndPersist({ id, aiSettings, judgeSettings, statement, code, samples, maxSeeds, budgetMs, onProgress }) {
  const result = await gauntlet.runPostAcGauntlet({
    id, aiSettings, judgeSettings, statement, code, samples, maxSeeds, budgetMs, onProgress,
  });
  if (!result.ok) return result;

  if (result.survived) {
    recordProblemEvent(id, "gauntlet", { result: "survived", ran: result.ran });
    return result;
  }

  let addedTest = null;
  try {
    addedTest = await problemStore.addTest(id, {
      name: `gauntlet-${result.seed}`,
      input: result.minimalInput,
      expected: result.expectedOutput,
      reason: "Phản ví dụ từ Đấu Trường (Gauntlet) sau AC",
      generatedBy: "ai",
      provenance: PROVENANCE.VERIFIED_REFERENCE,
      statementHash: statementHash(statement),
    });
  } catch { /* still report the find even if persisting the test failed */ }

  // "Đối Thủ v1" — the SAME minimal input recurring across separate attempts
  // on this problem earns it a name (arena/bossCase.js: promoted at count>=2).
  let boss = null;
  try {
    const recorded = await bossCaseStore.recordFailure(BOSS_FILE, id, {
      minimalInput: result.minimalInput, kind: result.kind, expected: result.expectedOutput, got: result.studentOutput,
    });
    boss = { count: recorded.entry.count, promoted: recorded.entry.promoted, justPromoted: recorded.justPromoted, name: recorded.entry.name };
  } catch { /* boss-case bookkeeping is best-effort — never costs the student their Gauntlet result */ }

  recordProblemEvent(id, "gauntlet", { result: "broken", seed: result.seed, ran: result.ran, toBytes: result.shrink ? result.shrink.toBytes : null });
  return { ...result, addedTest, boss };
}

async function gauntletInputs(id, body) {
  const aiSettings = await settingsStore.getAiSettings();
  if (!aiSettings.apiKey) return { error: { status: 400, body: { ok: false, error: ai.NO_KEY_MESSAGE, code: "NO_KEY" } } };
  const judgeSettings = await settingsStore.getSettings();
  const statement = await problemStore.getFile(id, "statement");
  const code = typeof body.code === "string" ? body.code : await problemStore.getFile(id, "code");
  const samples = ai.extractSamples(statement);
  return { aiSettings, judgeSettings, statement, code, samples };
}

// POST /api/problems/:id/gauntlet  { seeds?, budgetMs? }
// The post-AC Gauntlet: vault-first reference+generator, hunt for a
// disagreement, shrink it if found, auto-add it to the test suite (provenance
// verified-by-reference — reusing the existing trustLayer label, never a new
// one) under the SAME per-problem write lock every other test-add uses.
router.post("/:id/gauntlet", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const body = req.body || {};
  const inputs = await gauntletInputs(id, body);
  if (inputs.error) return res.status(inputs.error.status).json(inputs.error.body);

  const result = await runGauntletAndPersist({ id, ...inputs, maxSeeds: body.seeds, budgetMs: body.budgetMs });

  if (!result.ok) return res.status(200).json({ ok: false, reason: result.reason, note: result.note });
  if (result.survived) return res.json({ ok: true, survived: true, ran: result.ran, budgetHit: Boolean(result.budgetHit), referenceInfo: result.referenceInfo });
  res.json({
    ok: true, survived: false, seed: result.seed, ran: result.ran, phase: result.phase,
    minimalInput: result.minimalInput, expectedOutput: result.expectedOutput, studentOutput: result.studentOutput,
    shrink: result.shrink, addedTest: result.addedTest, boss: result.boss, referenceInfo: result.referenceInfo,
  });
}));

// POST /api/problems/:id/gauntlet/reject  { testId?, fault }
// Escape hatch for an ILLEGITIMATE AI attack. The Gauntlet's generator and
// reference are AI-written; matching a few official samples doesn't prove the
// generator respects every constraint, nor that the reference is correct on
// generated inputs. A student who inspects a counterexample and judges it bogus
// (fault "input" = generated input violates the statement's constraints;
// "reference" = the reference's expected answer is itself wrong) can reject it.
// That removes the phantom failing test, returns the Gauntlet verdict to neutral
// so the seal isn't held back and the "nợ WA" debt clears, and drops the
// offending vault asset so the NEXT Gauntlet regenerates it instead of re-using
// a broken oracle forever. Never a way to fake an AC — the student's real test
// suite and history are untouched; this only undoes an unverifiable AI verdict.
const REJECT_FAULTS = new Set(["input", "reference"]);
router.post("/:id/gauntlet/reject", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const body = req.body || {};
  const fault = REJECT_FAULTS.has(String(body.fault)) ? String(body.fault) : "input";
  const cleared = [];

  if (body.testId) {
    try { await problemStore.deleteTest(id, String(body.testId)); cleared.push("test"); } catch { /* test already gone — fine */ }
  }
  try { await referenceStore.recordGauntletRun(id, { result: null }); cleared.push("verdict"); } catch { /* best-effort */ }
  if (fault === "reference") {
    try { await referenceStore.clearReference(id); cleared.push("reference"); } catch { /* best-effort */ }
  } else {
    try { await referenceStore.clearGenerator(id); cleared.push("generator"); } catch { /* best-effort */ }
  }
  recordProblemEvent(id, "gauntlet-rejected", { fault, testId: body.testId || null });
  res.json({ ok: true, fault, cleared });
}));

// POST /api/problems/:id/gauntlet/stream  { seeds?, budgetMs? }
// Same Gauntlet as above, but as SSE so the "Sealed Gauntlet" reveal can show
// REAL progress as it happens — phase-start/progress frames come straight
// from the actual seed search (arena/gauntlet.js's onProgress), never a fake
// animation. Mirrors routes/moment.js's stage/done SSE convention.
router.post("/:id/gauntlet/stream", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const body = req.body || {};
  const inputs = await gauntletInputs(id, body);
  if (inputs.error) return res.status(inputs.error.status).json(inputs.error.body);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const sse = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ } };

  sse({ stage: "start" });
  let lastPhase = null;
  const onProgress = (evt) => {
    if (evt.phase !== lastPhase) {
      lastPhase = evt.phase;
      sse({ stage: "phase-start", phase: evt.phase });
    }
    sse({ stage: "progress", seed: evt.seed, maxSeeds: evt.maxSeeds, phase: evt.phase, outcome: evt.outcome });
  };

  const result = await runGauntletAndPersist({ id, ...inputs, maxSeeds: body.seeds, budgetMs: body.budgetMs, onProgress });

  if (!result.ok) { sse({ done: true, ok: false, reason: result.reason, note: result.note }); return res.end(); }
  if (result.survived) {
    sse({ done: true, ok: true, survived: true, ran: result.ran, budgetHit: Boolean(result.budgetHit), referenceInfo: result.referenceInfo });
    return res.end();
  }
  sse({
    done: true, ok: true, survived: false, seed: result.seed, ran: result.ran, phase: result.phase,
    minimalInput: result.minimalInput, expectedOutput: result.expectedOutput, studentOutput: result.studentOutput,
    shrink: result.shrink, addedTest: result.addedTest, boss: result.boss, referenceInfo: result.referenceInfo,
  });
  res.end();
}));

module.exports = router;
