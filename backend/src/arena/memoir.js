"use strict";

// memoir.js — pure core of "Hồi Ký Trận Đấu" (S10). The peak-end rule in
// code: people remember the HIGHEST point and the ENDING of an experience,
// not its average — so this picks ONE "peak" line out of everything that's
// real about a session, instead of just concatenating every fact.
//
// Deliberately reuses gamereview/session-analyze.js's buildNotes() output
// wholesale rather than re-deriving commentary — this module only adds the
// two things Game Review doesn't know about: the rating swing (S3/S4) and any
// Bug Cards won (S5). README-LOOPS.md §3.3: "KHÔNG nhân đôi nguồn sự thật".
//
// Pure: no fs, no Date.now() — every fact is already computed and passed in.

const COMEBACK_WA_THRESHOLD = 2;

/**
 * @param {object} analysis - gamereview/session-analyze.js's analyzeSession() output
 * @param {string[]} notes - gamereview/session-analyze.js's buildNotes(analysis) output
 * @param {object|null} ratingDelta - a ratingStore history entry for this match, or null (friendly/no match)
 * @param {Array} cardsWon - [{tag, tagLabel, isNew}] cards touched by this problem
 */
function buildMemoir({ analysis, notes = [], ratingDelta = null, cardsWon = [] } = {}) {
  const arenaLines = [];
  let peak = null;

  const newCard = (cardsWon || []).find((c) => c && c.isNew);
  if (newCard) {
    const line = `Bắt được loài mới: ${newCard.tagLabel || newCard.tag}.`;
    arenaLines.push(line);
    peak = peak || line;
  }

  if (ratingDelta) {
    if (ratingDelta.delta > 0 && (ratingDelta.waBeforeAc || 0) >= COMEBACK_WA_THRESHOLD) {
      const line = `Comeback: AC sau ${ratingDelta.waBeforeAc} lần WA (+${ratingDelta.delta} điểm).`;
      arenaLines.push(line);
      peak = peak || line;
    } else if (ratingDelta.delta > 0) {
      arenaLines.push(`AC (+${ratingDelta.delta} điểm).`);
    } else if (ratingDelta.delta < 0) {
      arenaLines.push(`Đầu hàng (${ratingDelta.delta} điểm).`);
    }
  }

  if (!peak && analysis && analysis.attempts === 1 && analysis.acAt) {
    peak = "Sạch: AC nộp phát một.";
  }

  const lines = [...arenaLines, ...notes];
  if (!peak) peak = lines[0] || null;
  return { lines, peak };
}

/**
 * End-of-day summary reel. `entries` must be in CHRONOLOGICAL order (oldest
 * first) — ratingStart/ratingEnd are read off the first/last entry, not
 * recomputed. An empty day is reported honestly, never a fabricated "no
 * matches yet" narrative dressed up as a fact.
 */
function buildSessionReel(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return { hasMatches: false, matchCount: 0 };

  const withDelta = list.filter((e) => e.ratingDelta);
  const best = withDelta.length
    ? withDelta.reduce((a, b) => ((b.ratingDelta.delta || 0) > (a.ratingDelta.delta || 0) ? b : a))
    : null;

  const newCardsCount = list.reduce((s, e) => s + (e.cardsWon || []).filter((c) => c.isNew).length, 0);

  return {
    hasMatches: true,
    matchCount: list.length,
    bestMatch: best,
    ratingStart: withDelta.length ? withDelta[0].ratingDelta.ratingBefore : null,
    ratingEnd: withDelta.length ? withDelta[withDelta.length - 1].ratingDelta.ratingAfter : null,
    newCardsCount,
  };
}

/**
 * Which cards (from cardStore's `cards` map) have evidence pointing at
 * `problemId`, and whether each was the species' FIRST-EVER catch. Precise,
 * not a guess: a card's `evidence` entries are literally
 * "problems/<id>/moment/<ts>.json" strings (routes/moment.js), and
 * `firstCaughtAt` was set from that same timestamp at mint time — so
 * comparing the two ISO strings exactly answers "was this problem the one
 * that first caught this species".
 */
function cardsWonForProblem(cards, problemId) {
  const prefix = `problems/${problemId}/moment/`;
  const won = [];
  for (const card of Object.values(cards || {})) {
    const matches = (card.evidence || []).filter((e) => typeof e === "string" && e.startsWith(prefix));
    if (!matches.length) continue;
    const isNew = matches.some((e) => {
      const ts = Number(e.slice(prefix.length, -".json".length));
      return Number.isFinite(ts) && new Date(ts).toISOString() === card.firstCaughtAt;
    });
    won.push({ tag: card.tag, tagLabel: card.label, isNew });
  }
  return won;
}

module.exports = { COMEBACK_WA_THRESHOLD, buildMemoir, buildSessionReel, cardsWonForProblem };
