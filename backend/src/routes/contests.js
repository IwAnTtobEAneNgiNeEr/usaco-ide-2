"use strict";

// routes/contests.js — the AI Contest Generator domain. Contests are a separate
// concept from problems: they live in workspace/contests/ and are never mixed
// into the problem list. AI is called ONLY on explicit POST /generate.

const express = require("express");
const contestStore = require("../contestStore");
const problemStore = require("../problemStore");
const settingsStore = require("../settingsStore");
const judgeService = require("../judgeService");
const ai = require("../ai");
const { CONTEST } = require("../config");
const { asyncHandler } = require("./_util");

const router = express.Router();

// Same normalization the frontend topic filter uses: "Binary Search" -> "binarysearch".
function normTopic(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Fallback rating when a solved problem has no AI cfRating estimate.
function difficultyToRating(diff) {
  return { easy: 1000, medium: 1400, hard: 1800 }[diff] || 1200;
}

function problemRating(meta) {
  const cf = meta.analysis && Number(meta.analysis.cfRating);
  return cf && cf > 0 ? cf : difficultyToRating(meta.difficulty);
}

// Solved problems of `topicNorm`, with the metadata needed for level inference
// + anti-clone context. Eligible = status "solved" OR lastVerdict "AC", matching
// the topic on its `topic` field or any tag.
async function gatherEligible(topicNorm) {
  const summaries = await problemStore.listProblems();
  const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
  const eligible = metas.filter((m) => {
    const solved = m.status === "solved" || m.lastVerdict === "AC";
    if (!solved) return false;
    const hay = new Set([m.topic, ...(m.tags || [])].filter(Boolean).map(normTopic));
    return topicNorm ? hay.has(topicNorm) : false;
  });
  return eligible.map((m) => ({
    id: m.id,
    title: m.title,
    rating: problemRating(m),
    tags: m.tags || [],
    summary: (m.analysis && (m.analysis.tomTat || m.analysis.problemSummary)) || ""
  }));
}

function recommendedCount(n) {
  if (n >= 20) return 7;
  if (n >= 12) return 6;
  return CONTEST.minProblems;
}

// ----------------------------------------------------------------------------
// Collection-level routes (literal paths first so /:contestId never shadows them)
// ----------------------------------------------------------------------------

// GET /api/contests
router.get("/", asyncHandler(async (req, res) => {
  res.json({ ok: true, contests: await contestStore.listContests() });
}));

// GET /api/contests/readiness?topic=greedy
router.get("/readiness", asyncHandler(async (req, res) => {
  const topic = String(req.query.topic || "").trim();
  const topicNorm = normTopic(topic);
  if (!topicNorm) {
    return res.json({ ok: true, topic, eligibleCount: 0, ready: false, recommendedProblemCount: CONTEST.minProblems, ratingMin: 800, ratingMax: 1800, problems: [] });
  }
  const eligible = await gatherEligible(topicNorm);
  const ratings = eligible.map((p) => p.rating).filter(Boolean);
  res.json({
    ok: true,
    topic,
    eligibleCount: eligible.length,
    ready: eligible.length >= CONTEST.minEligible,
    minEligible: CONTEST.minEligible,
    recommendedProblemCount: recommendedCount(eligible.length),
    ratingMin: ratings.length ? Math.min(...ratings) : 800,
    ratingMax: ratings.length ? Math.min(Math.max(...ratings), CONTEST.maxRatingCeil) : 1800,
    problems: eligible.map((p) => ({ id: p.id, title: p.title, rating: p.rating, tags: p.tags, summary: p.summary }))
  });
}));

// POST /api/contests/generate  { topic, problemCount, minRating, maxRating, force }
router.post("/generate", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const topic = String(body.topic || "").trim();
  const topicNorm = normTopic(topic);
  if (!topicNorm) return res.status(400).json({ ok: false, error: "Hãy chọn topic cho contest." });

  const eligible = await gatherEligible(topicNorm);
  if (eligible.length < CONTEST.minEligible && body.force !== true) {
    return res.status(400).json({
      ok: false,
      code: "NOT_READY",
      error: `Cần ít nhất ${CONTEST.minEligible} bài đã giải (AC/solved) cùng topic "${topic}". Hiện có ${eligible.length}. Giải thêm rồi quay lại, hoặc bật "tạo dù chưa đủ".`
    });
  }

  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return res.status(400).json({ ok: false, error: ai.NO_KEY_MESSAGE, code: "NO_KEY" });

  const problemCount = Math.min(Math.max(Number(body.problemCount) || recommendedCount(eligible.length), CONTEST.minProblems), CONTEST.maxProblems);
  const ratings = eligible.map((p) => p.rating).filter(Boolean);
  const minRating = Math.max(Number(body.minRating) || (ratings.length ? Math.min(...ratings) : 800), 1);
  const maxRating = Math.min(Number(body.maxRating) || (ratings.length ? Math.max(...ratings) : 1800), CONTEST.maxRatingCeil);

  // Build the anti-clone context: include statement excerpts for the model.
  const context = eligible.slice(0, CONTEST.maxSolvedContext);
  const solvedProblems = [];
  for (const p of context) {
    let excerpt = "";
    try { excerpt = (await problemStore.getFile(p.id, "statement")).slice(0, 400); } catch { /* none */ }
    solvedProblems.push({ title: p.title, tags: p.tags, rating: p.rating, summary: p.summary, statementExcerpt: excerpt });
  }

  let generated;
  try {
    generated = await ai.generateContest({ settings, topic, solvedProblems, problemCount, minRating, maxRating });
  } catch (error) {
    const status = error.code === "NO_KEY" ? 400 : 502;
    return res.status(status).json({ ok: false, error: error.message, code: error.code });
  }

  // Only persist a fully-validated payload — never a half-built contest.
  const { contest, problems } = await contestStore.createContest({
    topic, minRating, maxRating,
    basedOnProblemIds: context.map((p) => p.id),
    aiModel: settings.model,
    generated
  });
  res.status(201).json({ ok: true, contest, problems, warnings: generated.warnings || [] });
}));

// ----------------------------------------------------------------------------
// Single-contest middleware + routes
// ----------------------------------------------------------------------------

const requireContest = asyncHandler(async (req, res, next) => {
  const cid = req.params.contestId;
  if (!contestStore.isSafeContestId(cid)) return res.status(400).json({ error: "Invalid contest id." });
  if (!(await contestStore.contestExists(cid))) return res.status(404).json({ error: "Contest not found." });
  req.contestId = cid;
  next();
});

const requireContestProblem = asyncHandler(async (req, res, next) => {
  const pid = req.params.problemId;
  if (!contestStore.isSafeProblemId(pid)) return res.status(400).json({ error: "Invalid problem id." });
  if (!(await contestStore.problemExists(req.contestId, pid))) return res.status(404).json({ error: "Contest problem not found." });
  req.cproblemId = pid;
  next();
});

// GET /api/contests/:contestId
router.get("/:contestId", requireContest, asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await contestStore.getContest(req.contestId)) });
}));

// DELETE /api/contests/:contestId
router.delete("/:contestId", requireContest, asyncHandler(async (req, res) => {
  await contestStore.deleteContest(req.contestId);
  res.json({ ok: true });
}));

// GET /api/contests/:contestId/problems/:problemId  (solution sketch stripped)
router.get("/:contestId/problems/:problemId", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const meta = await contestStore.readProblemMeta(req.contestId, req.cproblemId);
  res.json({ ok: true, problem: contestStore.toClientProblem(meta) });
}));

// PUT /api/contests/:contestId/problems/:problemId  (title/status only)
router.put("/:contestId/problems/:problemId", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const meta = await contestStore.updateProblemMeta(req.contestId, req.cproblemId, req.body || {});
  res.json({ ok: true, problem: contestStore.toClientProblem(meta) });
}));

// GET/PUT code | input | expected ; GET statement (read-only, AI-authored).
function bindFileKind(kind, readonly) {
  router.get(`/:contestId/problems/:problemId/${kind}`, requireContest, requireContestProblem, asyncHandler(async (req, res) => {
    res.json({ ok: true, [kind]: await contestStore.getProblemFile(req.contestId, req.cproblemId, kind) });
  }));
  if (readonly) return;
  router.put(`/:contestId/problems/:problemId/${kind}`, requireContest, requireContestProblem, asyncHandler(async (req, res) => {
    const content = req.body && typeof req.body[kind] === "string" ? req.body[kind] : "";
    await contestStore.setProblemFile(req.contestId, req.cproblemId, kind, content);
    res.json({ ok: true });
  }));
}
bindFileKind("code");
bindFileKind("input");
bindFileKind("expected");
bindFileKind("statement", true);

// ----- Tests -----
router.get("/:contestId/problems/:problemId/tests", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, tests: await contestStore.listTests(req.contestId, req.cproblemId) });
}));
router.post("/:contestId/problems/:problemId/tests", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const test = await contestStore.addTest(req.contestId, req.cproblemId, req.body || {});
  res.status(201).json({ ok: true, test });
}));
router.put("/:contestId/problems/:problemId/tests/:testId", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const test = await contestStore.updateTest(req.contestId, req.cproblemId, req.params.testId, req.body || {});
  res.json({ ok: true, test });
}));
router.delete("/:contestId/problems/:problemId/tests/:testId", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  await contestStore.deleteTest(req.contestId, req.cproblemId, req.params.testId);
  res.json({ ok: true });
}));

// GET history
router.get("/:contestId/problems/:problemId/history", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  res.json({ ok: true, history: await contestStore.listHistory(req.contestId, req.cproblemId) });
}));

// Persist editor code if sent, then return it.
async function resolveCode(contestId, pid, body) {
  if (body && typeof body.code === "string") {
    await contestStore.setProblemFile(contestId, pid, "code", body.code);
    return body.code;
  }
  return contestStore.getProblemFile(contestId, pid, "code");
}

// True once the client disconnected (Stop button / closed tab) — the judge
// then skips the remaining tests instead of running them for nobody.
function clientGone(res) {
  let gone = false;
  res.on("close", () => { if (!res.writableEnded) gone = true; });
  return () => gone;
}

// POST run — compile + run once against the scratch input/expected.
router.post("/:contestId/problems/:problemId/run", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const cid = req.contestId, pid = req.cproblemId;
  const settings = await settingsStore.getSettings();
  const code = await resolveCode(cid, pid, req.body);
  const input = await contestStore.getProblemFile(cid, pid, "input");
  const expected = await contestStore.getProblemFile(cid, pid, "expected");

  const result = await judgeService.compileAndRun({ code, settings, input, expected });
  await contestStore.recordRun(cid, pid, { type: "run", verdict: result.verdict, timeMs: result.timeMs, snapshot: { code, stdout: result.stdout, stderr: result.stderr } });
  res.json(result);
}));

// POST judge — compile once + run against every test (or one with onlyTestId).
router.post("/:contestId/problems/:problemId/judge", requireContest, requireContestProblem, asyncHandler(async (req, res) => {
  const cid = req.contestId, pid = req.cproblemId;
  const settings = await settingsStore.getSettings();
  const code = await resolveCode(cid, pid, req.body);
  let tests = await contestStore.listTests(cid, pid);

  const single = !!(req.body && req.body.onlyTestId);
  if (single) {
    tests = tests.filter((t) => t.id === req.body.onlyTestId);
    if (tests.length === 0) return res.status(404).json({ error: "Test case not found." });
  }
  if (tests.length === 0) {
    const input = await contestStore.getProblemFile(cid, pid, "input");
    const expected = await contestStore.getProblemFile(cid, pid, "expected");
    if (input.trim() || expected.trim()) tests.push({ id: "main", name: "Scratch (Input/Expected)", input, expected });
  }
  if (tests.length === 0) {
    return res.json({ verdict: "—", compileOk: null, compile: { stderr: "", timeMs: 0 }, results: [], summary: { total: 0, passed: 0, failed: 0, timeMs: 0 }, message: "Chưa có test case nào." });
  }

  const out = await judgeService.compileAndJudge({ code, settings, tests, shouldStop: clientGone(res) });
  if (!single && !out.cancelled) {
    const focus = out.results.find((r) => r.status !== "AC") || out.results[out.results.length - 1];
    await contestStore.recordRun(cid, pid, {
      type: "judge", verdict: out.verdict, timeMs: out.summary.timeMs,
      passed: out.summary.passed, total: out.summary.total,
      snapshot: { code, stdout: focus ? focus.actual : "", stderr: focus ? focus.stderr : "" }
    });
  }
  res.json(out);
}));

module.exports = router;
