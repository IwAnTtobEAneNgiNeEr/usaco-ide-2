"use strict";

// seal.js — pure core of "Ấn" (Seal), the kintsugi rank of an accepted
// solution. Every condition is DETERMINISTIC, derived from data the app
// already records — Rated eligibility (arena/match.js), the Gauntlet
// (arena/gauntlet.js), Coach hint usage (problemStore's hintsUsed), and the
// spaced-repetition review count (reviewQueue.js's REVIEW_INTERVALS). RNG has
// no vote in what an Ấn says about your solve — the project doctrine's first
// law: "skill mở cửa, RNG chọn màu".
//
// Tiers, each a strictly higher bar than the last (no downgrades, no skips):
//   Thô          — any AC at all (Friendly counts — it's still a real solve).
//   Đã Tôi       — the post-AC Gauntlet survived it. Deliberately NOT gated on
//                   `rated`: gauntlet.js's runPostAcGauntlet already refuses to
//                   run at all without a trusted reference ("reference-
//                   untrusted"), so trustworthiness is already guaranteed by
//                   gauntletLastResult alone — requiring `rated` on top only
//                   blocked this tier behind Elo bureaucracy (confirmed
//                   problem rating, sample presence) that has nothing to do
//                   with whether the SOLUTION survived a real adversarial
//                   hunt, and made Đã Tôi unreachable for any problem whose
//                   one rated win was already spent (arena/match.js's
//                   wasEverSolved — one problem, one rated win, ever).
//   Tinh Luyện   — Đã Tôi AND zero WA before the AC AND zero Coach hints used.
//   Chân Phẩm    — Tinh Luyện AND reviewCount >= 3 (reached the 21-day spaced-
//                   repetition checkpoint) AND no WA has crept in on any
//                   re-solve since (kintsugi vẫn sạch qua thời gian).

const REVIEW_CHECKPOINT_COUNT = 3; // REVIEW_INTERVALS[2] === 21 days (reviewQueue.js)

const TIER_NAMES = ["Chưa có Ấn", "Thô", "Đã Tôi", "Tinh Luyện", "Chân Phẩm"];

/**
 * `history`: problemStore.listHistory() shape, NEWEST FIRST — [{verdict, at}, ...].
 * Returns { solved, waBeforeAc, anyWaAfterFirstAc }.
 */
function deriveSolveProfile(history) {
  const list = Array.isArray(history) ? history : [];
  const chrono = list.slice().reverse(); // oldest → newest
  const firstAcIdx = chrono.findIndex((h) => h.verdict === "AC");
  if (firstAcIdx < 0) return { solved: false, waBeforeAc: 0, anyWaAfterFirstAc: false };

  const waBeforeAc = chrono.slice(0, firstAcIdx).filter((h) => h.verdict === "WA").length;
  const anyWaAfterFirstAc = chrono.slice(firstAcIdx + 1).some((h) => h.verdict === "WA");
  return { solved: true, waBeforeAc, anyWaAfterFirstAc };
}

/**
 * `profile`: deriveSolveProfile() result. `gauntletLastResult` comes from
 * arena/referenceStore.js; `hintsUsed`/`reviewCount` from problemStore meta.
 */
function computeSeal({ profile, gauntletLastResult, hintsUsed, reviewCount }) {
  if (!profile || !profile.solved) {
    return { tier: 0, tierName: TIER_NAMES[0], kintsugi: { waCount: 0 } };
  }

  const waCount = Number(profile.waBeforeAc) || 0;
  let tier = 1; // Thô — any AC at all

  if (gauntletLastResult === "survived") {
    tier = 2; // Đã Tôi
    if (waCount === 0 && (Number(hintsUsed) || 0) === 0) {
      tier = 3; // Tinh Luyện
      if ((Number(reviewCount) || 0) >= REVIEW_CHECKPOINT_COUNT && !profile.anyWaAfterFirstAc) {
        tier = 4; // Chân Phẩm
      }
    }
  }

  return { tier, tierName: TIER_NAMES[tier], kintsugi: { waCount } };
}

module.exports = { REVIEW_CHECKPOINT_COUNT, TIER_NAMES, deriveSolveProfile, computeSeal };
