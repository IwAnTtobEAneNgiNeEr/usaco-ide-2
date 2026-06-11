"use strict";

const crypto = require("crypto");
const express = require("express");
const settingsStore = require("../settingsStore");
const problemStore = require("../problemStore");
const ai = require("../ai");
const markitdown = require("../markitdown");
const ocr = require("../ocr");
const verifyTests = require("../verifyTests");
const { asyncHandler } = require("./_util");

// Drop a now-stale "some tests have no verified output" warning, then re-add it
// only if tests are still unverified after execution-based verification.
function refreshUnverifiedNote(notes, tests) {
  const out = (notes || []).filter((n) => !String(n).includes("để trống đáp án"));
  if ((tests || []).some((t) => !t.expectedKnown)) {
    out.unshift("⚠ Một số test vẫn chưa có đáp án kiểm chứng — hãy tự kiểm tra trước khi áp dụng.");
  }
  return out;
}

const router = express.Router();

// GET /api/ai/capabilities — what document/OCR features are available
router.get("/capabilities", asyncHandler(async (req, res) => {
  res.json({
    imageOcr: await ocr.isAvailable(),        // images via LOCAL Tesseract (no AI)
    documents: await markitdown.isAvailable() // PDF/DOCX via MarkItDown
  });
}));

function noKey(res) {
  return res.status(400).json({ error: ai.NO_KEY_MESSAGE, code: "NO_KEY" });
}

// POST /api/ai/test-connection
router.post("/test-connection", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  try {
    const result = await ai.testConnection(settings);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/generate-tests  { problemId, statement?, code? }
// Pulls statement/code/metadata from the problem folder when not supplied.
router.post("/generate-tests", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);

  const body = req.body || {};
  const problemId = body.problemId;
  let statement = body.statement;
  let code = body.code;
  let meta = null;

  if (problemId && problemStore && (await problemStore.problemExists(problemId))) {
    meta = await problemStore.readMeta(problemId);
    if (statement == null) statement = await problemStore.getFile(problemId, "statement");
    if (code == null) code = await problemStore.getFile(problemId, "code");
  }

  try {
    const result = await ai.generateTests({ settings, statement, code, meta });
    // Verify expected outputs by EXECUTING an AI reference solution (best-effort).
    try {
      const judgeSettings = await settingsStore.getSettings();
      const v = await verifyTests.verifyWithReference({
        aiSettings: settings, judgeSettings, statement, code, tests: result.tests, samples: ai.extractSamples(statement)
      });
      result.notes = refreshUnverifiedNote(result.notes, result.tests);
      if (v.note) result.notes.unshift(v.note);
    } catch { /* verification is best-effort — never blocks generation */ }
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.code === "NO_KEY" ? 400 : 502;
    res.status(status).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/ocr  { dataUrl, mimeType, fileName }
// Images -> LOCAL Tesseract OCR (no AI). PDFs/docs -> MarkItDown. Returns { markdown }.
// AI is NEVER used to read images anymore — it only ever sees plain text.
router.post("/ocr", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const dataUrl = body.dataUrl || "";
  const mimeType = body.mimeType || (dataUrl.match(/^data:([^;]+);/) || [])[1] || "";
  const isImage = /^image\//.test(mimeType) || /^data:image\//.test(dataUrl);
  const fileName = body.fileName || (isImage ? "image.png" : "document");

  const m = dataUrl.match(/^data:[^;]*;base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: "Expected a base64 data URL." });
  const buffer = Buffer.from(m[1], "base64");

  // After raw extraction we run an AI "OCR cleanup" pass (restore Vietnamese
  // diacritics, fix OCR glitches) so the statement the AI later analyzes is clean.
  // Cleanup is best-effort: no key / failure → the raw text is returned as-is.
  const aiSettings = await settingsStore.getAiSettings();

  if (isImage) {
    ai.log("OCR start", `image → text (local Tesseract, ${fileName})`);
    let raw;
    try {
      raw = await ocr.imageToText(buffer, fileName);
    } catch (error) {
      ai.log("OCR failed", error.message);
      const status = (error.code === "NO_LOCAL_OCR" || error.code === "NO_TESSERACT") ? 400 : 502;
      return res.status(status).json({ ok: false, error: `OCR failed: ${error.message}`, code: error.code || "OCR_FAILED" });
    }
    if (!raw || !raw.trim()) {
      ai.log("OCR failed", "empty text");
      return res.status(502).json({ ok: false, error: "OCR failed: không đọc được chữ nào (ảnh mờ / thiếu sáng / không có text).", code: "OCR_EMPTY" });
    }
    ai.log("OCR success", `${raw.length} chars (tesseract)`);
    const clean = await ai.cleanupOcr({ settings: aiSettings, rawText: raw });
    return res.json({ ok: true, markdown: clean.text, rawMarkdown: raw, cleaned: clean.cleaned, via: "tesseract" });
  }

  // Documents → MarkItDown.
  ai.log("OCR start", `document → markdown (${fileName})`);
  try {
    const markdown = await markitdown.convertBuffer(buffer, fileName);
    if (!markdown || !markdown.trim()) {
      ai.log("OCR failed", "MarkItDown returned empty");
      return res.status(502).json({ ok: false, error: "OCR failed: MarkItDown không trích được nội dung nào từ tài liệu.", code: "OCR_EMPTY" });
    }
    ai.log("OCR success", `${markdown.length} chars (markitdown)`);
    const clean = await ai.cleanupOcr({ settings: aiSettings, rawText: markdown });
    res.json({ ok: true, markdown: clean.text, rawMarkdown: markdown, cleaned: clean.cleaned, via: "markitdown" });
  } catch (error) {
    ai.log("OCR failed", error.message);
    const status = error.code === "NO_MARKITDOWN" ? 400 : 502;
    res.status(status).json({ ok: false, error: `OCR failed: ${error.message}`, code: error.code || "OCR_FAILED" });
  }
}));

// POST /api/ai/analyze  { problemId?, statement? } -> Vietnamese structured analysis
router.post("/analyze", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  let statement = body.statement;
  if (statement == null && body.problemId && (await problemStore.problemExists(body.problemId))) {
    statement = await problemStore.getFile(body.problemId, "statement");
  }
  try {
    const analysis = await ai.analyzeStatement({ settings, statement });
    res.json({ ok: true, analysis });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/template  { problemId?, statement? } -> C++ skeleton template
router.post("/template", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  let statement = body.statement;
  if (statement == null && body.problemId && (await problemStore.problemExists(body.problemId))) {
    statement = await problemStore.getFile(body.problemId, "statement");
  }
  try {
    const code = await ai.generateTemplate({ settings, statement });
    res.json({ ok: true, code });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/process  { problemId?, statement?, code? }
// One-shot pipeline: runs analysis + test generation IN PARALLEL, extracts the
// official samples, persists the analysis to meta, and returns everything for
// the UI to populate. This is what the auto image→statement→tests flow calls.
router.post("/process", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);

  const body = req.body || {};
  const problemId = body.problemId;
  let statement = body.statement;
  let code = body.code;
  let meta = null;

  if (problemId && (await problemStore.problemExists(problemId))) {
    meta = await problemStore.readMeta(problemId);
    if (statement == null) statement = await problemStore.getFile(problemId, "statement");
    if (code == null) code = await problemStore.getFile(problemId, "code");
  }
  if (!statement || !statement.trim()) {
    return res.status(400).json({ ok: false, error: "Statement is empty." });
  }

  // Disk cache (survives restarts, unlike the in-memory LRU): keyed by statement
  // hash so re-processing the same statement costs no tokens / no reference run.
  // Bypassed when the user explicitly asks to regenerate (body.regen).
  const stmtHash = crypto.createHash("sha1").update(statement.trim()).digest("hex");
  if (problemId && !body.regen) {
    try {
      const raw = await problemStore.getFile(problemId, "aicache");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.hash === stmtHash && saved.out) {
          ai.log("Process pipeline cache hit (disk)", problemId);
          return res.json({ ...saved.out, samples: ai.extractSamples(statement), cached: true });
        }
      }
    } catch { /* stale / missing cache — regenerate */ }
  }

  ai.log("Process pipeline start", problemId || "(no id)");
  const samples = ai.extractSamples(statement);

  // Analyze + generate tests concurrently; neither blocks the other.
  const [analysisRes, testsRes] = await Promise.allSettled([
    ai.analyzeStatement({ settings, statement }),
    ai.generateTests({ settings, statement, code, meta })
  ]);

  const out = { ok: true, samples };

  if (analysisRes.status === "fulfilled") {
    out.analysis = analysisRes.value;
    // Persist analysis + auto-fill empty metadata so the explorer reflects it.
    if (problemId && meta) {
      const a = analysisRes.value;
      const patch = { analysis: a };
      if (a.source && !meta.source) patch.source = a.source;
      if (a.difficulty && (!meta.difficulty || meta.difficulty === "unrated")) patch.difficulty = a.difficulty;
      if (a.tags && a.tags.length && (!meta.tags || meta.tags.length === 0)) patch.tags = a.tags;
      if (a.tags && a.tags[0] && !meta.topic) patch.topic = a.tags[0];
      try { await problemStore.updateProblem(problemId, patch); } catch { /* non-fatal */ }
    }
  } else {
    out.analysisError = analysisRes.reason && analysisRes.reason.message;
    ai.log("AI analyze failed", out.analysisError);
  }

  if (testsRes.status === "fulfilled") {
    out.tests = testsRes.value.tests;
    out.notes = testsRes.value.notes;
    // Verify expected outputs by EXECUTING an AI reference solution (best-effort).
    try {
      const judgeSettings = await settingsStore.getSettings();
      const v = await verifyTests.verifyWithReference({
        aiSettings: settings, judgeSettings, statement, code, tests: out.tests, samples
      });
      out.notes = refreshUnverifiedNote(out.notes, out.tests);
      if (v.note) out.notes.unshift(v.note);
      out.verified = { used: v.referenceUsed, trusted: v.referenceTrusted, count: v.verifiedCount };
    } catch { /* verification is best-effort */ }
  } else {
    out.tests = [];
    out.notes = [];
    out.testsError = testsRes.reason && testsRes.reason.message;
    ai.log("Generate tests failed", out.testsError);
  }

  // If BOTH failed, surface it as an error so the UI shows a real reason.
  if (analysisRes.status === "rejected" && testsRes.status === "rejected") {
    const reason = (testsRes.reason && testsRes.reason.message) || (analysisRes.reason && analysisRes.reason.message) || "AI processing failed.";
    const code = (analysisRes.reason && analysisRes.reason.code) === "NO_KEY" ? "NO_KEY" : undefined;
    return res.status(502).json({ ok: false, error: reason, code });
  }

  // Persist to disk cache only when BOTH stages succeeded (never cache a partial failure).
  if (problemId && analysisRes.status === "fulfilled" && testsRes.status === "fulfilled") {
    try { await problemStore.setFile(problemId, "aicache", JSON.stringify({ hash: stmtHash, out, at: new Date().toISOString() })); }
    catch { /* non-fatal */ }
  }

  ai.log("Process pipeline success", `${out.tests.length} tests, analysis=${analysisRes.status === "fulfilled"}`);
  res.json(out);
}));

// POST /api/ai/hint  { problemId?, statement?, code?, level } -> leveled hint
router.post("/hint", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  let statement = body.statement;
  let code = body.code;
  if (body.problemId && (await problemStore.problemExists(body.problemId))) {
    if (statement == null) statement = await problemStore.getFile(body.problemId, "statement");
    if (code == null) code = await problemStore.getFile(body.problemId, "code");
  }
  try {
    const hint = await ai.getHint({ settings, statement, code, level: body.level });
    res.json({ ok: true, hint });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/review-mistakes  { problemId } -> diagnose repeated WA.
// Gathers the statement, current code, and recent WA snapshots, asks the AI to
// explain the mistakes (never to fix the code), and saves the result to mistakes.md.
router.post("/review-mistakes", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const problemId = (req.body || {}).problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }

  const statement = await problemStore.getFile(problemId, "statement");
  let code = (req.body && typeof req.body.code === "string") ? req.body.code : null;
  if (code == null) code = await problemStore.getFile(problemId, "code");

  // Recent wrong-answer snapshots (with their outputs) from the detailed history.
  const history = await problemStore.listHistory(problemId);
  const waHistory = history.filter((h) => h.verdict === "WA" || h.verdict === "RE").slice(0, 5);

  try {
    const review = await ai.reviewMistakes({ settings, statement, code, waHistory });
    await saveMistakes(problemId, review, waHistory.length);
    res.json({ ok: true, review, waCount: waHistory.length });
  } catch (error) {
    const status = error.code === "NO_KEY" ? 400 : 502;
    res.status(status).json({ ok: false, error: error.message });
  }
}));

// Persist (append) a mistake-review section to mistakes.md so the diagnosis is
// kept across sessions and visible on disk.
async function saveMistakes(problemId, review, waCount) {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const bullets = (label, arr) => (arr && arr.length) ? `\n**${label}**\n${arr.map((x) => `- ${x}`).join("\n")}\n` : "";
  const section = [
    `## Phân tích lỗi — ${stamp} (${waCount} lần WA)`,
    review.tongQuan ? `\n${review.tongQuan}\n` : "",
    bullets("Sai tư duy", review.saiTuDuy),
    bullets("Trường hợp còn thiếu", review.truongHopThieu),
    bullets("Edge case cần xử lý", review.edgeCase),
    bullets("Kỹ thuật nên dùng", review.kyThuatNenDung),
    "\n---\n"
  ].join("");
  let prev = "";
  try { prev = await problemStore.getFile(problemId, "mistakes"); } catch { /* none yet */ }
  const header = prev.trim() ? prev.replace(/\s+$/, "") + "\n\n" : "# Mistakes\n\n";
  await problemStore.setFile(problemId, "mistakes", header + section + "\n");
}

// POST /api/ai/review-code  { problemId?, statement?, code } -> structured review
router.post("/review-code", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  let statement = body.statement;
  let code = body.code;
  if (body.problemId && (await problemStore.problemExists(body.problemId))) {
    if (statement == null) statement = await problemStore.getFile(body.problemId, "statement");
    if (code == null) code = await problemStore.getFile(body.problemId, "code");
  }
  try {
    const review = await ai.reviewCode({ settings, statement, code });
    res.json({ ok: true, review });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/explain-error  { code, stderr }
router.post("/explain-error", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  try {
    const explanation = await ai.explainCompileError({ settings, code: body.code, stderr: body.stderr });
    res.json({ ok: true, explanation });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/explain-testcase  { problemId, input, output }
// Dry-run a sample test to explain WHY input maps to output, step by step.
router.post("/explain-testcase", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const statement = await problemStore.getFile(problemId, "statement");
  if (!statement || !statement.trim()) {
    return res.status(400).json({ ok: false, error: "Chưa có đề bài để giải thích." });
  }
  try {
    const explanation = await ai.explainTestCase({
      settings, statement,
      input: body.input || "",
      output: body.output || ""
    });
    res.json({ ok: true, explanation });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/gen-helper  { problemId?, statement?, kind: "generator"|"brute", mainCode? }
// Used by the Stress Tester to auto-write a generator or a brute reference.
router.post("/gen-helper", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  let statement = body.statement;
  let mainCode = body.mainCode;
  if (body.problemId && (await problemStore.problemExists(body.problemId))) {
    if (statement == null) statement = await problemStore.getFile(body.problemId, "statement");
    if (mainCode == null) mainCode = await problemStore.getFile(body.problemId, "code");
  }
  try {
    const code = await ai.generateHelper({ settings, statement, kind: body.kind, mainCode });
    res.json({ ok: true, code });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/synthesize  { problemId, force? }
// Available after a problem is AC. Generates a harder VARIANT of the same problem
// and explains why a stronger technique is needed. Cached to synth.json keyed by
// the statement hash so re-opening never re-spends tokens (pass force:true to redo).
router.post("/synthesize", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const statement = await problemStore.getFile(problemId, "statement");
  if (!statement || !statement.trim()) {
    return res.status(400).json({ ok: false, error: "Chưa có đề bài để tạo biến thể." });
  }
  const code = await problemStore.getFile(problemId, "code");
  const meta = await problemStore.readMeta(problemId);
  const a = meta.analysis || {};
  const technique = (Array.isArray(a.kyThuat) && a.kyThuat.length ? a.kyThuat.join(", ") : "")
    || (Array.isArray(a.tags) ? a.tags.join(", ") : "");

  const hash = crypto.createHash("sha1").update(statement.trim()).digest("hex");
  if (!body.force) {
    try {
      const raw = await problemStore.getFile(problemId, "synth");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.hash === hash && saved.result) {
          return res.json({ ok: true, result: saved.result, cached: true });
        }
      }
    } catch { /* stale / missing cache — regenerate */ }
  }

  try {
    const result = await ai.synthesizeVariant({ settings, statement, technique, code });
    try { await problemStore.setFile(problemId, "synth", JSON.stringify({ hash, result, at: new Date().toISOString() })); } catch { /* non-fatal */ }
    res.json({ ok: true, result, cached: false });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/editorial  { problemId, force? }
// Post-AC "lời giải chuẩn" — only available once a problem has at least one AC
// in its history. The payload is cached on disk keyed by the statement hash so
// re-opening costs zero tokens. Pass force:true to regenerate.
router.post("/editorial", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const meta = await problemStore.readMeta(problemId);
  const hasAc = Array.isArray(meta.history) && meta.history.some((h) => h.verdict === "AC");
  if (!hasAc) {
    return res.status(400).json({ ok: false, error: "Cần giải xong (AC) trước khi xem lời giải chuẩn." });
  }
  const statement = await problemStore.getFile(problemId, "statement");
  if (!statement || !statement.trim()) {
    return res.status(400).json({ ok: false, error: "Chưa có đề bài để viết lời giải." });
  }
  const code = await problemStore.getFile(problemId, "code");

  const hash = crypto.createHash("sha1").update(statement.trim()).digest("hex");
  if (!body.force) {
    try {
      const raw = await problemStore.getFile(problemId, "editorial");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.hash === hash && saved.result) {
          return res.json({ ok: true, result: saved.result, cached: true });
        }
      }
    } catch { /* stale / missing cache — regenerate */ }
  }

  try {
    const result = await ai.generateEditorial({ settings, statement, code, analysis: meta.analysis || null });
    try { await problemStore.setFile(problemId, "editorial", JSON.stringify({ hash, result, at: new Date().toISOString() })); } catch { /* non-fatal */ }
    res.json({ ok: true, result, cached: false });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// GET /api/ai/chat-history?problemId=  -> stored Coach conversation for a problem.
router.get("/chat-history", asyncHandler(async (req, res) => {
  const problemId = req.query.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) return res.json({ ok: true, history: [] });
  let history = [];
  try {
    const raw = await problemStore.getFile(problemId, "chat");
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p.turns)) history = p.turns; }
  } catch { /* none yet */ }
  res.json({ ok: true, history });
}));

// Shared context assembly for the Coach endpoints (/chat and /chat-stream).
// Deep context: recent run snapshots WITH their error logs. stdout/stderr live
// in history.json — the client's lightweight meta.history doesn't carry them —
// so the backend is the source of truth; body.runHistory is a fallback only.
// Logs are truncated here to keep token use small.
async function buildChatContext(problemId, body) {
  const statement = await problemStore.getFile(problemId, "statement");
  const code = body.code != null ? String(body.code) : await problemStore.getFile(problemId, "code");

  let testResult = body.testResult;
  if (testResult == null) {
    const meta = await problemStore.readMeta(problemId);
    const h = (meta.history || [])[0];
    testResult = h ? `${h.verdict || h.type}${h.passed != null ? ` ${h.passed}/${h.total} pass` : ""}` : "(chưa chạy)";
  }

  let runHistory = [];
  try {
    const detailed = await problemStore.listHistory(problemId);
    runHistory = detailed.slice(0, 5).map((h) => ({
      verdict: h.verdict || h.type,
      passed: h.passed,
      total: h.total,
      timeMs: h.timeMs,
      stderr: typeof h.stderr === "string" ? h.stderr.slice(0, 400) : "",
      // Keep the actual output only for failures, where it's diagnostic.
      stdout: (h.verdict && h.verdict !== "AC" && typeof h.stdout === "string") ? h.stdout.slice(0, 300) : "",
      error: h.error || ""
    }));
  } catch { /* no detailed history yet */ }
  if (!runHistory.length && Array.isArray(body.runHistory)) {
    runHistory = body.runHistory.slice(0, 5);
  }

  let turns = [];
  try {
    const raw = await problemStore.getFile(problemId, "chat");
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p.turns)) turns = p.turns; }
  } catch { /* none yet */ }

  return { statement, code, testResult, runHistory, turns };
}

// Append a completed user/assistant turn to the problem's chat.json (re-read so
// a parallel writer can't be clobbered by our stale snapshot). Best-effort.
async function appendChatTurn(problemId, message, reply) {
  let turns = [];
  try {
    const raw = await problemStore.getFile(problemId, "chat");
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p.turns)) turns = p.turns; }
  } catch { /* none yet */ }
  turns.push({ role: "user", content: message, at: new Date().toISOString() });
  turns.push({ role: "assistant", content: reply, at: new Date().toISOString() });
  const capped = turns.slice(-40); // keep on-disk history bounded
  try { await problemStore.setFile(problemId, "chat", JSON.stringify({ turns: capped })); } catch { /* non-fatal */ }
  return capped;
}

// POST /api/ai/chat  { problemId, message, revealAllowed?, code?, testResult?, runHistory? }
// The mini-chat Coach. Loads statement/code/last-verdict + recent run snapshots
// WITH their error logs (deep context), windows the saved history, asks the
// scoped Coach, then appends the turn to chat.json.
router.post("/chat", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const message = String(body.message || "").trim();
  if (!message) return res.status(400).json({ ok: false, error: "Câu hỏi trống." });

  const ctx = await buildChatContext(problemId, body);

  try {
    const reply = await ai.chatProblem({
      settings,
      statement: ctx.statement, code: ctx.code, testResult: ctx.testResult,
      runHistory: ctx.runHistory, history: ctx.turns, message,
      revealAllowed: Boolean(body.revealAllowed)
    });
    const capped = await appendChatTurn(problemId, message, reply);
    res.json({ ok: true, reply, history: capped });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/chat-stream — same body as /chat, but replies as Server-Sent
// Events so the Coach's answer renders incrementally:
//   data: {"delta":"…"}        (repeated)
//   data: {"done":true,"reply":"<full>","history":[…]}
// On failure: data: {"error":"…","code":"…"}. The turn is persisted ONLY when
// the stream completes — an aborted reply never lands in chat.json. /chat stays
// untouched as the buffered fallback for older clients.
router.post("/chat-stream", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  const message = String(body.message || "").trim();
  if (!message) return res.status(400).json({ ok: false, error: "Câu hỏi trống." });

  const ctx = await buildChatContext(problemId, body);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const sse = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ } };

  // Client disconnect (e.g. ⏹ Dừng) aborts the upstream model call immediately.
  const upstreamAbort = new AbortController();
  req.on("close", () => upstreamAbort.abort());

  let deltasSent = 0;
  const chatArgs = {
    settings,
    statement: ctx.statement, code: ctx.code, testResult: ctx.testResult,
    runHistory: ctx.runHistory, history: ctx.turns, message,
    revealAllowed: Boolean(body.revealAllowed)
  };

  try {
    let reply;
    try {
      reply = await ai.chatProblemStream({
        ...chatArgs,
        signal: upstreamAbort.signal,
        onDelta: (d) => { deltasSent++; sse({ delta: d }); }
      });
    } catch (error) {
      // Provider can't stream (or died before the first byte): as long as the
      // client is still here and saw nothing, retry once buffered.
      if (deltasSent > 0 || error.code === "ABORTED" || upstreamAbort.signal.aborted) throw error;
      ai.log("Coach stream fallback", error.message);
      reply = await ai.chatProblem(chatArgs);
      sse({ delta: reply });
    }
    const capped = await appendChatTurn(problemId, message, reply);
    sse({ done: true, reply, history: capped });
  } catch (error) {
    sse({ error: error.message, code: error.code || "" });
  } finally {
    res.end();
  }
}));

// POST /api/ai/chat-clear  { problemId }  -> wipe the saved Coach conversation.
router.post("/chat-clear", asyncHandler(async (req, res) => {
  const problemId = (req.body || {}).problemId;
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Problem not found." });
  }
  try { await problemStore.setFile(problemId, "chat", JSON.stringify({ turns: [] })); } catch { /* non-fatal */ }
  res.json({ ok: true });
}));

// POST /api/ai/auto-fix  { problemId, code?, testResult? }
// Find buggy lines and return JSON diffs the frontend can apply.
router.post("/auto-fix", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = body.problemId;
  let statement = null;
  let code = typeof body.code === "string" ? body.code : null;
  if (problemId && (await problemStore.problemExists(problemId))) {
    statement = await problemStore.getFile(problemId, "statement");
    if (code == null) code = await problemStore.getFile(problemId, "code");
  }
  try {
    const result = await ai.autoFixCode({
      settings, statement, code,
      testResult: body.testResult || ""
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/dry-run  { code, input, targetVariables }
// Simulate C++ execution, tracking variable state through iterations.
router.post("/dry-run", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  try {
    const trace = await ai.dryRunDebugger({
      settings,
      code: body.code || "",
      input: body.input || "",
      targetVariables: body.targetVariables || ""
    });
    res.json({ ok: true, trace });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/detect-key  { apiKey } -> provider / baseUrl / models / suggestion.
// Used by Settings so the user only pastes a key; nothing is persisted here.
router.post("/detect-key", asyncHandler(async (req, res) => {
  const apiKey = (req.body || {}).apiKey;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(400).json({ ok: false, error: "Hãy dán API key trước." });
  }
  const info = await ai.detectKey({ apiKey: String(apiKey).trim() });
  res.json({ ok: true, ...info });
}));

// ---------------------------------------------------------------------------
// 🎓 AC Defense (viva) — the AI interviews the student about their OWN
// accepted code, then grades the answers. Passing stamps meta.defense, which
// the progress engine pays +25 XP for.
// ---------------------------------------------------------------------------

// POST /api/ai/defense-questions  { problemId } -> { questions: [3] }
router.post("/defense-questions", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const problemId = String((req.body || {}).problemId || "").trim();
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Không tìm thấy bài." });
  }
  const meta = await problemStore.readMeta(problemId);
  const hasAc = meta.lastVerdict === "AC" || (meta.history || []).some((h) => h.verdict === "AC");
  if (!hasAc) {
    return res.status(400).json({ ok: false, error: "Bài chưa AC — hãy giải xong rồi mới bảo vệ." });
  }
  const [statement, code] = await Promise.all([
    problemStore.getFile(problemId, "statement"),
    problemStore.getFile(problemId, "code")
  ]);
  try {
    const out = await ai.defenseQuestions({ settings, statement, code });
    res.json({ ok: true, ...out });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// POST /api/ai/defense-grade  { problemId, qa: [{q,a}×3] } -> verdict; pass stamps meta.defense
router.post("/defense-grade", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const body = req.body || {};
  const problemId = String(body.problemId || "").trim();
  const qa = Array.isArray(body.qa) ? body.qa.slice(0, 3) : [];
  if (!problemId || !(await problemStore.problemExists(problemId))) {
    return res.status(404).json({ ok: false, error: "Không tìm thấy bài." });
  }
  if (qa.length < 3 || qa.some((x) => !x || !String(x.a || "").trim())) {
    return res.status(400).json({ ok: false, error: "Hãy trả lời đủ cả 3 câu trước khi nộp." });
  }
  const [statement, code] = await Promise.all([
    problemStore.getFile(problemId, "statement"),
    problemStore.getFile(problemId, "code")
  ]);
  try {
    const result = await ai.defenseGrade({ settings, statement, code, qa });
    if (result.passed) {
      const prev = (await problemStore.readMeta(problemId)).defense;
      await problemStore.updateProblem(problemId, {
        defense: {
          passed: true,
          score: result.score,
          // Keep the FIRST pass date — XP is derived from it, re-defending
          // later must not double-pay "today" XP.
          passedAt: prev && prev.passed && prev.passedAt ? prev.passedAt : new Date().toISOString()
        }
      });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

// ---------------------------------------------------------------------------
// ⚡ Flash quiz — 3 MCQs distilled from the student's own mistakes.md files.
// ---------------------------------------------------------------------------

// POST /api/ai/flash-quiz  {} -> { questions: [{q, choices[4], answerIndex, explain}] }
router.post("/flash-quiz", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getAiSettings();
  if (!settings.apiKey) return noKey(res);
  const path = require("path");
  const fileStore = require("../fileStore");
  const summaries = await problemStore.listProblems(); // updatedAt desc
  const chunks = [];
  for (const s of summaries) {
    if (chunks.length >= 5) break; // newest 5 notebooks are plenty for 3 questions
    const file = path.join(fileStore.problemDir(s.id), "mistakes.md");
    if (!(await fileStore.pathExists(file))) continue;
    const content = await fileStore.readText(file, "");
    if (!content.trim()) continue;
    chunks.push(`## ${s.title}\n${content.trim()}`);
  }
  if (!chunks.length) {
    return res.status(400).json({ ok: false, error: "Sổ tay lỗi sai còn trống — chưa có gì để quiz. Hãy dùng 🧠 Analyze My Mistakes khi bị WA." });
  }
  try {
    const out = await ai.flashQuiz({ settings, notes: chunks.join("\n\n") });
    res.json({ ok: true, ...out });
  } catch (error) {
    res.status(error.code === "NO_KEY" ? 400 : 502).json({ ok: false, error: error.message });
  }
}));

module.exports = router;
