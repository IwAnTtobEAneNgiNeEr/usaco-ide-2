"use strict";

// coreFill.js — pure core of "Điền Lõi" (Core Fill). An AI-authored reference
// solution has its core reasoning step (DP transition, binary-search
// predicate, merge logic...) wrapped between two sentinel markers
// (ai.js's COREFILL_MARKER_START/END). This module only knows how to slice
// that marked string into (before, core, after) and reassemble it — no fs, no
// AI, no compiling. arena/coreFillOrchestrator.js is the non-pure edge that
// actually compiles/runs the result.
//
// The round-trip is guaranteed by construction: splitOnMarkers finds the
// marker positions and slices around them, so assemble(before, core, after)
// always reproduces the original fullCode with only the marker strings
// themselves removed (they're plain comments — removing them changes
// nothing about compiled behavior). What CAN fail structurally is the split
// itself (missing/duplicate/misordered markers) — that's what `ok` reports.

const { COREFILL_MARKER_START, COREFILL_MARKER_END } = require("../ai");

// v2 numbered markers — /*__LOI_BAT_DAU_k__*/ … /*__LOI_KET_THUC_k__*/ — let a
// single drill carve out SEVERAL core segments ("khung kỹ thuật" doctrine).
const GAP_MARKER_RE = /\/\*__LOI_(BAT_DAU|KET_THUC)(?:_(\d+))?__\*\//g;

/**
 * Multi-gap split. Accepts BOTH the v2 numbered markers and the legacy
 * unnumbered pair (treated as gap 1). Returns
 *   { ok, parts: [text0, text1, …], gaps: [{ index, core }] }
 * where the original program is parts[0]+core1+parts[1]+core2+…+parts[n].
 * Never throws — this runs on raw AI output.
 */
function parseGaps(fullCode) {
  const code = String(fullCode || "");
  const tokens = [];
  let m;
  GAP_MARKER_RE.lastIndex = 0;
  while ((m = GAP_MARKER_RE.exec(code))) {
    tokens.push({ kind: m[1] === "BAT_DAU" ? "start" : "end", index: m[2] ? Number(m[2]) : 1, at: m.index, len: m[0].length });
  }
  if (!tokens.length) return { ok: false, reason: "no gap markers found" };

  const parts = [];
  const gaps = [];
  let cursor = 0;
  let open = null;
  for (const t of tokens) {
    if (t.kind === "start") {
      if (open) return { ok: false, reason: `gap ${open.index} chưa đóng đã mở gap ${t.index}` };
      parts.push(code.slice(cursor, t.at));
      open = { index: t.index, coreFrom: t.at + t.len };
    } else {
      if (!open) return { ok: false, reason: `marker đóng gap ${t.index} không có marker mở` };
      if (t.index !== open.index) return { ok: false, reason: `marker đóng gap ${t.index} không khớp gap ${open.index} đang mở` };
      const core = code.slice(open.coreFrom, t.at);
      if (!core.trim()) return { ok: false, reason: `gap ${open.index} rỗng` };
      gaps.push({ index: open.index, core });
      cursor = t.at + t.len;
      open = null;
    }
  }
  if (open) return { ok: false, reason: `gap ${open.index} không có marker đóng` };
  parts.push(code.slice(cursor));

  const seen = new Set();
  for (const g of gaps) {
    if (seen.has(g.index)) return { ok: false, reason: `gap ${g.index} xuất hiện 2 lần` };
    seen.add(g.index);
  }
  return { ok: true, parts, gaps };
}

/** Reference program = parts joined back with the original cores. */
function assembleParts(parts, cores) {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += parts[i];
    if (i < cores.length) out += cores[i];
  }
  return out;
}

/** The student-facing skeleton: every gap replaced by a numbered TODO stub
 *  carrying that gap's task label — never the original core. */
function renderScaffoldParts(parts, gapLabels) {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += parts[i];
    if (i < gapLabels.length) {
      const label = gapLabels[i] && gapLabels[i].label ? gapLabels[i].label : "viết đoạn lõi vào đây";
      out += `/* [${gapLabels[i] && gapLabels[i].index ? gapLabels[i].index : i + 1}] TODO: ${label} */\n`;
    }
  }
  return out;
}

/**
 * Slice `fullCode` into { before, core, after } around the two markers.
 * Returns { ok: false, reason } if the markers aren't present exactly once
 * each in the right order — never throws, since this runs on AI output.
 */
function splitOnMarkers(fullCode) {
  const code = String(fullCode || "");
  const startCount = code.split(COREFILL_MARKER_START).length - 1;
  const endCount = code.split(COREFILL_MARKER_END).length - 1;
  if (startCount !== 1) return { ok: false, reason: `expected exactly 1 start marker, found ${startCount}` };
  if (endCount !== 1) return { ok: false, reason: `expected exactly 1 end marker, found ${endCount}` };

  const startIdx = code.indexOf(COREFILL_MARKER_START);
  const endIdx = code.indexOf(COREFILL_MARKER_END);
  if (startIdx >= endIdx) return { ok: false, reason: "start marker must come before end marker" };

  const before = code.slice(0, startIdx);
  const core = code.slice(startIdx + COREFILL_MARKER_START.length, endIdx);
  const after = code.slice(endIdx + COREFILL_MARKER_END.length);
  if (!core.trim()) return { ok: false, reason: "core span between markers is empty" };

  return { ok: true, before, core, after };
}

/** Reassemble a full program from its three parts (the student's `filled` in
 *  place of the original core). */
function assemble(before, filled, after) {
  return `${before || ""}${filled == null ? "" : filled}${after || ""}`;
}

/** What the student actually sees — the core replaced by a visible TODO
 *  stub, never the original reasoning. */
const STUB_COMMENT = "/* TODO: viết đoạn lõi vào đây */";
function renderScaffold(before, after) {
  return `${before || ""}${STUB_COMMENT}\n${after || ""}`;
}

/**
 * Pick the next drill to serve from a deck (arena/coreFillStore.js's shape).
 * Unsolved only; matching topic preferred over any-topic; within the rating
 * band preferred over out-of-band; ties broken by lowest rating first (ramp
 * gently rather than dropping a hard drill on a fresh player).
 */
function pickCandidate(drills, { topic, minRating, maxRating } = {}) {
  const list = (Array.isArray(drills) ? drills : []).filter((d) => d && !d.solvedAt);
  if (!list.length) return null;

  const inBand = (d) => {
    if (minRating == null && maxRating == null) return true;
    const r = Number(d.rating) || 0;
    return r >= (minRating || 0) && r <= (maxRating || Infinity);
  };
  const matchesTopic = (d) => topic && String(d.topic || "").toLowerCase() === String(topic).toLowerCase();

  const rank = (d) => (matchesTopic(d) ? 0 : 1) * 10 + (inBand(d) ? 0 : 1);
  return list
    .slice()
    .sort((a, b) => rank(a) - rank(b) || (Number(a.rating) || 0) - (Number(b.rating) || 0))[0];
}

module.exports = {
  splitOnMarkers, assemble, renderScaffold, STUB_COMMENT, pickCandidate,
  parseGaps, assembleParts, renderScaffoldParts
};
