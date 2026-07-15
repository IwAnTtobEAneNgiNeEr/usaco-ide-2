"use strict";

// rush.js — pure state machine + selection logic for "Sới Đập Lỗi" (Bug
// Rush): a timed arcade run, 3 lives, score = bugs squashed, the clock
// shrinks as the run escalates. The ONLY randomness anywhere in this mode is
// which bug species shows up next (chooseTargetTag) — everything else
// (scoring, lives, escalation, timing) is deterministic given the inputs.
//
// Pure: no fs, no Date.now() (caller passes `now`), no AI, no Express.
// Persisted as-is via arena/rushStore.js.

const { RUSH } = require("../config");
const { TAXONOMY } = require("../moment/diagnose");

const SPECIES_TAGS = TAXONOMY.map((t) => t.tag).filter((t) => t !== "khac");

const STATES = Object.freeze(["idle", "active", "over"]);

function defaultRun() {
  return {
    state: "idle",
    lives: RUSH.startingLives,
    score: 0,
    level: 1,
    // The FULL current drill (buggyCode/tests/bugSummary/tag), not just an
    // id — there is only ever one active drill for one active run, so there
    // is nothing to look up: the run state IS the source of truth for what's
    // in flight. routes/arena-rush.js strips secret fields (tests/bugSummary)
    // before this ever reaches the client.
    currentDrill: null,
    deadlineAt: null,
    // Progressive hints for the CURRENT drill: 0 = none taken, 1 = khoanh
    // vùng, 2 = kỹ thuật. Resets when a new drill is assigned.
    hintLevel: 0,
    startedAt: null,
    finishedAt: null
  };
}

/** Reset to a fresh run — abandons whatever was in progress (arcade
 *  convention: starting over always wins, same as Puzzle Rush). */
function startRun(now) {
  return { ...defaultRun(), state: "active", startedAt: now };
}

/** How long the clock runs at this level — shrinks linearly, floored at
 *  RUSH.minTimeMs so a long run never becomes literally impossible. */
function timeLimitForLevel(level) {
  const l = Math.max(1, Number(level) || 1);
  return Math.max(RUSH.minTimeMs, RUSH.maxTimeMs - (l - 1) * RUSH.timeStepMs);
}

/** Difficulty label fed to ai.generateRushDrill — code length/subtlety scale
 *  with this, not with the clock directly (the clock is what actually makes
 *  a level feel harder; the label just keeps content roughly matched to it). */
function difficultyLabelForLevel(level) {
  const l = Math.max(1, Number(level) || 1);
  if (l <= 2) return "easy";
  if (l <= 5) return "medium";
  if (l <= 8) return "hard";
  return "expert";
}

/** Attach a freshly-fetched drill to an active run (sets its own deadline
 *  from `now`, per the run's current level). No-op shape check: only valid
 *  while the run is actually active. */
function assignDrill(run, { drill, now }) {
  if (!run || run.state !== "active") return run;
  return {
    ...run,
    currentDrill: drill,
    hintLevel: 0,
    deadlineAt: now + timeLimitForLevel(run.level)
  };
}

/**
 * Take the next hint for the current drill. Level 1 (khoanh vùng) is free;
 * level 2 (kỹ thuật) costs 1 điểm (floored at 0) — a hint that names the bug
 * class is worth something, so it must cost something. Capped at 2; a repeat
 * call past the cap is a no-op returning the same run.
 */
function useHint(run) {
  if (!run || run.state !== "active" || !run.currentDrill) return { run, level: 0 };
  if (run.hintLevel >= 2) return { run, level: run.hintLevel };
  const level = (run.hintLevel || 0) + 1;
  return {
    run: { ...run, hintLevel: level, score: level === 2 ? Math.max(0, run.score - 1) : run.score },
    level
  };
}

/**
 * Resolve one submitted attempt. `correct` is the judge's verdict (already
 * computed by the caller via judgeService); `now` is compared against the
 * run's own deadlineAt to catch a late-but-correct submit as a timeout
 * regardless of client-side clock claims — the SERVER decides on-time, not
 * the browser.
 * Returns { run, outcome } where outcome is "correct" | "wrong" | "timeout".
 * A miss (wrong or timeout) costs exactly one life; a life at 0 ends the run
 * (state "over") — the level does NOT drop on a miss (only one more chance
 * at the same difficulty, not a punitive double penalty).
 *
 * A WRONG submit with lives left KEEPS the same drill and the same clock:
 * the player stays in the hunt (take a hint, keep digging) instead of being
 * told the answer and shoved to the next bug — the reveal only ever happens
 * when the drill actually resolves (correct / timeout / run over).
 */
function resolveAttempt(run, { correct, now }) {
  if (!run || run.state !== "active") return { run, outcome: null };
  const onTime = run.deadlineAt == null || now <= run.deadlineAt;
  const success = Boolean(correct) && onTime;
  const outcome = success ? "correct" : (onTime ? "wrong" : "timeout");

  if (success) {
    return {
      run: {
        ...run,
        score: run.score + 1,
        level: Math.min(RUSH.maxLevel, run.level + 1),
        currentDrill: null, deadlineAt: null, hintLevel: 0
      },
      outcome
    };
  }

  const lives = run.lives - 1;
  if (lives <= 0) {
    return { run: { ...run, lives: 0, state: "over", finishedAt: now, currentDrill: null, deadlineAt: null, hintLevel: 0 }, outcome };
  }
  if (outcome === "wrong") {
    // Same drill, same deadline, one less life — the bug is still theirs to find.
    return { run: { ...run, lives }, outcome };
  }
  return { run: { ...run, lives, currentDrill: null, deadlineAt: null, hintLevel: 0 }, outcome };
}

/**
 * Pick the next bug species — weighted toward the player's OWN recurring
 * bugs (Student Model), base weight 1 so every species stays reachable even
 * with no history yet. `randomFn` is injectable for deterministic tests,
 * same convention as arena/nextBet.js's pickMysteryBet.
 */
function chooseTargetTag(recurringBugs, { randomFn = Math.random } = {}) {
  const bugs = Array.isArray(recurringBugs) ? recurringBugs : [];
  const weights = SPECIES_TAGS.map((tag) => {
    const hit = bugs.find((b) => b && b.tag === tag);
    return 1 + (hit ? Math.max(0, Number(hit.count) || 0) : 0);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = randomFn() * total;
  for (let i = 0; i < SPECIES_TAGS.length; i++) {
    r -= weights[i];
    if (r <= 0) return SPECIES_TAGS[i];
  }
  return SPECIES_TAGS[SPECIES_TAGS.length - 1];
}

module.exports = {
  STATES,
  SPECIES_TAGS,
  defaultRun,
  startRun,
  timeLimitForLevel,
  difficultyLabelForLevel,
  assignDrill,
  useHint,
  resolveAttempt,
  chooseTargetTag
};
