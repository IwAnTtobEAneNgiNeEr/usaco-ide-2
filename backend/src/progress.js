"use strict";

// progress.js — the progression engine behind /api/progress.
//
// Everything here is DERIVED, deterministically, from data the app already
// records (meta.history, reviewCount/lastReviewedAt, status, difficulty).
// There is no new storage and no write path: delete this file and nothing
// breaks; re-add it and XP/streak/quests reappear identical. That keeps the
// gamification layer honest — you can't "lose" progress to a corrupt file.
//
// Day boundaries use LOCAL server time (the backend runs on the student's own
// machine), so a 23:50 run counts for "today" in Vietnam — unlike stats.js
// which buckets by UTC. Acceptable drift between the two views.

// ---------------------------------------------------------------------------
// XP rules
// ---------------------------------------------------------------------------

const SOLVE_XP = { easy: 20, medium: 40, hard: 70, unrated: 30 };
const BOSS_XP_MULT = 3;      // ⚔️ problems tagged "boss" pay first-AC XP ×3
const DEFENSE_XP = 25;       // 🎓 successfully defending an AC to the AI examiner
const COMEBACK_XP = 15;      // first AC after >=3 WA on the same problem
const REVIEW_XP = 15;        // each "Đã ôn" stamp
const DAY_ACTIVE_XP = 5;     // any day with >=1 run
const DAY_AC_XP = 10;        // any day with >=1 AC run
const DAY_GRIND_XP = 10;     // any day with >= GRIND_TARGET runs
const GRIND_TARGET = 8;

// Cumulative XP needed to ENTER level L (triangular curve: 60·L·(L+1)/2).
// L0 = 0, L1 = 60, L2 = 180, L3 = 360, L4 = 600, L5 = 900 …
function levelFloor(level) {
  return 30 * level * (level + 1);
}

const RANKS = [
  "Tân binh",            // 0
  "Học việc",            // 1
  "Thợ rèn code",        // 2
  "Chiến binh thuật toán", // 3
  "Thợ săn AC",          // 4
  "Kiện tướng",          // 5
  "Cao thủ",             // 6
  "Bậc thầy",            // 7
  "Huyền thoại",         // 8
  "Độc cô cầu bại"       // 9+
];

function levelFromXp(total) {
  let level = 0;
  while (levelFloor(level + 1) <= total) level += 1;
  return level;
}

function rankName(level) {
  return RANKS[Math.min(level, RANKS.length - 1)];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, "0"); }

// Local-time day key: "YYYY-MM-DD".
function dayKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function normTopic(meta) {
  const raw = (meta.topic || (Array.isArray(meta.tags) && meta.tags[0]) || "").trim().toLowerCase();
  return raw || "khác";
}

// Chronological (oldest→newest) copy of a meta history (stored newest-first).
function chrono(meta) {
  return Array.isArray(meta.history) ? meta.history.slice().reverse() : [];
}

// ---------------------------------------------------------------------------
// Per-problem digest: first AC, WA-before-AC, per-day run/AC counts
// ---------------------------------------------------------------------------

function digestProblem(meta) {
  const runs = chrono(meta);
  let firstAcAt = null;
  let waBeforeAc = 0;
  for (const h of runs) {
    if (h.verdict === "AC") { firstAcAt = h.at || null; break; }
    if (h.verdict === "WA") waBeforeAc += 1;
  }
  return { firstAcAt, waBeforeAc, runs };
}

// ---------------------------------------------------------------------------
// Spaced-review due count (mirrors stats.js /review-queue gating)
// ---------------------------------------------------------------------------

const REVIEW_INTERVALS = [3, 7, 21, 60]; // days
const MS_PER_DAY = 86400000;

function isReviewDue(meta, digest, nowMs) {
  if (!digest.firstAcAt) return false;
  const firstAcMs = Date.parse(digest.firstAcAt);
  if (!firstAcMs) return false;
  const reviewCount = Number(meta.reviewCount) > 0 ? Math.floor(Number(meta.reviewCount)) : 0;
  const lastReviewedMs = meta.lastReviewedAt ? Date.parse(meta.lastReviewedAt) : firstAcMs;
  const days = (nowMs - lastReviewedMs) / MS_PER_DAY;
  return days >= REVIEW_INTERVALS[Math.min(reviewCount, REVIEW_INTERVALS.length - 1)];
}

// ---------------------------------------------------------------------------
// computeProgress(metas, { now }) — the whole progression snapshot
// ---------------------------------------------------------------------------

function computeProgress(metas, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();
  const today = dayKey(now);

  // Per-day aggregates across every problem.
  const dayRuns = {};   // day -> run count
  const dayAcs = {};    // day -> AC count
  let xp = 0;
  let xpToday = 0;
  let solved = 0;
  let reviewDue = 0;
  let reviewedToday = 0;
  let defendedToday = 0;
  let undefendedAc = 0; // AC'd problems still waiting for a 🎓 defense

  // Skill buckets by topic.
  const skillMap = {}; // topic -> { topic, total, solved, lastAt }

  for (const meta of metas) {
    const digest = digestProblem(meta);

    // --- solve XP (first AC only, by difficulty, + comeback bonus) ---
    if (digest.firstAcAt) {
      let gain = SOLVE_XP[meta.difficulty] || SOLVE_XP.unrated;
      if ((meta.tags || []).includes("boss")) gain *= BOSS_XP_MULT; // ⚔️ boss bounty
      if (digest.waBeforeAc >= 3) gain += COMEBACK_XP;
      xp += gain;
      if (dayKey(digest.firstAcAt) === today) xpToday += gain;
    }

    // --- review XP (reviewCount stamps; only the latest has a date) ---
    const reviews = Number(meta.reviewCount) > 0 ? Math.floor(Number(meta.reviewCount)) : 0;
    if (reviews > 0) {
      xp += reviews * REVIEW_XP;
      if (meta.lastReviewedAt && dayKey(meta.lastReviewedAt) === today) {
        xpToday += REVIEW_XP;
        reviewedToday += 1;
      }
    }

    if (meta.status === "solved" || meta.lastVerdict === "AC" || digest.firstAcAt) solved += 1;
    if (isReviewDue(meta, digest, nowMs)) reviewDue += 1;

    // --- 🎓 defense XP (one bounty per problem, dated by FIRST pass) ---
    const defense = meta.defense && typeof meta.defense === "object" ? meta.defense : null;
    if (defense && defense.passed) {
      xp += DEFENSE_XP;
      if (defense.passedAt && dayKey(defense.passedAt) === today) {
        xpToday += DEFENSE_XP;
        defendedToday += 1;
      }
    } else if (digest.firstAcAt) {
      undefendedAc += 1;
    }

    // --- day buckets ---
    for (const h of digest.runs) {
      const k = dayKey(h.at);
      if (!k) continue;
      dayRuns[k] = (dayRuns[k] || 0) + 1;
      if (h.verdict === "AC") dayAcs[k] = (dayAcs[k] || 0) + 1;
    }

    // --- skills ---
    const topic = normTopic(meta);
    const bucket = skillMap[topic] || (skillMap[topic] = { topic, total: 0, solved: 0, lastAt: "" });
    bucket.total += 1;
    if (digest.firstAcAt || meta.status === "solved") bucket.solved += 1;
    const touched = meta.updatedAt || "";
    if (touched > bucket.lastAt) bucket.lastAt = touched;
  }

  // --- daily bonuses (these ARE the daily quests, accrued for every past day) ---
  for (const [k, count] of Object.entries(dayRuns)) {
    let dayGain = DAY_ACTIVE_XP;
    if (dayAcs[k]) dayGain += DAY_AC_XP;
    if (count >= GRIND_TARGET) dayGain += DAY_GRIND_XP;
    xp += dayGain;
    if (k === today) xpToday += dayGain;
  }

  // --- streak (consecutive local days with >=1 run, counting back from today;
  //     an inactive *today* doesn't break it — you still have time tonight) ---
  let streak = 0;
  {
    let cursor = new Date(now);
    if (!dayRuns[dayKey(cursor)]) cursor = addDays(cursor, -1); // grace for today
    while (dayRuns[dayKey(cursor)]) { streak += 1; cursor = addDays(cursor, -1); }
  }
  // Best streak over all recorded days.
  let bestStreak = streak;
  {
    const days = Object.keys(dayRuns).sort();
    let run = 0, prev = null;
    for (const k of days) {
      if (prev && dayKey(addDays(new Date(prev + "T12:00:00"), 1)) === k) run += 1;
      else run = 1;
      if (run > bestStreak) bestStreak = run;
      prev = k;
    }
  }

  // --- level ---
  const level = levelFromXp(xp);
  const floor = levelFloor(level);
  const next = levelFloor(level + 1);
  const pct = next > floor ? Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)) : 100;

  // --- today's quests ---
  const runsToday = dayRuns[today] || 0;
  const acsToday = dayAcs[today] || 0;
  const quests = [
    { id: "warmup", icon: "⚡", label: "Khởi động — chạy code 1 lần", progress: Math.min(runsToday, 1), target: 1, xp: DAY_ACTIVE_XP },
    { id: "ac", icon: "🎯", label: "Săn một AC hôm nay", progress: Math.min(acsToday, 1), target: 1, xp: DAY_AC_XP },
    { id: "grind", icon: "🔨", label: `Luyện tay — ${GRIND_TARGET} lượt chạy`, progress: Math.min(runsToday, GRIND_TARGET), target: GRIND_TARGET, xp: DAY_GRIND_XP }
  ];
  if (reviewDue > 0 || reviewedToday > 0) {
    quests.push({ id: "review", icon: "🔁", label: "Ôn lại 1 bài đến hạn", progress: Math.min(reviewedToday, 1), target: 1, xp: REVIEW_XP });
  }
  if (undefendedAc > 0 || defendedToday > 0) {
    quests.push({ id: "defense", icon: "🎓", label: "Bảo vệ 1 bài AC trước giám khảo AI", progress: Math.min(defendedToday, 1), target: 1, xp: DEFENSE_XP });
  }
  for (const q of quests) q.done = q.progress >= q.target;

  // --- 7-day mini chart (oldest → newest, ends today) ---
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(addDays(now, -i));
    week.push({ date: k, runs: dayRuns[k] || 0, ac: dayAcs[k] || 0 });
  }

  // --- skills, ranked by volume; stars from solved-count thresholds ---
  const STAR_AT = [1, 2, 4, 7, 11];
  const skills = Object.values(skillMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map((s) => ({
      topic: s.topic,
      total: s.total,
      solved: s.solved,
      stars: STAR_AT.filter((t) => s.solved >= t).length
    }));

  return {
    xp: { total: xp, today: xpToday, level, levelName: rankName(level), levelFloor: floor, nextLevelAt: next, pct },
    streak: { current: streak, best: bestStreak, todayActive: runsToday > 0 },
    quests,
    skills,
    week,
    reviewDue,
    totals: { problems: metas.length, solved }
  };
}

module.exports = {
  computeProgress,
  // exported for tests
  levelFloor,
  levelFromXp,
  rankName,
  dayKey,
  SOLVE_XP,
  BOSS_XP_MULT,
  DEFENSE_XP,
  COMEBACK_XP,
  REVIEW_XP,
  DAY_ACTIVE_XP,
  DAY_AC_XP,
  DAY_GRIND_XP,
  GRIND_TARGET
};
