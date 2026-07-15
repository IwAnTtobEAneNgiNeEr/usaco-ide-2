"use strict";

// Tests for arena/seal.js — pure core of "Ấn" (Seal), the deterministic
// kintsugi rank of an accepted solution. Every tier condition is derivable
// from data the app already records (match/gauntlet/hints/reviews) — RNG has
// no vote here (see project doctrine: "skill mở cửa, RNG chọn màu").

const test = require("node:test");
const assert = require("node:assert/strict");

const seal = require("../src/arena/seal");

// ---- deriveSolveProfile (pure, given a chronological-newest-first history) --

function h(verdict, at) { return { verdict, at }; }

test("deriveSolveProfile: not yet solved", () => {
  const profile = seal.deriveSolveProfile([h("WA", "2026-07-01"), h("WA", "2026-07-02")]);
  assert.equal(profile.solved, false);
});

test("deriveSolveProfile: counts WA before the first AC, chronologically", () => {
  // history is newest-first (problemStore.listHistory convention)
  const history = [h("AC", "2026-07-03"), h("WA", "2026-07-02"), h("WA", "2026-07-01")];
  const profile = seal.deriveSolveProfile(history);
  assert.equal(profile.solved, true);
  assert.equal(profile.waBeforeAc, 2);
  assert.equal(profile.anyWaAfterFirstAc, false);
});

test("deriveSolveProfile: a WA after the first AC (a dirty review re-solve) is flagged", () => {
  const history = [h("WA", "2026-07-10"), h("AC", "2026-07-03"), h("WA", "2026-07-01")];
  const profile = seal.deriveSolveProfile(history);
  assert.equal(profile.waBeforeAc, 1); // only counts before the FIRST ac
  assert.equal(profile.anyWaAfterFirstAc, true);
});

test("deriveSolveProfile: a clean single-shot AC has zero WA anywhere", () => {
  const profile = seal.deriveSolveProfile([h("AC", "2026-07-01")]);
  assert.equal(profile.waBeforeAc, 0);
  assert.equal(profile.anyWaAfterFirstAc, false);
});

// ---- computeSeal ------------------------------------------------------------

function profile(overrides = {}) {
  return { solved: true, waBeforeAc: 0, anyWaAfterFirstAc: false, ...overrides };
}

test("computeSeal: unsolved has no Ấn at all", () => {
  const out = seal.computeSeal({ profile: { solved: false }, rated: null, gauntletLastResult: null, hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 0);
  assert.equal(out.tierName, "Chưa có Ấn");
});

test("computeSeal: a Friendly (unrated) AC is Thô, no higher", () => {
  const out = seal.computeSeal({ profile: profile(), gauntletLastResult: null, hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 1);
  assert.equal(out.tierName, "Thô");
});

test("computeSeal: Gauntlet survived reaches Đã Tôi (but a WA scar keeps it from Tinh Luyện)", () => {
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 1 }), gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 2);
  assert.equal(out.tierName, "Đã Tôi");
});

test("computeSeal: Đã Tôi does NOT require a rated match — a Friendly-solved problem's Gauntlet-survived reference reaches it too", () => {
  // The real bug this guards: a problem whose one rated win is already spent
  // (arena/match.js wasEverSolved — one rated win, ever) can still promote
  // its AC'd code into a reference and run the Gauntlet on it (arena/upgrade.js,
  // arena-reference.js's Gauntlet route has no `rated` dependency at all) —
  // Đã Tôi must be reachable through that path, or every already-solved
  // problem is permanently capped at Thô with no way up.
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 2 }), gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 2);
  assert.equal(out.tierName, "Đã Tôi");
});

test("computeSeal: Gauntlet broken it stays at Thô (never downgrades below, never jumps ahead)", () => {
  const out = seal.computeSeal({ profile: profile(), gauntletLastResult: "broken", hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 1);
});

test("computeSeal: Đã Tôi + zero WA + zero hints reaches Tinh Luyện", () => {
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 0 }), gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 3);
  assert.equal(out.tierName, "Tinh Luyện");
});

test("computeSeal: any WA before AC caps the tier at Đã Tôi, even with zero hints", () => {
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 1 }), gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.tier, 2);
});

test("computeSeal: any hint used caps the tier at Đã Tôi, even with zero WA", () => {
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 0 }), gauntletLastResult: "survived", hintsUsed: 1, reviewCount: 0 });
  assert.equal(out.tier, 2);
});

test("computeSeal: Tinh Luyện + reviewCount>=3 (reached the 21-day checkpoint) + no post-AC WA reaches Chân Phẩm", () => {
  const out = seal.computeSeal({
    profile: profile({ waBeforeAc: 0, anyWaAfterFirstAc: false }),
    gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 3,
  });
  assert.equal(out.tier, 4);
  assert.equal(out.tierName, "Chân Phẩm");
});

test("computeSeal: Tinh Luyện but reviewCount < 3 stays at Tinh Luyện (hasn't proven it over time yet)", () => {
  const out = seal.computeSeal({
    profile: profile({ waBeforeAc: 0 }), gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 2,
  });
  assert.equal(out.tier, 3);
});

test("computeSeal: Tinh Luyện + reviewCount>=3 but a WA crept in during a review resolve stays at Tinh Luyện", () => {
  const out = seal.computeSeal({
    profile: profile({ waBeforeAc: 0, anyWaAfterFirstAc: true }),
    gauntletLastResult: "survived", hintsUsed: 0, reviewCount: 5,
  });
  assert.equal(out.tier, 3);
});

test("computeSeal: kintsugi.waCount always reports the raw scar count, regardless of tier", () => {
  const out = seal.computeSeal({ profile: profile({ waBeforeAc: 4 }), gauntletLastResult: null, hintsUsed: 0, reviewCount: 0 });
  assert.equal(out.kintsugi.waCount, 4);
});

test("TIER_NAMES is exported and has exactly 5 entries (none through Chân Phẩm)", () => {
  assert.equal(seal.TIER_NAMES.length, 5);
});
