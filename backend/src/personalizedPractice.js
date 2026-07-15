"use strict";

// personalizedPractice.js — pure recommendation policy for the "Bài phù hợp"
// action.  The route owns I/O and AI calls; this module owns the evidence-based
// decision so it stays deterministic and directly testable.

const DEFAULT_WINDOW = 8;
const MIN_WINDOW = 5;
const MAX_WINDOW = 10;
const MIN_RATING = 800;
const MAX_RATING = 1950;

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

function clampWindow(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, MIN_WINDOW, MAX_WINDOW) : DEFAULT_WINDOW;
}

function normalizeTopic(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function topicKey(value) {
  return normalizeTopic(value).toLocaleLowerCase("vi");
}

function updatedMs(meta) {
  const ms = Date.parse(meta && (meta.updatedAt || meta.createdAt));
  return Number.isFinite(ms) ? ms : 0;
}

function recentProblems(metas, requestedWindow) {
  const limit = clampWindow(requestedWindow);
  return (Array.isArray(metas) ? metas : [])
    .filter((m) => m && m.id)
    .slice()
    .sort((a, b) => updatedMs(b) - updatedMs(a))
    .slice(0, limit);
}

// Primary topics carry most of the evidence; tags help aliases such as
// "graph" + "bfs" reinforce each other without drowning the declared topic.
function rankTopics(metas, requestedWindow) {
  const recent = recentProblems(metas, requestedWindow);
  const scores = new Map();

  function add(raw, points) {
    const label = normalizeTopic(raw);
    const key = topicKey(label);
    if (!key) return;
    const cur = scores.get(key) || { topic: label, score: 0, sightings: 0 };
    cur.score += points;
    cur.sightings += 1;
    // Prefer the latest human-facing spelling for the returned rationale.
    if (!cur.topic) cur.topic = label;
    scores.set(key, cur);
  }

  recent.forEach((meta, index) => {
    const recency = recent.length - index;
    add(meta.topic, recency * 2);
    const seen = new Set();
    for (const tag of Array.isArray(meta.tags) ? meta.tags : []) {
      const key = topicKey(tag);
      if (!key || seen.has(key) || key === topicKey(meta.topic)) continue;
      seen.add(key);
      add(tag, recency * 0.45);
    }
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.sightings - a.sightings || a.topic.localeCompare(b.topic, "vi"))
    .map((entry) => ({ ...entry, score: Number(entry.score.toFixed(2)) }));
}

function cfRatingOf(meta) {
  const rating = Number(meta && meta.analysis && meta.analysis.cfRating);
  return Number.isFinite(rating) && rating > 0 ? rating : 0;
}

function median(values) {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

function ratingBand(playerRating, metas, requestedWindow) {
  const recent = recentProblems(metas, requestedWindow);
  const observed = median(recent.map(cfRatingOf));
  const supplied = Number(playerRating);
  const base = Number.isFinite(supplied) && supplied > 0 ? supplied : (observed || 1000);
  const solved = recent.filter((m) => m.status === "solved" || m.lastVerdict === "AC").length;
  const solveRate = recent.length ? solved / recent.length : 0;
  // A stable recent run earns a small step up; a rough run stays centered on
  // the player's Elo. The adjustment is deliberately smaller than the band.
  const step = solveRate >= 0.7 ? 50 : solveRate <= 0.3 ? -50 : 0;
  const targetRating = Math.round(clamp(base + step, MIN_RATING, 1900) / 50) * 50;
  return {
    playerRating: Math.round(base),
    observedRecentRating: observed || null,
    solveRate: Number(solveRate.toFixed(2)),
    targetRating,
    minRating: clamp(targetRating - 100, MIN_RATING, MAX_RATING),
    maxRating: clamp(targetRating + 150, MIN_RATING, MAX_RATING)
  };
}

function buildRecommendation({ metas, playerRating, recentWindow } = {}) {
  const window = clampWindow(recentWindow);
  const recent = recentProblems(metas, window);
  const topics = rankTopics(recent, window);
  const band = ratingBand(playerRating, recent, window);
  return {
    recentWindow: window,
    recent,
    topic: topics[0] ? topics[0].topic : "implementation",
    topicEvidence: topics.slice(0, 4),
    ...band
  };
}

function difficultyFromRating(rating) {
  const r = Number(rating) || 0;
  if (r < 1100) return "easy";
  if (r < 1500) return "medium";
  return "hard";
}

function buildStatementMd(problem) {
  const p = problem || {};
  const lines = [
    `# ${String(p.title || "Bài luyện cá nhân hóa").trim()}`,
    "",
    String(p.statement || "").trim(),
    "",
    "## Dữ liệu vào",
    "",
    String(p.inputFormat || "").trim(),
    "",
    "## Kết quả ra",
    "",
    String(p.outputFormat || "").trim(),
    "",
    "## Ràng buộc",
    "",
    ...(Array.isArray(p.constraints) ? p.constraints.map((c) => `- ${String(c).trim()}`) : [])
  ];
  const samples = Array.isArray(p.samples) ? p.samples : [];
  samples.forEach((sample, index) => {
    lines.push(
      "",
      `## Ví dụ ${index + 1}`,
      "",
      "Input:",
      "```",
      String(sample.input || "").replace(/\s+$/, ""),
      "```",
      "",
      "Output:",
      "```",
      String(sample.expected || "").replace(/\s+$/, ""),
      "```"
    );
    if (sample.explanation) lines.push("", String(sample.explanation).trim());
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function collectTests(problem) {
  const p = problem || {};
  const seen = new Set();
  const tests = [];
  function add(test, fallbackName) {
    if (!test || typeof test.input !== "string") return;
    const key = test.input.replace(/\r\n/g, "\n").trimEnd();
    if (seen.has(key)) return;
    seen.add(key);
    tests.push({
      name: String(test.name || fallbackName || `test-${tests.length + 1}`),
      input: test.input,
      expected: typeof test.expected === "string" ? test.expected : "",
      reason: String(test.reason || test.explanation || "")
    });
  }
  (Array.isArray(p.samples) ? p.samples : []).forEach((s, i) => add(s, `sample-${i + 1}`));
  (Array.isArray(p.verifiedTests) ? p.verifiedTests : []).forEach((t, i) => add(t, `test-${i + 1}`));
  return tests;
}

module.exports = {
  DEFAULT_WINDOW,
  MIN_WINDOW,
  MAX_WINDOW,
  clampWindow,
  recentProblems,
  rankTopics,
  ratingBand,
  buildRecommendation,
  difficultyFromRating,
  buildStatementMd,
  collectTests
};
