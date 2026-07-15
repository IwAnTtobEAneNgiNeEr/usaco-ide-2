"use strict";

// Deterministic analysis for the two common 1D prefix-sum indexing contracts.
// The route binds this model to stored code/input evidence.

const { sha256 } = require("./verifiedArtifact");

const MAX_VALUES = 10000;
const MAX_QUERIES = 2000;

function unsupported(input, reason, details = []) {
  return {
    supported: false,
    reason,
    details,
    fallback: { kind: "input-visualizer", reason, input: typeof input === "string" ? input : "", visualizer: { kind: "array-and-ranges" } },
    nextAction: { id: "open-visualizer", state: "work", label: "Open array input", reason },
  };
}

function parsePrefixInput(input) {
  const raw = typeof input === "string" ? input : "";
  const values = raw.trim().split(/\s+/).filter(Boolean).map(Number);
  if (!values.length || values.some((value) => !Number.isSafeInteger(value))) return { ok: false, result: unsupported(raw, "input-format: expected integer n, n values, q, then q ranges") };
  const n = values[0];
  if (n < 0 || n > MAX_VALUES) return { ok: false, result: unsupported(raw, `input-size: n must be between 0 and ${MAX_VALUES}`) };
  if (values.length < n + 2) return { ok: false, result: unsupported(raw, "input-shape: missing array values or query count") };
  const array = values.slice(1, n + 1);
  let exactPrefix = 0;
  for (const value of array) {
    exactPrefix += value;
    if (!Number.isSafeInteger(exactPrefix)) return { ok: false, result: unsupported(raw, "prefix-overflow-risk: cumulative sums would not be exact JavaScript integers") };
  }
  const q = values[n + 1];
  if (q < 0 || q > MAX_QUERIES) return { ok: false, result: unsupported(raw, `input-size: q must be between 0 and ${MAX_QUERIES}`) };
  if (values.length !== n + 2 + q * 2) return { ok: false, result: unsupported(raw, "input-shape: token count does not match q ranges") };
  const queries = Array.from({ length: q }, (_, index) => ({
    index,
    left: values[n + 2 + index * 2],
    right: values[n + 3 + index * 2],
  }));
  return { ok: true, raw, n, array, q, queries };
}

function lineOf(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  return index < 0 ? null : index + 1;
}

function recognizeSource(code) {
  const source = String(code || "");
  const lines = source.split(/\r?\n/);
  const zeroConstruction = /(\w+)\s*\[\s*i\s*\+\s*1\s*\]\s*=\s*\1\s*\[\s*i\s*\]\s*\+\s*\w+\s*\[\s*i\s*\]/.test(source);
  const zeroQuery = /(\w+)\s*\[\s*r\s*\+\s*1\s*\]\s*-\s*\1\s*\[\s*l\s*\]/.test(source);
  const oneConstruction = /(\w+)\s*\[\s*i\s*\]\s*=\s*\1\s*\[\s*i\s*-\s*1\s*\]\s*\+\s*\w+\s*\[\s*i\s*\]/.test(source);
  const oneQuery = /(\w+)\s*\[\s*r\s*\]\s*-\s*\1\s*\[\s*l\s*-\s*1\s*\]/.test(source);
  const modes = [];
  if (zeroConstruction && zeroQuery) modes.push(0);
  if (oneConstruction && oneQuery) modes.push(1);
  if (modes.length !== 1) {
    const details = [];
    if (!zeroConstruction && !oneConstruction) details.push("prefix construction");
    if (!zeroQuery && !oneQuery) details.push("range query formula");
    if (modes.length > 1) details.push("ambiguous mixed indexing contracts");
    return { ok: false, reason: "unsupported-code-shape", details };
  }
  const indexBase = modes[0];
  return {
    ok: true,
    indexBase,
    markers: {
      construction: lineOf(lines, indexBase === 0 ? /\[\s*i\s*\+\s*1\s*\]\s*=/ : /\[\s*i\s*\]\s*=\s*\w+\s*\[\s*i\s*-\s*1\s*\]/),
      query: lineOf(lines, indexBase === 0 ? /\[\s*r\s*\+\s*1\s*\]\s*-/ : /\[\s*r\s*\]\s*-\s*\w+\s*\[\s*l\s*-\s*1\s*\]/),
    },
  };
}

function analyze(parsed, recognized) {
  const prefix = [0];
  const construction = [];
  parsed.array.forEach((value, index) => {
    prefix.push(prefix.at(-1) + value);
    construction.push({
      step: index,
      inputIndex: index + recognized.indexBase,
      prefixIndex: index + 1,
      previousPrefix: prefix[index],
      value,
      prefixValue: prefix[index + 1],
    });
  });

  const min = recognized.indexBase;
  const max = parsed.n - 1 + recognized.indexBase;
  const bad = parsed.queries.find((query) => query.left < min || query.right > max || query.left > query.right);
  if (bad) return unsupported(parsed.raw, `query-range: query ${bad.index} is outside ${recognized.indexBase}-based bounds`, [bad]);

  const queries = parsed.queries.map((query) => {
    const leftArrayIndex = query.left - recognized.indexBase;
    const rightArrayIndex = query.right - recognized.indexBase;
    const leftPrefixIndex = leftArrayIndex;
    const rightPrefixIndex = rightArrayIndex + 1;
    const result = prefix[rightPrefixIndex] - prefix[leftPrefixIndex];
    return {
      ...query,
      mapping: { leftArrayIndex, rightArrayIndex, leftPrefixIndex, rightPrefixIndex },
      formula: recognized.indexBase === 0 ? "prefix[r + 1] - prefix[l]" : "prefix[r] - prefix[l - 1]",
      terms: { rightPrefix: prefix[rightPrefixIndex], leftPrefix: prefix[leftPrefixIndex] },
      result,
      directSum: parsed.array.slice(leftArrayIndex, rightArrayIndex + 1).reduce((sum, value) => sum + value, 0),
    };
  });

  let witness = queries.find((query) => parsed.array[query.mapping.leftArrayIndex] !== 0);
  if (!witness) {
    const index = parsed.array.findIndex((value) => value !== 0);
    if (index >= 0) {
      const logical = index + recognized.indexBase;
      const rightPrefixIndex = index + 1;
      witness = {
        left: logical,
        right: logical,
        mapping: { leftArrayIndex: index, rightArrayIndex: index, leftPrefixIndex: index, rightPrefixIndex },
        result: parsed.array[index],
      };
    }
  }
  const offByOneCounterexample = witness ? {
    available: true,
    range: { left: witness.left, right: witness.right },
    correctFormula: recognized.indexBase === 0 ? "prefix[r + 1] - prefix[l]" : "prefix[r] - prefix[l - 1]",
    commonWrongFormula: recognized.indexBase === 0 ? "prefix[r] - prefix[l]" : "prefix[r] - prefix[l]",
    correctResult: witness.result,
    wrongResult: prefix[witness.mapping.rightArrayIndex] - prefix[witness.mapping.leftPrefixIndex],
    evidence: "The wrong formula omits the left/right endpoint value on this stored array.",
  } : {
    available: false,
    reason: "All values in this evidence array are zero, so the common off-by-one formula has no differing output witness.",
  };

  return {
    prefix,
    construction,
    queries,
    indexMapping: {
      inputBase: recognized.indexBase,
      prefixBase: 0,
      rule: recognized.indexBase === 0
        ? "array[i] contributes to prefix[i + 1]; [l,r] maps to prefix[r + 1] - prefix[l]"
        : "array position i contributes to prefix[i]; [l,r] maps to prefix[r] - prefix[l - 1]",
    },
    offByOneCounterexample,
  };
}

function tracePrefixSum({ code, input, verdict } = {}) {
  const parsed = parsePrefixInput(input);
  if (!parsed.ok) return parsed.result;
  const recognized = recognizeSource(code);
  if (!recognized.ok) return unsupported(parsed.raw, recognized.reason, recognized.details);
  const analysis = analyze(parsed, recognized);
  if (analysis.supported === false) return analysis;
  return {
    supported: true,
    model: "recognized-prefix-sum-semantic-v1",
    deterministic: true,
    executionMode: "semantic-model-not-arbitrary-cpp-instrumentation",
    basis: { codeHash: sha256(code), inputHash: sha256(input) },
    sourceLines: recognized.markers,
    array: parsed.array,
    ...analysis,
    fallback: { kind: "input-visualizer", reason: "Uses the exact array and ranges from stored evidence.", input: parsed.raw, visualizer: { kind: "array-and-ranges" } },
    nextAction: verdict && verdict !== "AC"
      ? { id: "return-to-work", state: "work", label: "Compare index mapping", reason: `Analysis is bound to the stored Judge ${verdict} evidence.` }
      : { id: "verify-boundaries", state: "verify", label: "Verify boundary ranges", reason: "Construction and every stored query agree with direct sums." },
  };
}

module.exports = { MAX_VALUES, MAX_QUERIES, parsePrefixInput, recognizeSource, tracePrefixSum };
