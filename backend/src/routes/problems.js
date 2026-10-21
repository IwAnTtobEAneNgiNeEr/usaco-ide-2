"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const express = require("express");
const config = require("../config");
const problemStore = require("../problemStore");
const fileStore = require("../fileStore");
const settingsStore = require("../settingsStore");
const ratingStore = require("../arena/ratingStore");
const ai = require("../ai");
const verifyTests = require("../verifyTests");
const { PROVENANCE, statementHash } = require("../trustLayer");
const personalizedPractice = require("../personalizedPractice");
const smartContent = require("../smartContent");
const { recordProblemEvent } = require("../recorder");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();
const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");

// GET /api/problems/search - deterministic metadata search with inspectable matches.
router.get("/search", asyncHandler(async (req, res) => {
  const problems = await problemStore.listProblems();
  const filters = {
    q: req.query.q, track: req.query.track, concept: req.query.concept,
    provider: req.query.provider, collection: req.query.collection, status: req.query.status,
    minRating: req.query.minRating, maxRating: req.query.maxRating,
  };
  res.json({ results: smartContent.searchProblems(problems, filters), filters });
}));

// POST /api/problems/personalized — create ONE fresh normal problem from the
// student's 5-10 most recently worked problems and current Arena Elo. This is
// deliberately a literal route before /:id so "personalized" can never be
// mistaken for a problem id.
router.post("/personalized", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const recentWindow = personalizedPractice.clampWindow(body.recentWindow);
  const summaries = await problemStore.listProblems();
  const recentMetas = await Promise.all(
    summaries.slice(0, recentWindow).map((summary) => problemStore.readMeta(summary.id))
  );
  if (!recentMetas.length) {
    return res.status(400).json({
      ok: false,
      code: "INSUFFICIENT_HISTORY",
      error: "Cần ít nhất một bài đã làm để tạo bài liên quan."
    });
  }

  const ratingState = await ratingStore.load(RATING_FILE);
  const recommendation = personalizedPractice.buildRecommendation({
    metas: recentMetas,
    playerRating: ratingState && ratingState.rating,
    recentWindow
  });

  const aiSettings = await settingsStore.getAiSettings();
  if (!aiSettings.apiKey) {
    return res.status(400).json({ ok: false, code: "NO_KEY", error: ai.NO_KEY_MESSAGE });
  }

  // The anti-clone context is bounded and never includes code/answers.
  const recentContext = [];
  for (const meta of recommendation.recent) {
    let statementExcerpt = "";
    try {
      statementExcerpt = String(await problemStore.getFile(meta.id, "statement"))
        .replace(/\s+/g, " ")
        .slice(0, 420);
    } catch { /* a missing statement is valid evidence too */ }
    recentContext.push({
      id: meta.id,
      title: meta.title,
      tags: [meta.topic, ...(Array.isArray(meta.tags) ? meta.tags : [])].filter(Boolean),
      rating: meta.analysis && Number(meta.analysis.cfRating) || 0,
      summary: meta.analysis && (meta.analysis.tomTat || meta.analysis.problemSummary) || "",
      statementExcerpt
    });
  }

  let generated;
  try {
    generated = await ai.generatePersonalizedProblem({
      settings: aiSettings,
      topic: recommendation.topic,
      recentProblems: recentContext,
      targetRating: recommendation.targetRating,
      minRating: recommendation.minRating,
      maxRating: recommendation.maxRating
    });
  } catch (error) {
    const status = error.code === "NO_KEY" ? 400 : 502;
    return res.status(status).json({ ok: false, code: error.code || "GENERATION_FAILED", error: error.message });
  }

  const p = generated.problem;
  const statement = personalizedPractice.buildStatementMd(p);
  let tests = personalizedPractice.collectTests(p).map((test) => ({
    ...test,
    expectedKnown: Boolean(test.expected && test.expected.trim()),
    generatedBy: "ai",
    provenance: PROVENANCE.GENERATED_SELF_CHECK,
    statementHash: statementHash(statement)
  }));

  const judgeSettings = await settingsStore.getSettings();
  let verificationNote = "";
  try {
    const verification = await verifyTests.verifyWithReference({
      aiSettings,
      judgeSettings,
      statement,
      code: p.solutionSketchPrivate || "",
      tests,
      samples: (Array.isArray(p.samples) ? p.samples : []).map((sample) => ({
        input: sample.input,
        output: sample.expected
      }))
    });
    tests = verification.tests;
    verificationNote = verification.note || "";
  } catch (error) {
    verificationNote = "Chưa kiểm chứng lại được test: " + error.message;
  }

  const first = tests[0] || { input: "", expected: "" };
  const meta = await problemStore.createProblem({
    title: p.title,
    origin: "ai-generated",
    source: "Bài cá nhân hóa",
    topic: generated.topic || recommendation.topic,
    difficulty: personalizedPractice.difficultyFromRating(p.rating),
    status: "learning",
    tags: Array.isArray(p.tags) ? p.tags : [],
    statement,
    input: first.input,
    expected: first.expected,
    notes: [
      `# ${p.title}`,
      "",
      `Bài được tạo từ ${recommendation.recent.length} bài gần nhất để luyện tiếp chủ đề **${recommendation.topic}** ở mốc khoảng **${p.rating} Elo**.`,
      verificationNote ? `\n${verificationNote}` : ""
    ].join("\n"),
    analysis: {
      cfRating: Number(p.rating) || recommendation.targetRating,
      personalization: {
        recentWindow: recommendation.recent.length,
        recentProblemIds: recommendation.recent.map((item) => item.id),
        topicEvidence: recommendation.topicEvidence,
        playerRating: recommendation.playerRating,
        targetRating: recommendation.targetRating,
        createdAt: new Date().toISOString()
      }
    },
    tests: tests.map((test) => ({
      ...test,
      generatedBy: "ai",
      provenance: test.provenance || PROVENANCE.GENERATED_SELF_CHECK,
      statementHash: test.statementHash || statementHash(statement)
    }))
  });

  res.status(201).json({
    ok: true,
    problem: meta,
    rationale: {
      topic: recommendation.topic,
      topicEvidence: recommendation.topicEvidence,
      recentWindow: recommendation.recent.length,
      recentProblemIds: recommendation.recent.map((item) => item.id),
      playerRating: recommendation.playerRating,
      targetRating: recommendation.targetRating,
      generatedRating: Number(p.rating) || recommendation.targetRating
    },
    verificationNote,
    warnings: generated.warnings || []
  });
}));

// POST /api/problems/:id/event — the ONLY recorder event types a client may
// report directly (README-AUTOPILOT.md M6). "verdict"/"run" stay server-only
// (routes/judge.js already has trustworthy context for those); a client could
// otherwise fabricate a verdict history, which the honesty rules (README-
// LOOPS.md §1.2) forbid. open-statement/timer are moments only the frontend
// can observe at all, so there's no server-side alternative for them.
const CLIENT_EVENT_TYPES = new Set(["open-statement", "timer"]);

router.post("/:id/event", requireProblem, asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!CLIENT_EVENT_TYPES.has(body.type)) {
    return res.status(400).json({ ok: false, error: `Event type không được phép từ client: ${body.type}` });
  }
  recordProblemEvent(req.problemId, body.type, body.data || {}); // fire-and-forget, matches judge.js's usage
  res.json({ ok: true });
}));

// GET /api/problems
router.get("/", asyncHandler(async (req, res) => {
  res.json({ problems: await problemStore.listProblems() });
}));

// POST /api/problems
router.post("/", asyncHandler(async (req, res) => {
  const meta = await problemStore.createProblem(req.body || {});
  res.status(201).json({ problem: meta });
}));

// GET /api/problems/:id
router.get("/:id", requireProblem, asyncHandler(async (req, res) => {
  const problem = await problemStore.readMeta(req.problemId), truth = await require("../judgeState").contract(req.problemId);
  res.json({ problem: { ...problem, truth }, truth });
}));

// PUT /api/problems/:id
router.put("/:id", requireProblem, asyncHandler(async (req, res) => {
  res.json({ problem: await problemStore.updateProblem(req.problemId, req.body || {}) });
}));

// DELETE /api/problems/:id
router.delete("/:id", requireProblem, asyncHandler(async (req, res) => {
  await problemStore.deleteProblem(req.problemId);
  res.json({ ok: true });
}));

// POST /api/problems/:id/duplicate
router.post("/:id/duplicate", requireProblem, asyncHandler(async (req, res) => {
  res.status(201).json({ problem: await problemStore.duplicateProblem(req.problemId) });
}));

// POST /api/problems/:id/open-in-editor — launch VS Code on the problem folder.
// The file-per-problem layout means power users can edit in their real editor
// while still using this app's judge/AI. Override the command with USACO_EDITOR.
router.post("/:id/open-in-editor", requireProblem, asyncHandler(async (req, res) => {
  const dir = fileStore.problemDir(req.problemId);
  const editor = process.env.USACO_EDITOR || "code";

  // Resolve the editor on PATH first — on Windows `shell:true` launches cmd.exe
  // (which always exists), so a missing `code` would never surface as a spawn
  // error. `where`/`which` gives a reliable up-front answer.
  const probe = process.platform === "win32" ? "where" : "which";
  let available = false;
  try { available = spawnSync(probe, [editor], { stdio: "ignore", timeout: 4000 }).status === 0; } catch { available = false; }
  if (!available) {
    return res.status(400).json({
      ok: false,
      error: "Không tìm thấy VS Code. Cài VS Code rồi bật lệnh 'code' trong PATH (Command Palette → \"Shell Command: Install 'code' command in PATH\")."
    });
  }

  try {
    const child = spawn(editor, [dir], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
    child.unref();
  } catch (error) {
    return res.status(400).json({ ok: false, error: "Không mở được editor: " + error.message });
  }
  res.json({ ok: true, dir });
}));

module.exports = router;
