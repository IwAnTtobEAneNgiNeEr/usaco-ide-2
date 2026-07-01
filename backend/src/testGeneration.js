"use strict";

const TARGETS = Object.freeze({ minimum: 30, preferred: 40, maximum: 50 });
const normalizedInput = (value) => String(value || "").trim().split(/\s+/).join(" ");

function parseBounds(statement) {
  const text = String(statement || "").replace(/[−–—]/g, "-");
  const match = text.match(/(-?\d[\d,]*)\s*(?:<=|≤)\s*[ab](?:\s*,\s*[ab])?\s*(?:<=|≤)\s*(-?\d[\d,]*)/i);
  return match ? { min: Number(match[1].replace(/,/g, "")), max: Number(match[2].replace(/,/g, "")) } : null;
}

function detectSimpleProblem(statement) {
  const text = String(statement || "");
  const inputTwo = /(?:two|2|hai)\s+(?:integers?|numbers?|số nguyên)/i.test(text) || /\ba\s+(?:and|và)\s+b\b/i.test(text);
  const sum = /(?:print|output|return|tính|in|xuất)[\s\S]{0,60}(?:sum|a\s*\+\s*b|tổng)/i.test(text);
  return inputTwo && sum ? { type: "a-plus-b", bounds: parseBounds(text) } : null;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}

function generateAddition(statement, desired = TARGETS.preferred) {
  const detected = detectSimpleProblem(statement);
  if (!detected) return null;
  const bounds = detected.bounds || { min: -1000000000, max: 1000000000 };
  const min = Number.isSafeInteger(bounds.min) ? bounds.min : -1000000000;
  const max = Number.isSafeInteger(bounds.max) ? bounds.max : 1000000000;
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const candidates = [
    [min, min, "min-boundary"], [max, max, "max-valid-boundary"], [min, max, "corner-valid"], [max, min, "corner-valid"],
    [clamp(0), clamp(0), "zero-case"], [clamp(1), clamp(2), "small-random"], [clamp(-1), clamp(1), "negative-case"],
    [clamp(-2), clamp(-3), "negative-case"], [clamp(max - 1), max, "overflow-risk-boundary"], [min, clamp(min + 1), "min-boundary"]
  ];
  const random = seeded(0x5ac0a2b);
  while (candidates.length < desired * 3) {
    const a = Math.floor(min + random() * (max - min + 1));
    const b = Math.floor(min + random() * (max - min + 1));
    candidates.push([a, b, candidates.length % 3 ? "medium-random" : "large-random"]);
  }
  const seen = new Set(), tests = [];
  for (const [a, b, category] of candidates) {
    const input = `${a} ${b}\n`, key = normalizedInput(input);
    if (seen.has(key)) continue;
    seen.add(key);
    tests.push({ name: `a-plus-b-${tests.length + 1}`, category, input, expected: `${a + b}\n`, expectedOutput: `${a + b}\n`, expectedKnown: true,
      explanation: "Expected output is computed directly by the backend.", constraintsUsed: `${min} <= a,b <= ${max}`, riskNotes: "",
      reason: `[${category}] backend-computed`, warning: "", provenance: "generated-self-consistency-check" });
    if (tests.length >= desired) break;
  }
  return { tests, notes: detected.bounds ? [] : ["A+B bounds were unclear; conservative signed values were used."], deterministicType: detected.type };
}

function deduplicate(tests, existing = new Set()) {
  const kept = [], skipped = [], seen = new Set(existing);
  for (const test of tests || []) {
    const key = normalizedInput(test.input);
    if (!key) { skipped.push({ name: test.name, reason: "empty input" }); continue; }
    if (seen.has(key)) { skipped.push({ name: test.name, reason: "duplicate generated input" }); continue; }
    seen.add(key); kept.push(test);
  }
  return { tests: kept, skipped, seen };
}

function diversitySummary(tests) {
  const categories = [...new Set((tests || []).map((t) => t.category).filter(Boolean))];
  const sizes = new Set((tests || []).map((t) => normalizedInput(t.input).split(" ").length));
  const numeric = (tests || []).flatMap((t) => normalizedInput(t.input).split(" ").map(Number).filter(Number.isFinite));
  const onlyTinyValues = numeric.length > 0 && numeric.every((n) => Math.abs(n) <= 10);
  const score = Math.min(1, categories.length / 5 + (onlyTinyValues ? 0 : 0.25));
  return { score: Number(score.toFixed(2)), categories, distinctInputShapes: sizes.size, onlyTinyValues, lowDiversity: score < 0.5 };
}

module.exports = { TARGETS, normalizedInput, detectSimpleProblem, generateAddition, deduplicate, diversitySummary };
