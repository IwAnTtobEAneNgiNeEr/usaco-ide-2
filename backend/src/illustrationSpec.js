"use strict";

const ALLOWED_TYPES = new Set(["sequence", "grid", "node", "edge", "arrow", "label", "range", "pointer", "clock", "timeline", "stack", "queue", "tree", "path", "region"]);
const ALLOWED_COLORS = new Set(["cyan", "amber", "green", "red", "purple", "muted", "ink"]);
const LIMITS = { elements: 40, nodes: 20, edges: 40, values: 16, text: 40, steps: 8 };

const SYSTEM_PROMPT = `You create precise, non-spoiler HTML5 Canvas scene specifications for competitive-programming statements.
Return one JSON object only, never Markdown, HTML, SVG, CSS, or JavaScript. Prefer purposeful animation: clock/timeline/grid/maze/path/permutation scenes must set static=false and steps between 3 and 8.
Personalize the scene to the exact statement nouns and mechanics. A robot path problem must look like a robot moving on a grid toward a goal. A digital clock problem must show concrete HH:MM:SS states and rollover. Do not fall back to generic cards, generic arrays, or generic graphs when the statement implies a stronger visual metaphor.
Schema: {version:1, visualType:string, title:string, caption:string, static:boolean, elements:[...]}. Allowed element types: ${[...ALLOWED_TYPES].join(", ")}.
Coordinates x,y,x2,y2,width,height are normalized 0..1. Allowed colors: ${[...ALLOWED_COLORS].join(", ")}.
Use tiny truthful examples (3-6 values). Never invent official input/output. Never reveal a complete solution.
For grid/maze/path scenes, include a grid element with rows/cols and optional cells mask, plus a path element with points:[{r,c}, ...] describing the animated route. For clock/timeline scenes, include a sequence or clock values array with concrete time states.
Permutation uses sequence states, clock uses clock/timeline rollover, maze uses grid/path. Never choose a tree merely because the topic says backtracking.
If no accurate visual is possible return {"version":1,"visualType":"none","reason":"...","elements":[]}.`;

function cleanText(v, max = LIMITS.text) { return String(v == null ? "" : v).replace(/[<>]/g, "").trim().slice(0, max); }
function coord(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined; }

function validateScene(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Canvas scene must be an object.");
  const elements = Array.isArray(input.elements) ? input.elements : [];
  if (elements.length > LIMITS.elements) throw new Error("Canvas scene has too many elements.");
  let nodes = 0, edges = 0;
  const out = [];
  for (const raw of elements) {
    if (!raw || !ALLOWED_TYPES.has(raw.type)) throw new Error(`Unsupported Canvas primitive: ${raw && raw.type}`);
    if (raw.type === "node") nodes++;
    if (["edge", "arrow"].includes(raw.type)) edges++;
    if (nodes > LIMITS.nodes || edges > LIMITS.edges) throw new Error("Canvas graph exceeds limits.");
    const el = { type: raw.type };
    for (const key of ["id", "from", "to"]) if (raw[key] != null) el[key] = cleanText(raw[key], 32);
    for (const key of ["label", "text"]) if (raw[key] != null) el[key] = cleanText(raw[key]);
    for (const key of ["x", "y", "x2", "y2", "width", "height"]) { const n = coord(raw[key]); if (n !== undefined) el[key] = n; }
    if (raw.color != null) el.color = ALLOWED_COLORS.has(raw.color) ? raw.color : "cyan";
    if (Array.isArray(raw.values)) el.values = raw.values.slice(0, LIMITS.values).map((v) => cleanText(v, 12));
    if (Array.isArray(raw.highlight)) el.highlight = raw.highlight.slice(0, LIMITS.values).map(Number).filter(Number.isFinite);
    if (Array.isArray(raw.cells)) el.cells = raw.cells.slice(0, 256).map((v) => Number(v) ? 1 : 0);
    if (Array.isArray(raw.points)) {
      el.points = raw.points.slice(0, 32).map((p) => ({
        r: Math.max(0, Math.min(31, Number(p && p.r) || 0)),
        c: Math.max(0, Math.min(31, Number(p && p.c) || 0))
      }));
    }
    if (raw.rows != null) el.rows = Math.max(1, Math.min(16, Number(raw.rows) || 1));
    if (raw.cols != null) el.cols = Math.max(1, Math.min(16, Number(raw.cols) || 1));
    out.push(el);
  }
  const visualType = cleanText(input.visualType || "none", 32);
  const animated = /^(clock|timeline|grid|grid maze|maze|path|permutation)$/i.test(visualType);
  return {
    version: 1,
    visualType,
    title: cleanText(input.title, 64),
    caption: cleanText(input.caption, 120),
    static: animated ? false : input.static !== false,
    steps: animated ? Math.max(3, Math.min(LIMITS.steps, Number(input.steps) || 6)) : Math.max(0, Math.min(LIMITS.steps, Number(input.steps) || 0)),
    elements: out
  };
}

function parseScene(text) {
  const raw = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return validateScene(JSON.parse(raw));
}

function usefulness(payload) {
  const text = [payload.title, payload.topic, payload.statementText].filter(Boolean).join(" ").toLowerCase();
  if (/\b(add two|sum of two|hello world|a\s*\+\s*b)\b|cộng hai số|tổng hai số/u.test(text)) return false;
  return /(graph|tree|maze|grid|path|permutation|combination|stack|queue|binary search|dynamic programming|geometry|clock|timeline|simulation|đồ thị|cây|mê cung|lưới|hoán vị|tổ hợp|ngăn xếp|hàng đợi|đồng hồ)/u.test(text);
}

module.exports = { ALLOWED_TYPES, ALLOWED_COLORS, LIMITS, SYSTEM_PROMPT, validateScene, parseScene, usefulness };
