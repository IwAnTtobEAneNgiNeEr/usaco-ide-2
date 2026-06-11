// dashboard.js — Progress Analytics. Aggregates every problem's metadata +
// run history into a dashboard: totals, an 8-week activity heatmap, current
// streak, and distributions (verdict mix, status, difficulty, USACO tier, CF
// rating buckets, top topics). Builds its own modal; triggered by #btn-dashboard.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("dashboard-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "dashboard-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide dash-modal">
      <h2 class="modal-title">📊 Tiến độ của bạn</h2>
      <div id="dash-body" class="dash-body"></div>
      <div class="modal-actions">
        <button type="button" id="dash-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

// Horizontal labelled bar list from an object of {key: count}.
function barList(obj, palette) {
  const entries = Object.entries(obj || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="muted" style="font-size:12px">Chưa có dữ liệu.</div>`;
  const max = Math.max(...entries.map((e) => e[1]));
  return `<div class="dash-bars">` + entries.map(([k, v]) => `
    <div class="dash-bar-row">
      <span class="dash-bar-key">${escapeHtml(k)}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${Math.max(6, (v / max) * 100)}%;background:${palette(k)}"></span></span>
      <span class="dash-bar-val">${v}</span>
    </div>`).join("") + `</div>`;
}

const VERDICT_COLORS = { AC: "#2dd47e", WA: "#ff5d6c", RE: "#d23b4a", CE: "#b69bff", TLE: "#f2c044", MLE: "#ff9d52", none: "#5b6b85" };
const TIER_COLORS = { Bronze: "#cd7f32", Silver: "#c0c8d4", Gold: "#f2c044", Platinum: "#5fd0c8" };
const ACCENT = "#5b9bff";

function renderReview(items) {
  if (!items || !items.length) {
    return `<p class="muted" style="font-size:12.5px">Chưa có bài nào đến lượt ôn. Hệ thống ngắt quãng dùng 3 → 7 → 21 ngày sau lần ôn gần nhất.</p>`;
  }
  return `<div class="dash-review">` + items.map((it) => `
    <div class="dash-rv" data-id="${escapeHtml(it.id)}">
      <div class="dash-rv-main">
        <div class="dash-rv-title">${escapeHtml(it.title)}</div>
        <div class="dash-rv-meta">
          ${it.waBeforeAc > 0 ? `<span class="dash-rv-badge dash-rv-badge-wa">${it.waBeforeAc} WA trước AC</span>` : `<span class="dash-rv-badge">AC luôn</span>`}
          <span class="muted">·</span>
          <span class="muted">${it.daysSinceReview} ngày kể từ ôn lần trước</span>
          ${it.topic ? `<span class="muted">·</span><span class="muted">${escapeHtml(it.topic)}</span>` : ""}
        </div>
      </div>
      <div class="dash-rv-actions">
        <button type="button" class="btn btn-primary btn-sm dash-rv-open" data-id="${escapeHtml(it.id)}">Giải lại</button>
        <button type="button" class="btn btn-ghost btn-sm dash-rv-done" data-id="${escapeHtml(it.id)}">Đã ôn</button>
      </div>
    </div>`).join("") + `</div>`;
}

function render(s, review) {
  const t = s.totals || {};
  const card = (label, val, sub) => `
    <div class="dash-card">
      <div class="dash-card-val">${val}</div>
      <div class="dash-card-label">${label}</div>
      ${sub ? `<div class="dash-card-sub">${sub}</div>` : ""}
    </div>`;

  // Activity heatmap (8 weeks × 7 days, column = week).
  const cells = (s.heatmap || []);
  const maxC = Math.max(1, ...cells.map((c) => c.count));
  const level = (c) => c === 0 ? 0 : c >= maxC * 0.75 ? 4 : c >= maxC * 0.5 ? 3 : c >= maxC * 0.25 ? 2 : 1;
  const heat = `<div class="dash-heat">` + cells.map((c) =>
    `<span class="dash-heat-cell lvl-${level(c.count)}" title="${c.date}: ${c.count} lần chạy"></span>`).join("") + `</div>`;

  const solveRate = t.problems ? Math.round((t.solved / t.problems) * 100) : 0;

  const reviewSection = `
    <div class="dash-section">
      <div class="dash-h">🔁 Ôn tập hôm nay${review && review.length ? ` <span class="muted" style="font-weight:400">· ${review.length} bài đến lượt</span>` : ""}</div>
      ${renderReview(review)}
    </div>`;

  return reviewSection + `
    <div class="dash-cards">
      ${card("Bài tập", t.problems || 0, `${solveRate}% đã giải`)}
      ${card("Đã giải", t.solved || 0)}
      ${card("Lượt chạy", t.totalRuns || 0)}
      ${card("Chuỗi ngày", `${t.streak || 0}🔥`)}
      ${card("CF trung bình", t.cfAvg ? `~${t.cfAvg}` : "—")}
    </div>

    <div class="dash-section">
      <div class="dash-h">Hoạt động (8 tuần)</div>
      ${heat}
    </div>

    <div class="dash-grid">
      <div class="dash-section"><div class="dash-h">Verdict (mọi lượt chạy)</div>${barList(s.verdictRuns, (k) => VERDICT_COLORS[k] || ACCENT)}</div>
      <div class="dash-section"><div class="dash-h">Trạng thái bài</div>${barList(s.byStatus, () => ACCENT)}</div>
      <div class="dash-section"><div class="dash-h">Độ khó</div>${barList(s.byDifficulty, () => "#7b86ff")}</div>
      <div class="dash-section"><div class="dash-h">USACO Tier</div>${barList(s.byTier, (k) => TIER_COLORS[k] || ACCENT)}</div>
      <div class="dash-section"><div class="dash-h">CF rating</div>${barList(s.cfBuckets, () => ACCENT)}</div>
      <div class="dash-section"><div class="dash-h">Chủ đề hay gặp</div>${barList(Object.fromEntries((s.topTopics || []).map((x) => [x.name, x.count])), () => "#9b82ff")}</div>
    </div>`;
}

export function initDashboard(app) {
  const trigger = document.getElementById("btn-dashboard");
  if (!trigger) return;
  const modal = buildModal();
  const body = modal.querySelector("#dash-body");
  const close = () => modal.classList.add("hidden");
  modal.querySelector("#dash-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  async function load() {
    body.innerHTML = `<p class="muted"><span class="spinner"></span> Đang tổng hợp…</p>`;
    try {
      const [s, rq] = await Promise.all([
        api.stats(),
        api.reviewQueue().catch(() => ({ items: [] })) // queue is non-essential
      ]);
      body.innerHTML = render(s, (rq && rq.items) || []);
    } catch (err) {
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  }

  // Wire the Review queue's per-row actions via delegation, so re-rendering
  // after "Đã ôn" doesn't leak listeners.
  body.addEventListener("click", async (e) => {
    const openBtn = e.target.closest(".dash-rv-open");
    const doneBtn = e.target.closest(".dash-rv-done");
    if (openBtn) {
      const id = openBtn.dataset.id;
      close();
      if (app.selectProblem) app.selectProblem(id);
      return;
    }
    if (doneBtn) {
      const id = doneBtn.dataset.id;
      const row = doneBtn.closest(".dash-rv");
      doneBtn.disabled = true;
      try {
        // Bump review count + stamp the time so the next due date shifts.
        const cur = await api.getProblem(id);
        const c = (cur && cur.problem && Number(cur.problem.reviewCount)) || 0;
        await api.updateProblem(id, { reviewCount: c + 1, lastReviewedAt: new Date().toISOString() });
        if (row) row.remove();
        app.toast("Đã đánh dấu ôn xong — bài sẽ quay lại sau.", "ok");
      } catch (err) {
        doneBtn.disabled = false;
        app.toast(err.message, "err");
      }
    }
  });

  trigger.addEventListener("click", () => {
    modal.classList.remove("hidden");
    load();
  });
}
