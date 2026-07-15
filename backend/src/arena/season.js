"use strict";

// season.js — pure core of "Mùa Giải" (S11). A season is a calendar month.
// Fresh-start effect: crossing into a new month archives the old season's
// best and starts a new "season-best" counter — but the player's actual Elo
// NEVER resets (that would erase real, earned progress); only the seasonal
// "how did THIS month go" framing refreshes. Bug Cards are untouched by
// seasons entirely (a permanent collection, owned by cardStore.js).
//
// Pure: no fs — caller passes `now` and the current rating.

function currentSeasonId(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function emptySeason(now, rating) {
  const seasonId = currentSeasonId(now);
  return { seasonId, startedAt: now, ratingAtStart: rating, seasonBestRating: rating };
}

/** True when there is no current season yet, OR the calendar month has changed. */
function shouldRollover(current, now) {
  if (!current) return true;
  return current.seasonId !== currentSeasonId(now);
}

/** Called on every rating update within the SAME season — tracks the peak. */
function noteRatingUpdate(current, rating, now) {
  if (!current || shouldRollover(current, now)) return emptySeason(now, rating);
  return { ...current, seasonBestRating: Math.max(current.seasonBestRating, rating) };
}

/**
 * Archive the outgoing season (if any) into history and start a fresh one.
 * Rating carries over unchanged — only the season-best counter resets.
 */
function rollover(state, { now, rating }) {
  const cur = state && state.current;
  const history = Array.isArray(state && state.history) ? state.history : [];
  const archived = cur
    ? { seasonId: cur.seasonId, startedAt: cur.startedAt, endedAt: now, ratingAtStart: cur.ratingAtStart, ratingAtEnd: rating, bestRating: cur.seasonBestRating }
    : null;
  return {
    current: emptySeason(now, rating),
    history: archived ? [archived, ...history] : history,
  };
}

module.exports = { currentSeasonId, emptySeason, shouldRollover, noteRatingUpdate, rollover };
