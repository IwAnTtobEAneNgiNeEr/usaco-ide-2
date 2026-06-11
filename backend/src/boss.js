"use strict";

// boss.js — ⚔️ Weekend Boss orchestration.
//
// One AI-authored problem per ISO week, aimed at the student's weakest topic
// (most WA runs). The boss is a REAL problem in workspace/problems (tagged
// "boss"), so judging/coach/editorial all work unchanged; the progress engine
// pays first-AC XP ×3 for boss-tagged problems. A tiny registry in
// data/boss.json maps week-id → problem, so "defeated" is always derived from
// the problem's own history, never stored.

const path = require("path");
const config = require("./config");
const fileStore = require("./fileStore");
const problemStore = require("./problemStore");
const ai = require("./ai");
const verifyTests = require("./verifyTests");

const REGISTRY_FILE = path.join(config.DATA_DIR, "boss.json");

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

// ISO-8601 week id, e.g. "2026-W24" (weeks start Monday; week 1 contains Jan 4).
function isoWeekId(input) {
  const d = input instanceof Date ? new Date(input) : new Date(input || Date.now());
  d.setHours(0, 0, 0, 0);
  // Shift to the Thursday of this week — its year IS the ISO year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const isoYear = d.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  jan4.setDate(jan4.getDate() + 3 - ((jan4.getDay() + 6) % 7));
  const week = 1 + Math.round((d - jan4) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// Pick the weakest topic from problem metas: most WA runs; ties → lower AC
// rate. Topics need ≥2 attempts to qualify; falls back to the most-practiced
// topic, then null (caller substitutes a generic topic).
function findWeakness(metas) {
  const buckets = {}; // topic -> { topic, attempts, solved, waCount }
  for (const m of metas || []) {
    if ((m.tags || []).includes("boss")) continue; // bosses don't count against you
    const topic = (m.topic || (Array.isArray(m.tags) && m.tags[0]) || "").trim().toLowerCase();
    if (!topic) continue;
    const b = buckets[topic] || (buckets[topic] = { topic, attempts: 0, solved: 0, waCount: 0 });
    b.attempts += 1;
    const history = Array.isArray(m.history) ? m.history : [];
    if (m.status === "solved" || history.some((h) => h.verdict === "AC")) b.solved += 1;
    b.waCount += history.filter((h) => h.verdict === "WA").length;
  }
  const all = Object.values(buckets);
  if (!all.length) return null;
  const qualified = all.filter((b) => b.attempts >= 2);
  const pool = qualified.length ? qualified : all;
  pool.sort((a, b) =>
    (b.waCount - a.waCount) ||
    ((a.solved / a.attempts) - (b.solved / b.attempts)) ||
    (b.attempts - a.attempts));
  return pool[0];
}

// ---------------------------------------------------------------------------
// Registry (data/boss.json): { weeks: { "2026-W24": { problemId, topic, taunt,
// rating, xpReward, summonedAt } } }
// ---------------------------------------------------------------------------

async function readRegistry() {
  const raw = await fileStore.readJson(REGISTRY_FILE, null);
  return raw && typeof raw === "object" && raw.weeks ? raw : { weeks: {} };
}

async function writeRegistry(reg) {
  await fileStore.writeJson(REGISTRY_FILE, reg);
}

// ---------------------------------------------------------------------------
// Status + summon
// ---------------------------------------------------------------------------

// XP the boss pays on first AC (mirrors progress.js: hard 70 × boss ×3).
const BOSS_XP_REWARD = 210;

async function getStatus(now = new Date()) {
  const week = isoWeekId(now);
  const reg = await readRegistry();
  const entry = reg.weeks[week] || null;

  if (!entry) {
    // No boss yet this week — offer the weakness pitch for the summon card.
    const summaries = await problemStore.listProblems();
    const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
    const weakness = findWeakness(metas);
    return { week, boss: null, canSummon: true, weakness, xpReward: BOSS_XP_REWARD };
  }

  // Derive battle state from the problem itself.
  let meta = null;
  try { meta = await problemStore.readMeta(entry.problemId); } catch { /* deleted */ }
  const exists = meta && await problemStore.problemExists(entry.problemId);
  const history = (meta && Array.isArray(meta.history)) ? meta.history : [];
  const defeated = exists && history.some((h) => h.verdict === "AC");
  const attempts = history.length;
  return {
    week,
    canSummon: false,
    xpReward: BOSS_XP_REWARD,
    boss: {
      ...entry,
      exists: Boolean(exists),
      title: meta ? meta.title : entry.title || "(boss đã bị xóa)",
      status: defeated ? "defeated" : "alive",
      attempts
    }
  };
}

let summoning = false; // module-level lock — one summon at a time

async function summon({ aiSettings, judgeSettings, now = new Date() }) {
  const week = isoWeekId(now);
  const reg = await readRegistry();
  if (reg.weeks[week]) {
    const err = new Error("Tuần này đã có boss rồi — hạ gục nó trước đã!");
    err.status = 409;
    throw err;
  }
  if (summoning) {
    const err = new Error("Đang triệu hồi boss, chờ chút…");
    err.status = 429;
    throw err;
  }
  summoning = true;
  try {
    const summaries = await problemStore.listProblems();
    const metas = await Promise.all(summaries.map((s) => problemStore.readMeta(s.id)));
    const weakness = findWeakness(metas) || { topic: "mảng và vòng lặp", attempts: 0, solved: 0, waCount: 0 };
    const recentTitles = summaries.slice(0, 15).map((s) => s.title);

    const boss = await ai.generateBoss({ settings: aiSettings, weakness, recentTitles });

    // Verify AI test answers by EXECUTING a reference solution (best-effort —
    // unverifiable tests keep the AI answer but are flagged in their reason).
    const tests = [
      ...boss.samples.map((s, i) => ({ name: `sample-${i + 1}`, input: s.input, expected: s.expected, reason: s.explanation || "sample" })),
      ...boss.tests
    ];
    let verifyNote = "";
    try {
      const v = await verifyTests.verifyWithReference({
        aiSettings, judgeSettings,
        statement: boss.statement, code: "",
        tests, samples: boss.samples.map((s) => ({ input: s.input, output: s.expected }))
      });
      verifyNote = v.note || "";
    } catch (error) {
      verifyNote = "Chưa kiểm chứng được test bằng lời giải tham chiếu: " + error.message;
    }

    const title = `⚔️ Boss ${week} — ${boss.title}`;
    const meta = await problemStore.createProblem({
      title,
      topic: weakness.topic,
      tags: ["boss", ...boss.tags.filter((t) => t !== "boss")],
      difficulty: "hard",
      status: "learning",
      source: "Weekend Boss",
      statement: boss.statement,
      notes: `# ${title}\n\n> ${boss.taunt}\n\n- Topic mục tiêu: **${weakness.topic}** (${weakness.waCount} WA gần đây)\n- Phần thưởng: **+${BOSS_XP_REWARD} XP** khi AC lần đầu\n${verifyNote ? `- ${verifyNote}\n` : ""}`,
      analysis: boss.rating ? { cfRating: boss.rating } : undefined,
      tests: tests.map((t) => ({ input: t.input, expected: t.expected, name: t.name, reason: t.reason, generatedBy: "ai" }))
    });

    reg.weeks[week] = {
      problemId: meta.id,
      title,
      topic: weakness.topic,
      taunt: boss.taunt,
      rating: boss.rating,
      xpReward: BOSS_XP_REWARD,
      summonedAt: new Date().toISOString()
    };
    await writeRegistry(reg);
    ai.log("Boss summoned", `${week} → ${meta.id}`);
    return getStatus(now);
  } finally {
    summoning = false;
  }
}

module.exports = { isoWeekId, findWeakness, getStatus, summon, BOSS_XP_REWARD };
