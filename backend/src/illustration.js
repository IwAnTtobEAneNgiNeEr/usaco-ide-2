"use strict";

const crypto = require("crypto");

const VISUAL_PATTERNS = [
  ["maze", /\b(maze|labyrinth)\b|me cung/iu],
  ["grid", /\b(grid|matrix board|cellular board)\b|luoi o|bang o/iu],
  ["graph", /\b(graph|vertex|vertices|edge|traversal|connected component)\b|do thi|dinh|canh/iu],
  ["tree", /\b(tree|rooted tree|binary tree|subtree|lowest common ancestor)\b|cay goc|cay nhi phan/iu],
  ["geometry", /\b(geometry|geometric|polygon|triangle|circle|angle|coordinate plane)\b|hinh hoc|da giac|tam giac|duong tron/iu],
  ["pathfinding", /\b(pathfinding|shortest path|route through|navigate)\b|duong di ngan nhat|tim duong/iu],
  ["dp", /\b(dp table|dynamic programming table|state transition table)\b|bang quy hoach dong/iu],
  ["heap", /\b(heap|priority queue tree|heapify)\b/iu],
  ["clock", /\b(clock|digital clock|analog clock|timer|stopwatch|countdown|calendar|schedule|timeline|time line|state machine)\b|dong ho|đồng hồ|hen gio|hẹn giờ|dem nguoc|đếm ngược|lich|lịch|moc thoi gian|mốc thời gian|trang thai|trạng thái/iu],
  ["simulation", /\b(simulation|simulate movement|moving pieces|constructive diagram)\b|mo phong chuyen dong|mô phỏng chuyển động/iu]
];

const TRIVIAL = /\b(a\s*\+\s*b|add two|sum of two|basic sorting|sort an array|array scan|input.?output formatting|hello world|simple implementation)\b|tong hai so|cong hai so/iu;
const STYLE_SUFFIX = "Premium editorial educational illustration, clean geometric composition, dark slate IDE-friendly background, restrained cyan and amber highlights, no flowchart, no boxes, no arrows, no labels, no paragraphs, no random letters, no garbled text, no anime, no mascot, no fantasy art, no clutter, no real people, no copyrighted artist style, no solution spoilers.";
const TYPE_PROMPTS = {
  maze: "Minimal diagram of a binary maze grid, start and target cells highlighted, legal route arrows and blocked cells clearly distinguished.",
  grid: "Minimal grid or matrix diagram with the relevant cells, regions, directions, and adjacency highlighted.",
  graph: "Clean graph theory diagram with nodes and edges, highlighting only the relationship or traversal structure described.",
  tree: "Clean rooted tree diagram with clear parent-child hierarchy and the relevant path or subtree highlighted.",
  geometry: "Clean geometric construction with points, lines, angles, coordinates, and the relevant relation highlighted.",
  pathfinding: "Minimal pathfinding diagram with start, target, obstacles, legal moves, and one illustrative route highlighted.",
  dp: "Minimal dynamic-programming table with a few transition cells and dependency arrows highlighted.",
  heap: "Minimal heap tree structure showing parent-child ordering and the relevant operation without excessive labels.",
  simulation: "Minimal state-transition diagram showing the important objects, movement, and successive states.",
  clock: "A polished close-up illustration of one modern digital alarm clock on a dark desk, luminous seven-segment display, subtle visual suggestion of seconds progressing through light and motion, precise industrial product-design aesthetic. Do not create a state diagram or flowchart."
};

function difficultyValue(value) {
  const match = String(value || "").match(/\d+/);
  const n = Number(match && match[0]);
  return Number.isFinite(n) ? n : 0;
}

function scrubContext(value) {
  return String(value || "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email removed]")
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, "[phone removed]")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/\b(?:in the style of|by artist|drawn by)\s+[^.,;\n]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function visualTypeFor(context) {
  for (const [type, pattern] of VISUAL_PATTERNS) if (pattern.test(context)) return type;
  return "";
}

function assess(payload, settings) {
  if (!settings.illustrationEnabled) return { shouldGenerate: false, reason: "Illustration generation is disabled.", warnings: [] };
  if (!["pollinations", "cloudflare"].includes(settings.illustrationProvider)) return { shouldGenerate: false, reason: "No illustration provider is configured.", warnings: [] };

  const context = [payload.topic, payload.title, payload.statementText].filter(Boolean).join("\n");
  const forced = Boolean(settings.illustrationForce);
  const visualType = visualTypeFor(context) || (forced ? "simulation" : "");
  const difficulty = difficultyValue(payload.difficulty);
  const minimum = difficultyValue(settings.illustrationMinDifficulty);
  const difficultyGateApplies = minimum && visualType && !["clock", "simulation"].includes(visualType);
  if (difficultyGateApplies && (!difficulty || difficulty < minimum)) {
    return { shouldGenerate: false, reason: "Problem difficulty is below the configured illustration threshold.", warnings: [] };
  }

  const existingDiagram = Number(payload.pastedImagesCount) > 0 && context.length > 80;
  if (!forced && (!visualType || (TRIVIAL.test(context) && !existingDiagram))) {
    return { shouldGenerate: false, reason: "Problem is too simple / visual aid not useful.", warnings: [] };
  }

  // Raw clock statements contain many HH:MM:SS values. Image models interpret
  // those as labels and produce the garbled flowchart seen in the UI, so keep
  // the clock art-directed and text-free. Other visual types still benefit
  // from a small amount of sanitized problem context.
  const detail = visualType === "clock" ? "" : scrubContext(payload.statementText);
  const prompt = `${TYPE_PROMPTS[visualType]} ${detail ? `Problem context: ${detail}. ` : ""}${STYLE_SUFFIX}`.slice(0, 1000);
  return { shouldGenerate: true, reason: "A visual diagram can clarify the problem structure.", provider: settings.illustrationProvider, visualType, prompt, warnings: [] };
}

function cacheKey(payload, provider = "pollinations") {
  const statementHash = crypto.createHash("sha256").update(String(payload.statementText || "").trim()).digest("hex");
  const identity = [payload.problemId || "anonymous", statementHash, String(payload.topic || "").trim().toLowerCase(), provider, String(payload.variation || "")].join("\0");
  return { key: crypto.createHash("sha256").update(identity).digest("hex"), statementHash };
}

function pollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(String(prompt || "").slice(0, 1000));
  // Pollinations validates `seed` as a number. Cache identities are hex hashes,
  // so passing them through directly produces HTTP 400 (NaN). Fold any stable
  // seed value into an unsigned 32-bit integer instead.
  const maxSeedRange = 2147483648; // provider accepts signed 32-bit positive values
  const rawSeed = Number.isSafeInteger(Number(seed))
    ? Math.abs(Number(seed))
    : parseInt(crypto.createHash("sha256").update(String(seed || "0")).digest("hex").slice(0, 8), 16);
  const numericSeed = rawSeed % maxSeedRange;
  return `https://gen.pollinations.ai/image/${encoded}?model=flux&seed=${numericSeed}&width=1200&height=675&nologo=true`;
}

module.exports = { assess, cacheKey, pollinationsUrl, scrubContext, visualTypeFor };
