"use strict";

function fold(value) {
  return String(value == null ? "" : value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function conceptOf(problem) {
  return String(problem.concept || problem.topic || (Array.isArray(problem.tags) ? problem.tags[0] : "") || "").trim();
}

function trackOf(problem) {
  if (problem.track) return String(problem.track).trim();
  const concept = fold(conceptOf(problem)).replace(/[_\s]+/g, "-");
  return ["bfs", "dijkstra", "prefix-sum", "prefixsum"].includes(concept) ? "verified-artifact" : "";
}

function ratingOf(problem) {
  for (const candidate of [problem.rating, problem.cfRating, problem.analysis && problem.analysis.cfRating]) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function exact(value, query) { return fold(value) === fold(query); }
function includes(value, query) { return fold(value).includes(fold(query)); }

function searchProblems(problems, filters = {}) {
  const minRating = filters.minRating === "" || filters.minRating == null ? null : Number(filters.minRating);
  const maxRating = filters.maxRating === "" || filters.maxRating == null ? null : Number(filters.maxRating);
  const q = fold(filters.q);
  const output = [];

  for (const problem of Array.isArray(problems) ? problems : []) {
    const concept = conceptOf(problem);
    const track = trackOf(problem);
    const rating = ratingOf(problem);
    if (filters.track && !exact(track, filters.track)) continue;
    if (filters.concept && !exact(concept, filters.concept) && !(problem.tags || []).some((tag) => exact(tag, filters.concept))) continue;
    if (filters.provider && !exact(problem.provider, filters.provider)) continue;
    if (filters.collection && !exact(problem.collection, filters.collection)) continue;
    if (filters.status && !exact(problem.status, filters.status)) continue;
    if (Number.isFinite(minRating) && (rating == null || rating < minRating)) continue;
    if (Number.isFinite(maxRating) && (rating == null || rating > maxRating)) continue;

    let score = 0;
    const whyMatched = [];
    if (q) {
      if (exact(problem.title, q)) { score += 100; whyMatched.push("Exact title match"); }
      else if (includes(problem.title, q)) { score += 60; whyMatched.push("Title contains the query"); }
      if (includes(problem.id, q)) { score += 35; whyMatched.push("Problem id contains the query"); }
      if (includes(concept, q)) { score += 45; whyMatched.push(`Concept matches: ${concept}`); }
      if ((problem.tags || []).some((tag) => includes(tag, q))) { score += 30; whyMatched.push("A tag contains the query"); }
      if (includes(problem.collection, q)) { score += 20; whyMatched.push(`Collection matches: ${problem.collection}`); }
      if (includes(problem.provider, q)) { score += 10; whyMatched.push(`Provider matches: ${problem.provider}`); }
      if (!score) continue;
    }
    if (filters.track) whyMatched.push(`Track filter: ${track}`);
    if (filters.concept) whyMatched.push(`Concept filter: ${concept}`);
    if (filters.provider) whyMatched.push(`Provider filter: ${problem.provider}`);
    if (filters.collection) whyMatched.push(`Collection filter: ${problem.collection}`);
    if (filters.status) whyMatched.push(`Status filter: ${problem.status}`);
    if (Number.isFinite(minRating) || Number.isFinite(maxRating)) whyMatched.push(`Rating evidence: ${rating}`);
    if (!whyMatched.length) whyMatched.push("Matches the requested content catalog");
    output.push({ ...problem, track, concept, rating, whyMatched, matchScore: score });
  }
  return output.sort((a, b) => b.matchScore - a.matchScore || String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.id.localeCompare(b.id));
}

function recommendEntries(problems, options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const liked = new Set((options.liked || []).map(String));
  const dismissed = new Set((options.dismissed || []).map(String));
  const targetRating = Number.isFinite(Number(options.targetRating)) && Number(options.targetRating) > 0 ? Number(options.targetRating) : null;
  const candidates = [];

  for (const problem of Array.isArray(problems) ? problems : []) {
    if (!problem || dismissed.has(problem.id) || problem.status === "solved") continue;
    const track = trackOf(problem);
    const concept = conceptOf(problem);
    if (options.track && !exact(track, options.track)) continue;
    if (options.concept && !exact(concept, options.concept) && !(problem.tags || []).some((tag) => exact(tag, options.concept))) continue;
    const rating = ratingOf(problem);
    if (options.minRating != null && Number.isFinite(Number(options.minRating)) && (rating == null || rating < Number(options.minRating))) continue;
    if (options.maxRating != null && Number.isFinite(Number(options.maxRating)) && (rating == null || rating > Number(options.maxRating))) continue;

    let score = 0;
    const reason = [];
    const scoreBreakdown = {};
    const failure = ["WA", "CE", "RE", "TLE"].includes(problem.lastVerdict);
    const derivedWork = ["needs-work", "stale", "in-progress"].includes(problem.derivedStatus);
    if (failure) { score += 40; scoreBreakdown.workInProgress = 40; reason.push(`Unfinished work has stored ${problem.lastVerdict} evidence.`); }
    else if (derivedWork) { score += 32; scoreBreakdown.workInProgress = 32; reason.push(`Derived status is ${problem.derivedStatus}; a concrete Work loop is open.`); }
    if (problem.lastVerdict || problem.derivedStatus === "verified") { score += 6; scoreBreakdown.evidence = 6; reason.push("Selection uses recorded judge/artifact evidence."); }
    if (options.track) { score += 20; scoreBreakdown.track = 20; reason.push(`Matches requested track ${track}.`); }
    if (options.concept) { score += 15; scoreBreakdown.concept = 15; reason.push(`Matches requested concept ${concept}; this is an explicit preference, not an inferred weakness.`); }
    if (liked.has(problem.id)) { score += 25; scoreBreakdown.userFeedback = 25; reason.push("Explicit positive feedback for this entry."); }
    if (rating != null && targetRating != null) {
      const difficultyScore = Math.max(0, 20 - Math.floor(Math.abs(rating - targetRating) / 50));
      score += difficultyScore; scoreBreakdown.difficulty = difficultyScore;
      reason.push(`Recorded rating ${rating} is compared with target ${targetRating}.`);
    }
    const updated = Date.parse(problem.updatedAt || problem.createdAt);
    const ageDays = Number.isFinite(updated) && Number.isFinite(nowMs) ? Math.max(0, Math.floor((nowMs - updated) / 86400000)) : null;
    if (ageDays != null && ageDays <= 30) { const freshness = ageDays <= 7 ? 10 : 5; score += freshness; scoreBreakdown.freshness = freshness; reason.push(`Content freshness: updated ${ageDays} day(s) ago.`); }
    if (!reason.length) reason.push("Unsolved catalog entry; no weakness or numeric rating was inferred.");
    candidates.push({
      id: problem.id, title: problem.title, track, concept, provider: problem.provider, collection: problem.collection,
      status: problem.status, derivedStatus: problem.derivedStatus, rating,
      ratingEvidence: rating == null ? null : { value: rating, source: problem.rating != null ? "rating" : "cfRating" },
      reason, score, scoreBreakdown,
      action: { type: "offer", autoOpen: false, href: `/api/problems/${problem.id}` },
    });
  }
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}

function csv(value) { return String(value || "").split(",").map((part) => part.trim()).filter(Boolean); }

module.exports = { fold, conceptOf, trackOf, ratingOf, searchProblems, recommendEntries, csv };
