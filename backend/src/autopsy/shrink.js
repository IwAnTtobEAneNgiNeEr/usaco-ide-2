"use strict";

// shrink.js — pure counterexample minimizer for WA Autopsy (Loop 1 flagship).
//
// Given a failing judge input and a black-box oracle isInteresting(candidate)
// (composed by the orchestrator as: student output wrong AND reference solution
// ok AND input still valid), this engine searches for a much smaller input that
// keeps the oracle true. It is delta debugging (ddmin) adapted to the shape of
// competitive-programming inputs:
//
//   1. line-chunk removal        — with COUNT REPAIR: CP inputs carry header
//      tokens like "n" / "n m" that must be decremented when items are removed,
//      so every structural candidate is retried with each header integer
//      lowered by the number of removed items ("linked variants").
//   2. token removal within a line — same linked variants (header line + the
//      first token of the edited line, for "n\na1 .. an" formats).
//   3. integer minimization      — per token: try 0, else binary-search the
//      smallest magnitude that stays interesting (BigInt-safe up to 1e18+).
//   4. alpha-token simplification — best effort: truncate strings / flatten to
//      a repeated first character.
//
// Passes repeat to a fixpoint under a hard budget (runs + wall time). Every
// oracle result is cached; adoption is strictly monotone in (byte length,
// lexicographic) so the search can never cycle and always terminates.
//
// The engine is deliberately judge-free, AI-free and fs-free: the oracle is
// the only side effect, which keeps this file 100% unit-testable. The oracle
// MUST be deterministic (fix seeds / time-limit margins in the orchestrator).

const INT_RE = /^[+-]?\d+$/;
const MAX_HEADER_TOKENS = 4; // how many first-line integers we try to repair
const MAX_NUMERIC_TOKENS = 64; // integer tokens minimized per pass sweep
const MAX_ALPHA_TOKENS = 16;
const MAX_LOG = 200;

/**
 * Canonical form: CRLF → LF, per-line trim + inner whitespace collapsed to a
 * single space, leading/trailing blank lines dropped (interior ones kept).
 * Token-based compare modes make this loss-free for judging purposes.
 */
function normalizeInput(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " "));
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === "") start += 1;
  while (end > start && lines[end - 1] === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

function toLines(str) {
  if (str === "") return [];
  return str.split("\n").map((l) => (l === "" ? [] : l.split(" ")));
}

function serialize(lines) {
  return lines.map((l) => l.join(" ")).join("\n");
}

function copyLines(lines) {
  return lines.map((l) => l.slice());
}

function isIntToken(tok) {
  return typeof tok === "string" && tok.length > 0 && tok.length <= 24 && INT_RE.test(tok);
}

/**
 * Count-repair variants: after removing `removedCount` items from `base`,
 * yield copies where one plausible "count" token is decremented to match.
 * Candidates: the first MAX_HEADER_TOKENS integers on the first line, plus the
 * first token of `contextLine` (for counts that live on the edited line).
 * Invalid guesses just fail the oracle — they only cost budget.
 */
function linkedVariants(base, removedCount, contextLine) {
  if (!removedCount || base.length === 0) return [];
  const spots = [];
  for (let t = 0; t < Math.min(base[0].length, MAX_HEADER_TOKENS); t += 1) {
    spots.push([0, t]);
  }
  if (
    typeof contextLine === "number" &&
    contextLine > 0 &&
    contextLine < base.length &&
    base[contextLine].length > 0
  ) {
    spots.push([contextLine, 0]);
  }
  const out = [];
  for (const [li, ti] of spots) {
    const tok = base[li][ti];
    if (!isIntToken(tok)) continue;
    const repaired = BigInt(tok) - BigInt(removedCount);
    if (repaired < 0n) continue;
    const variant = copyLines(base);
    variant[li][ti] = repaired.toString();
    out.push(variant);
  }
  return out;
}

async function shrinkInput(input, isInteresting, opts = {}) {
  const maxRuns = opts.maxRuns ?? 400;
  const maxMs = opts.maxMs ?? 30_000;
  const startedAt = Date.now();
  const cache = new Map();
  const log = [];
  let runs = 0;

  const exhausted = () => runs >= maxRuns || Date.now() - startedAt >= maxMs;

  const originalStr = normalizeInput(input);
  let best = { lines: toLines(originalStr), str: originalStr };

  /**
   * Oracle wrapper: cache + budget + monotone adoption. Adopts `cand` as the
   * new best iff the oracle says yes AND `cand` is strictly simpler than the
   * current best under (length, lex) — the strict order is what guarantees
   * termination even with a fully permissive oracle.
   */
  async function attempt(candLines, passName) {
    const str = serialize(candLines);
    if (str === best.str) return false;
    let verdict = cache.get(str);
    if (verdict === undefined) {
      if (exhausted()) return false;
      runs += 1;
      verdict = Boolean(await isInteresting(str));
      cache.set(str, verdict);
    }
    if (!verdict) return false;
    const simpler =
      str.length < best.str.length ||
      (str.length === best.str.length && str < best.str);
    if (!simpler) return false;
    best = { lines: copyLines(candLines), str };
    if (log.length < MAX_LOG) log.push({ pass: passName, bytes: str.length, runs });
    return true;
  }

  async function attemptWithVariants(base, removedCount, contextLine, passName) {
    if (await attempt(base, passName)) return true;
    for (const variant of linkedVariants(base, removedCount, contextLine)) {
      if (await attempt(variant, passName)) return true;
    }
    return false;
  }

  // ---- pass 1: remove chunks of whole lines --------------------------------------
  async function passRemoveLines() {
    let progress = false;
    let chunk = Math.ceil(best.lines.length / 2);
    while (chunk >= 1 && !exhausted()) {
      let i = 0;
      while (i < best.lines.length && !exhausted()) {
        const len = best.lines.length;
        const removed = Math.min(chunk, len - i);
        if (len - removed < 1) {
          i += chunk;
          continue;
        }
        const cand = best.lines.slice(0, i).concat(best.lines.slice(i + removed));
        if (await attemptWithVariants(copyLines(cand), removed, null, "lines")) {
          progress = true; // list shifted left — retry the same index
        } else {
          i += chunk;
        }
      }
      chunk = chunk > 1 ? Math.floor(chunk / 2) : 0;
    }
    return progress;
  }

  // ---- pass 2: remove chunks of tokens inside a line -------------------------------
  async function passRemoveTokens() {
    let progress = false;
    for (let li = best.lines.length - 1; li >= 0 && !exhausted(); li -= 1) {
      let chunk = Math.ceil(best.lines[li].length / 2);
      while (chunk >= 1 && !exhausted()) {
        let i = 0;
        while (i < best.lines[li].length && !exhausted()) {
          const tokens = best.lines[li];
          const removed = Math.min(chunk, tokens.length - i);
          if (tokens.length - removed < 1) {
            i += chunk; // emptying a line is pass 1's job
            continue;
          }
          const cand = copyLines(best.lines);
          cand[li] = tokens.slice(0, i).concat(tokens.slice(i + removed));
          if (await attemptWithVariants(cand, removed, li, "tokens")) {
            progress = true;
          } else {
            i += chunk;
          }
        }
        chunk = chunk > 1 ? Math.floor(chunk / 2) : 0;
      }
    }
    return progress;
  }

  // ---- pass 3: minimize integer magnitudes -----------------------------------------
  async function passMinimizeNumbers() {
    let progress = false;
    const refs = [];
    for (let li = 0; li < best.lines.length; li += 1) {
      for (let ti = 0; ti < best.lines[li].length; ti += 1) {
        if (isIntToken(best.lines[li][ti])) refs.push([li, ti]);
      }
    }
    const mag = (r) => {
      const v = BigInt(best.lines[r[0]][r[1]]);
      return v < 0n ? -v : v;
    };
    refs.sort((a, b) => {
      const d = mag(b) - mag(a);
      if (d !== 0n) return d > 0n ? 1 : -1;
      return a[0] - b[0] || a[1] - b[1];
    });

    for (const [li, ti] of refs.slice(0, MAX_NUMERIC_TOKENS)) {
      if (exhausted()) break;
      if (li >= best.lines.length || ti >= best.lines[li].length) continue;
      const tok = best.lines[li][ti];
      if (!isIntToken(tok)) continue;
      const v = BigInt(tok);
      if (v === 0n) continue;
      const sign = v < 0n ? -1n : 1n;
      const tryMagnitude = async (m) => {
        const cand = copyLines(best.lines);
        cand[li][ti] = (sign * m).toString();
        return attempt(cand, "numbers");
      };
      if (await tryMagnitude(0n)) {
        progress = true;
        continue;
      }
      // invariant: lo fails, hi (current value) passes — bisect the magnitude.
      let lo = 0n;
      let hi = v < 0n ? -v : v;
      while (hi - lo > 1n && !exhausted()) {
        const mid = (lo + hi) / 2n;
        if (await tryMagnitude(mid)) {
          hi = mid;
          progress = true;
        } else {
          lo = mid;
        }
      }
    }
    return progress;
  }

  // ---- pass 4: simplify alphabetic tokens (best effort) ----------------------------
  async function passSimplifyAlpha() {
    let progress = false;
    let seen = 0;
    for (let li = 0; li < best.lines.length && !exhausted(); li += 1) {
      for (let ti = 0; ti < best.lines[li].length && !exhausted(); ti += 1) {
        const tok = best.lines[li][ti];
        if (isIntToken(tok) || !/[A-Za-z]/.test(tok) || tok.length <= 1) continue;
        if ((seen += 1) > MAX_ALPHA_TOKENS) return progress;
        const shapes = [
          tok[0], // single character
          tok.slice(0, Math.ceil(tok.length / 2)), // half-length prefix
          tok[0].repeat(tok.length), // same length, one symbol
        ];
        for (const shape of shapes) {
          if (shape === tok) continue;
          const cand = copyLines(best.lines);
          cand[li][ti] = shape;
          const removedChars = tok.length - shape.length;
          if (await attemptWithVariants(cand, removedChars, li, "alpha")) {
            progress = true;
            break;
          }
        }
      }
    }
    return progress;
  }

  // ---- fixpoint loop ---------------------------------------------------------------
  runs += 1;
  const originalVerdict = Boolean(await isInteresting(originalStr));
  cache.set(originalStr, originalVerdict);
  if (!originalVerdict) {
    throw new Error("shrinkInput: original input is not interesting — nothing to minimize");
  }

  let progress = true;
  while (progress && !exhausted()) {
    progress = false;
    if (await passRemoveLines()) progress = true;
    if (await passRemoveTokens()) progress = true;
    if (await passMinimizeNumbers()) progress = true;
    if (await passSimplifyAlpha()) progress = true;
  }

  return {
    input: best.str,
    improved: best.str !== originalStr,
    runs,
    fromBytes: originalStr.length,
    toBytes: best.str.length,
    durationMs: Date.now() - startedAt,
    log,
  };
}

module.exports = { shrinkInput, normalizeInput };
