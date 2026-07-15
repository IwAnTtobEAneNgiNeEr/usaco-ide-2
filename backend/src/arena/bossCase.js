"use strict";

// bossCase.js — pure core of "Đối Thủ v1" (Boss Case). A Gauntlet counter-
// example is an ephemeral find on its own — the SAME minimal input recurring
// across separate attempts on the same problem is what earns it a name and a
// place in the Tủ Tiêu Bản. Kẻ địch is what gets randomized (which seed the
// generator produces); this module only decides when a recurring one has
// proven itself dangerous enough to promote — zero RNG here.
//
// Pure: no fs, no Date.now() (caller passes `now`). One problem's case list
// is an array; the store (bossCaseStore.js) is the only non-pure edge.

const crypto = require("crypto");

const PROMOTE_THRESHOLD = 2;

const KIND_LABELS = {
  WA: "Sai kết quả",
  TLE: "Quá giờ",
  RE: "Lỗi runtime",
};

function kindLabel(kind) {
  return KIND_LABELS[kind] || "Bất thường";
}

/** Canonical hash — trims outer whitespace so "3\n1 2 3" and "  3\n1 2 3  "
 *  are recognized as the exact same counterexample. */
function hashInput(minimalInput) {
  const canonical = String(minimalInput == null ? "" : minimalInput).trim();
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

/** Deterministic label — no RNG. Same (kind, hash) always yields the same name. */
function nameFor(kind, hash) {
  return `${kindLabel(kind)} #${String(hash).slice(0, 4)}`;
}

/**
 * Record one Gauntlet failure against a problem's existing case list.
 * Returns { cases, entry, justPromoted } — `entry` is the (possibly just-
 * bumped) case record, `justPromoted` is true only on the exact call that
 * crosses PROMOTE_THRESHOLD (never re-fires on later recurrences).
 */
function recordFailure(existingCases, { minimalInput, kind, expected, got, now }) {
  const list = Array.isArray(existingCases) ? existingCases.slice() : [];
  const hash = hashInput(minimalInput);
  const idx = list.findIndex((c) => c.hash === hash);

  if (idx < 0) {
    const entry = {
      hash,
      minimalInput: String(minimalInput == null ? "" : minimalInput).trim(),
      kind,
      expected: expected == null ? "" : expected,
      got: got == null ? "" : got,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      name: nameFor(kind, hash),
      promoted: false,
    };
    list.push(entry);
    return { cases: list, entry, justPromoted: false };
  }

  const before = list[idx];
  const count = before.count + 1;
  const wasPromoted = Boolean(before.promoted);
  const promoted = count >= PROMOTE_THRESHOLD;
  const entry = { ...before, count, lastSeenAt: now, promoted };
  list[idx] = entry;
  return { cases: list, entry, justPromoted: promoted && !wasPromoted };
}

module.exports = { PROMOTE_THRESHOLD, hashInput, nameFor, recordFailure };
