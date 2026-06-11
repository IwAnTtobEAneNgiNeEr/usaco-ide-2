// skilltree.js — 🗺️ Skill Constellation.
//
// A full-screen mastery map over GET /api/stats/skills: every topic the
// student ever tagged, routed into a CP curriculum (nền tảng → đồ thị → DP …)
// and drawn as a winding path of progress-ring nodes per cluster — the
// Duolingo "path" feel, but derived 100% from real judge history. Clicking a
// node opens a detail rail: mastery breakdown, the problems behind the number,
// and one-click "luyện chủ đề này".

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const TIER_COLOR = {
  seed: "var(--st-seed)", bronze: "var(--st-bronze)", silver: "var(--st-silver)",
  gold: "var(--st-gold)", diamond: "var(--st-diamond)"
};
const TIER_BADGE = { seed: "🌱", bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎" };

const VERDICT_CLASS = { AC: "v-AC", WA: "v-WA", TLE: "v-TLE", RE: "v-RE", CE: "v-CE" };

// ---------------------------------------------------------------------------
// Cluster lane — one SVG per cluster: nodes on a gentle sine path, connected.
// ---------------------------------------------------------------------------

const NODE_GAP = 116;
const LANE_H = 168;

function laneSvg(cluster) {
  const topics = cluster.topics;
  const w = 70 + topics.length * NODE_GAP;
  const pts = topics.map((t, i) => ({
    x: 64 + i * NODE_GAP,
    y: LANE_H / 2 + Math.sin(i * 1.05) * 26 - 8,
    t
  }));

  // smooth connector path
  let path = "";
  if (pts.length > 1) {
    path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a.x + b.x) / 2;
      path += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    }
  }

  const R = 26, CIRC = 2 * Math.PI * R;
  const nodes = pts.map(({ x, y, t }) => {
    const frac = Math.max(0.02, t.mastery / 100);
    const color = TIER_COLOR[t.tier] || TIER_COLOR.seed;
    const label = t.topic.length > 14 ? t.topic.slice(0, 13) + "…" : t.topic;
    return `
      <g class="st-node" data-topic="${escapeHtml(t.topic)}" data-cluster="${cluster.id}" tabindex="0" role="button" aria-label="${escapeHtml(t.topic)} — ${t.mastery}/100">
        <circle cx="${x}" cy="${y}" r="${R + 7}" class="st-halo" fill="${color}"/>
        <circle cx="${x}" cy="${y}" r="${R}" class="st-ring-bg" fill="none"/>
        <circle cx="${x}" cy="${y}" r="${R}" class="st-ring" fill="none" stroke="${color}"
          stroke-dasharray="${(CIRC * frac).toFixed(1)} ${CIRC.toFixed(1)}" transform="rotate(-90 ${x} ${y})"/>
        <circle cx="${x}" cy="${y}" r="${R - 6}" class="st-core"/>
        <text x="${x}" y="${y - 3}" class="st-count">${t.solved}/${t.total}</text>
        <text x="${x}" y="${y + 11}" class="st-tier-emoji">${TIER_BADGE[t.tier] || "🌱"}</text>
        <text x="${x}" y="${y + R + 20}" class="st-label">${escapeHtml(label)}</text>
        <title>${escapeHtml(t.topic)} · ${t.tierName} · mastery ${t.mastery}/100</title>
      </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${LANE_H}" width="${w}" height="${LANE_H}" class="st-lane-svg">
    ${path ? `<path d="${path}" class="st-path" fill="none"/>` : ""}${nodes}
  </svg>`;
}

function renderMap(data) {
  if (!data.clusters.length) {
    return `
      <div class="st-empty">
        <div class="st-empty-glyph">🗺️</div>
        <h3>Bản đồ của bạn đang chờ ngôi sao đầu tiên</h3>
        <p>Gắn <b>topic</b> cho bài tập (dp, graphs, chặt nhị phân…) — mỗi chủ đề bạn luyện sẽ thắp sáng một node trên bản đồ này.</p>
        <button class="btn btn-primary" data-action="st-new">＋ Tạo bài có topic</button>
      </div>`;
  }
  return data.clusters.map((c) => `
    <section class="st-cluster" data-cluster="${c.id}">
      <header class="st-cluster-head">
        <span class="st-cluster-icon">${c.icon}</span>
        <span class="st-cluster-name">${escapeHtml(c.name)}</span>
        <span class="st-cluster-meta">${c.topics.length} chủ đề</span>
        <span class="st-cluster-bar"><span style="width:${c.mastery}%"></span></span>
        <span class="st-cluster-pct">${c.mastery}</span>
      </header>
      <div class="st-lane">${laneSvg(c)}</div>
    </section>`).join("");
}

// ---------------------------------------------------------------------------
// Detail rail
// ---------------------------------------------------------------------------

function renderDetail(t) {
  if (!t) {
    return `<div class="st-detail-empty">
      <p>Chọn một node để xem chi tiết chủ đề:<br/>độ thành thạo, lịch sử bài tập, và luyện ngay.</p>
      <div class="st-legend">
        ${Object.entries(TIER_BADGE).map(([k, e]) => `<span class="st-legend-row">${e} <i style="background:${TIER_COLOR[k]}"></i> ${{ seed: "Hạt giống (0-14)", bronze: "Đồng (15-34)", silver: "Bạc (35-59)", gold: "Vàng (60-84)", diamond: "Kim cương (85+)" }[k]}</span>`).join("")}
      </div>
      <p class="st-formula">Mastery = luyện nhiều (≤60) + tỉ lệ giải được (≤20) + mới luyện gần đây (≤20)</p>
    </div>`;
  }
  const probs = (t.problems || []).map((p) => `
    <button class="st-prob" data-action="st-open" data-id="${escapeHtml(p.id)}" type="button">
      <span class="st-prob-title">${escapeHtml(p.title)}</span>
      ${p.lastVerdict ? `<span class="vbadge ${VERDICT_CLASS[p.lastVerdict] || ""}">${escapeHtml(p.lastVerdict)}</span>` : `<span class="vbadge">—</span>`}
    </button>`).join("");
  const rel = t.lastAt ? relDays(t.lastAt) : "chưa có hoạt động";
  return `
    <div class="st-detail-head">
      <span class="st-detail-tier" style="color:${TIER_COLOR[t.tier]}">${TIER_BADGE[t.tier]}</span>
      <div>
        <h3 class="st-detail-topic">${escapeHtml(t.topic)}</h3>
        <span class="st-detail-tiername">${escapeHtml(t.tierName)} · mastery <b>${t.mastery}</b>/100</span>
      </div>
    </div>
    <div class="st-mastery-bar"><span style="width:${t.mastery}%; background:${TIER_COLOR[t.tier]}"></span></div>
    <div class="st-stats">
      <div class="st-stat"><b>${t.solved}</b><span>đã giải</span></div>
      <div class="st-stat"><b>${t.total}</b><span>tổng bài</span></div>
      <div class="st-stat"><b style="color:var(--ac)">${t.acRuns}</b><span>lần AC</span></div>
      <div class="st-stat"><b style="color:var(--wa)">${t.waRuns}</b><span>lần WA</span></div>
    </div>
    <div class="st-lastat">Hoạt động gần nhất: ${rel}</div>
    <div class="st-actions">
      <button class="btn btn-primary btn-sm" data-action="st-train" data-topic="${escapeHtml(t.topic)}" type="button">🎯 Luyện chủ đề này</button>
      <button class="btn btn-ghost btn-sm" data-action="st-new" data-topic="${escapeHtml(t.topic)}" type="button">＋ Bài mới</button>
    </div>
    <div class="st-problist-head">Bài tập (${(t.problems || []).length})</div>
    <div class="st-problist">${probs || '<p class="st-detail-muted">Chưa có bài nào.</p>'}</div>`;
}

function relDays(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (isNaN(ms)) return "—";
  const d = Math.floor(ms / 86400000);
  if (d <= 0) return "hôm nay";
  if (d === 1) return "hôm qua";
  if (d < 30) return `${d} ngày trước`;
  return `${Math.floor(d / 30)} tháng trước`;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function initSkillTree(app) {
  let overlay = null;
  let data = null;
  let selected = null; // topic object

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "skilltree-overlay";
    overlay.className = "modal-overlay hidden";
    overlay.innerHTML = `
      <div class="modal st-modal">
        <div class="st-head">
          <h2 class="modal-title">🗺️ Bản đồ kỹ năng</h2>
          <span id="st-totals" class="st-totals"></span>
          <span class="toolbar-spacer"></span>
          <button id="st-close" class="btn btn-ghost btn-sm" type="button">✕ Đóng</button>
        </div>
        <div class="st-body">
          <div id="st-map" class="st-map"></div>
          <aside id="st-detail" class="st-detail"></aside>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("#st-close").addEventListener("click", close);

    // node + action clicks (delegated — innerHTML re-renders are safe)
    overlay.addEventListener("click", (e) => {
      const node = e.target.closest(".st-node");
      if (node) { select(node.dataset.cluster, node.dataset.topic); return; }
      const act = e.target.closest("[data-action]");
      if (!act) return;
      const action = act.dataset.action;
      if (action === "st-open") {
        close();
        app.selectProblem(act.dataset.id);
      } else if (action === "st-train") {
        // Filter the explorer by this topic and get to work.
        close();
        if (app.goHome) app.goHome();
        if (app.el.search) {
          app.el.search.value = act.dataset.topic || "";
          app.el.search.dispatchEvent(new Event("input", { bubbles: true }));
        }
        app.toast(`Đã lọc bài theo “${act.dataset.topic}” — chọn một bài để luyện.`, "ok");
      } else if (action === "st-new") {
        close();
        app.openMetaModal(null);
        const form = app.el.metaForm;
        if (form && act.dataset.topic) form.topic.value = act.dataset.topic;
      }
    });
    // keyboard: Enter/Space activates a focused node
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const node = e.target.closest && e.target.closest(".st-node");
      if (node) { e.preventDefault(); select(node.dataset.cluster, node.dataset.topic); }
    });
  }

  function close() { overlay.classList.add("hidden"); }

  function select(clusterId, topic) {
    const c = data && data.clusters.find((x) => x.id === clusterId);
    selected = c && c.topics.find((t) => t.topic === topic) || null;
    overlay.querySelector("#st-detail").innerHTML = renderDetail(selected);
    overlay.querySelectorAll(".st-node").forEach((n) => {
      n.classList.toggle("selected", Boolean(selected) && n.dataset.topic === selected.topic && n.dataset.cluster === clusterId);
    });
  }

  function paint() {
    overlay.querySelector("#st-map").innerHTML = renderMap(data);
    overlay.querySelector("#st-detail").innerHTML = renderDetail(selected);
    const t = data.totals;
    overlay.querySelector("#st-totals").innerHTML =
      `<b>${t.topics}</b> chủ đề · <b>${t.mastered}</b> đạt Vàng+ · trung bình <b>${t.avgMastery}</b>/100`;
  }

  app.openSkillTree = async () => {
    if (!overlay) buildOverlay();
    overlay.classList.remove("hidden");
    overlay.querySelector("#st-map").innerHTML = `<p class="st-detail-muted" style="padding:30px">Đang dựng bản đồ…</p>`;
    try {
      data = await api.skillMap();
      selected = null;
      paint();
    } catch (err) {
      overlay.querySelector("#st-map").innerHTML = `<p class="st-detail-muted" style="padding:30px">Không tải được bản đồ: ${escapeHtml(err.message)}</p>`;
    }
  };
}
