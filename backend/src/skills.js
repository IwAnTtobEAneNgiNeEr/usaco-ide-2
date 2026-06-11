"use strict";

// skills.js — the Skill Constellation engine behind /api/stats/skills.
//
// Like progress.js, everything is DERIVED deterministically from meta.history
// and meta.topic/tags — no new storage. The map groups every topic the student
// has ever tagged into a fixed CP curriculum of clusters (nền tảng → đồ thị →
// DP → …), and scores each topic with a 0-100 mastery that blends volume,
// reliability and recency. The frontend renders this as a Duolingo-style
// winding path per cluster.

// ---------------------------------------------------------------------------
// Curriculum clusters — keyword → cluster routing (diacritics-insensitive)
// ---------------------------------------------------------------------------

const CLUSTERS = [
  {
    id: "foundation", name: "Nền tảng", icon: "🧱",
    keys: ["implementation", "simulation", "ad hoc", "adhoc", "brute", "basic", "co ban", "mo phong", "cai dat", "io", "constructive", "array", "mang", "vector", "loop", "vong lap"]
  },
  {
    id: "math", name: "Toán & Số học", icon: "🧮",
    keys: ["math", "number theory", "so hoc", "toan", "combinatorics", "to hop", "modular", "gcd", "prime", "sieve", "probability", "xac suat", "matrix", "bitwise", "bit manipulation"]
  },
  {
    id: "greedy-sort", name: "Greedy & Sắp xếp", icon: "⚖️",
    keys: ["greedy", "tham lam", "sort", "sap xep", "interval", "scheduling", "exchange argument"]
  },
  {
    id: "search", name: "Tìm kiếm & Hai con trỏ", icon: "🔍",
    keys: ["binary search", "chat nhi phan", "ternary", "two pointer", "hai con tro", "sliding window", "cua so truot", "meet in the middle", "tim kiem", "prefix", "tien to", "difference array"]
  },
  {
    id: "ds", name: "Cấu trúc dữ liệu", icon: "🗃️",
    keys: ["data structure", "cau truc", "stack", "queue", "deque", "heap", "priority", "dsu", "union find", "disjoint", "segment tree", "cay phan doan", "fenwick", "bit ", "sparse table", "trie", "ordered set", "monotonic"]
  },
  {
    id: "strings", name: "Xử lý xâu", icon: "🔤",
    keys: ["string", "xau", "kmp", "z-function", "z function", "hashing", "hash", "palindrome", "suffix", "aho"]
  },
  {
    id: "graphs", name: "Đồ thị & Cây", icon: "🕸️",
    keys: ["graph", "do thi", "bfs", "dfs", "dijkstra", "bellman", "floyd", "shortest", "duong di", "mst", "kruskal", "prim", "topo", "scc", "bridge", "cau khop", "tree", "cay", "lca", "binary lifting", "flood fill", "flow", "matching", "functional graph", "euler"]
  },
  {
    id: "dp", name: "Quy hoạch động", icon: "🧩",
    keys: ["dp", "dynamic", "quy hoach", "knapsack", "cai tui", "lis", "bitmask", "digit dp", "memo"]
  },
  {
    id: "geometry", name: "Hình học", icon: "📐",
    keys: ["geometry", "hinh hoc", "convex", "cross product", "sweep"]
  }
];

const OTHER_CLUSTER = { id: "other", name: "Khác", icon: "✨", keys: [] };

// Vietnamese-diacritics-insensitive normalize, mirrors the frontend topic filter.
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function clusterOf(topic) {
  const t = ` ${fold(topic)} `;
  for (const c of CLUSTERS) {
    for (const k of c.keys) {
      if (t.includes(k.startsWith(" ") || k.endsWith(" ") ? k : ` ${k}`) || t.includes(`${k} `) || t.includes(k)) {
        return c;
      }
    }
  }
  return OTHER_CLUSTER;
}

// ---------------------------------------------------------------------------
// Per-problem digest (chronological scan of newest-first history)
// ---------------------------------------------------------------------------

function digest(meta) {
  const runs = Array.isArray(meta.history) ? meta.history.slice().reverse() : [];
  let firstAcAt = null, ac = 0, wa = 0, lastRunAt = "";
  for (const h of runs) {
    if (h.verdict === "AC") { ac += 1; if (!firstAcAt) firstAcAt = h.at || null; }
    else if (h.verdict === "WA") wa += 1;
    if (h.at && h.at > lastRunAt) lastRunAt = h.at;
  }
  const solved = Boolean(firstAcAt) || meta.status === "solved" || meta.lastVerdict === "AC";
  return { solved, ac, wa, firstAcAt, lastRunAt };
}

// ---------------------------------------------------------------------------
// Mastery: volume (≤60) + reliability (≤20) + recency (≤20)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86400000;

function masteryOf(t, nowMs) {
  const volume = Math.min(60, t.solved * 15);                 // 4 solved = full volume
  const rate = t.total > 0 ? t.solved / t.total : 0;
  const reliability = Math.round(20 * rate);
  let recency = 0;
  if (t.lastAt) {
    const days = (nowMs - Date.parse(t.lastAt)) / MS_PER_DAY;
    if (days <= 3) recency = 20;
    else if (days <= 7) recency = 15;
    else if (days <= 14) recency = 10;
    else if (days <= 30) recency = 5;
  }
  return Math.min(100, volume + reliability + recency);
}

const TIERS = [
  { id: "diamond", name: "Kim cương", min: 85 },
  { id: "gold", name: "Vàng", min: 60 },
  { id: "silver", name: "Bạc", min: 35 },
  { id: "bronze", name: "Đồng", min: 15 },
  { id: "seed", name: "Hạt giống", min: 0 }
];

function tierOf(mastery) {
  for (const t of TIERS) if (mastery >= t.min) return t;
  return TIERS[TIERS.length - 1];
}

// ---------------------------------------------------------------------------
// computeSkillMap(metas, { now }) — the whole constellation
// ---------------------------------------------------------------------------

function computeSkillMap(metas, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();

  // topic -> aggregate
  const topicMap = {};
  for (const meta of metas) {
    const raw = (meta.topic || (Array.isArray(meta.tags) && meta.tags[0]) || "").trim();
    const topic = raw ? raw.toLowerCase() : "khác";
    const d = digest(meta);
    const t = topicMap[topic] || (topicMap[topic] = {
      topic, total: 0, solved: 0, acRuns: 0, waRuns: 0, lastAt: "", problems: []
    });
    t.total += 1;
    if (d.solved) t.solved += 1;
    t.acRuns += d.ac;
    t.waRuns += d.wa;
    const touched = d.lastRunAt || meta.updatedAt || "";
    if (touched > t.lastAt) t.lastAt = touched;
    t.problems.push({
      id: meta.id,
      title: meta.title || meta.id,
      solved: d.solved,
      lastVerdict: meta.lastVerdict || null,
      difficulty: meta.difficulty || "unrated",
      updatedAt: meta.updatedAt || ""
    });
  }

  // Score topics + route into clusters.
  const byCluster = {};
  for (const t of Object.values(topicMap)) {
    t.mastery = masteryOf(t, nowMs);
    const tier = tierOf(t.mastery);
    t.tier = tier.id;
    t.tierName = tier.name;
    // newest activity first; cap so the payload stays light
    t.problems.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    t.problems = t.problems.slice(0, 12);
    const c = clusterOf(t.topic);
    (byCluster[c.id] || (byCluster[c.id] = { ...c, topics: [] })).topics.push(t);
  }

  // Cluster order follows the curriculum; "Khác" sinks to the end.
  const order = [...CLUSTERS.map((c) => c.id), OTHER_CLUSTER.id];
  const clusters = order
    .filter((id) => byCluster[id])
    .map((id) => {
      const c = byCluster[id];
      c.topics.sort((a, b) => (b.mastery - a.mastery) || (b.total - a.total));
      const weight = c.topics.reduce((s, t) => s + t.total, 0) || 1;
      c.mastery = Math.round(c.topics.reduce((s, t) => s + t.mastery * t.total, 0) / weight);
      delete c.keys;
      return c;
    });

  const allTopics = Object.values(topicMap);
  const mastered = allTopics.filter((t) => t.mastery >= 60).length;
  const avgMastery = allTopics.length
    ? Math.round(allTopics.reduce((s, t) => s + t.mastery, 0) / allTopics.length)
    : 0;

  return {
    clusters,
    totals: { topics: allTopics.length, mastered, avgMastery, problems: metas.length }
  };
}

module.exports = { computeSkillMap, clusterOf, masteryOf, tierOf, fold };
