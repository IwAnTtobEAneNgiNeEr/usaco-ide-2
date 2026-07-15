// game-review.js — "Bảng Tổng Kết Ván Đấu" v3 (README-LOOPS.md task C3 + §6,
// redesigned per README-LOOPS-UX-CRITIQUE.md §4.1 — neon-ink, chess.com-level).
//
// The chess.com Game Review, honestly translated: every attempt is a MOVE and
// gets a deterministic classification (!! ✓ ! + · ?! ? ??) derived only from
// recorded signals — the delta in passed tests vs the previous attempt,
// whether a manual run preceded the submit, and how fast the resubmit came.
// An eval graph plots passed/total over the game; a move list reads like a
// score sheet. Every number still traces back to a recorded event
// (README-LOOPS.md §1.2) — the drama is in the presentation, never in
// invented data.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const RING_C = 289.03; // 2π · r(46) — must match .ring-arc stroke-dasharray
const RUSH_MS = 90_000; // resubmit faster than this without a manual run = "Nộp vội"

export function fmtDuration(ms) {
  if (!ms || ms <= 0) return "dưới 1 phút";
  const m = Math.round(ms / 60000);
  if (m < 1) return "dưới 1 phút";
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)}g ${m % 60}p`;
}

// Compact clock offset for the move list / eval axis: "42s", "+12p".
function fmtOffset(ms) {
  if (ms == null || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}p`;
  return `${Math.floor(m / 60)}g${m % 60}`;
}

// Tier: rank is carried by the 4-diamond meter (count), hue adds warmth —
// readable at a glance without the label (critique §4.1.3).
export function tierOf(score) {
  if (score >= 90) return { level: 4, label: "Ván đấu kỷ luật", rgb: "83, 220, 180" };
  if (score >= 75) return { level: 3, label: "Phong độ vững", rgb: "67, 200, 255" };
  if (score >= 60) return { level: 2, label: "Đang tiến bộ", rgb: "155, 124, 255" };
  return { level: 1, label: "Ván học được nhiều", rgb: "255, 195, 92" };
}

export function tierMeter(level) {
  let s = "";
  for (let i = 1; i <= 4; i += 1) s += `<span${i <= level ? ' class="on"' : ""}>◆</span>`;
  return `<span class="tier-meter">${s}</span>`;
}

// ---- move classification ----------------------------------------------------------
// Chess annotation glyphs, CP semantics. Rules fire ONLY on recorded signals;
// each classification can cite the exact fields that produced it.

const MOVE_KINDS = {
  brilliant: { cls: "mv-brilliant", g: "!!", label: "Nước xuất sắc" },
  winning:   { cls: "mv-winning",   g: "✓",  label: "Nước quyết định" },
  great:     { cls: "mv-great",     g: "!",  label: "Nước chuẩn" },
  good:      { cls: "mv-good",      g: "+",  label: "Tiến bộ" },
  book:      { cls: "mv-book",      g: "·",  label: "Khai cuộc" },
  hasty:     { cls: "mv-hasty",     g: "?!", label: "Khai cuộc vội" },
  stall:     { cls: "mv-stall",     g: "?",  label: "Giậm chân" },
  rush:      { cls: "mv-blunder",   g: "??", label: "Nộp vội" },
  blunder:   { cls: "mv-blunder",   g: "??", label: "Lùi bước" },
  plain:     { cls: "mv-book",      g: "·",  label: "Nộp bài" },
};

function classifyMoves(timeline) {
  const out = [];
  let stallNoted = false;
  for (let i = 0; i < timeline.length; i += 1) {
    const cur = timeline[i];
    const prev = i > 0 ? timeline[i - 1] : null;
    const dtMs = prev ? cur.t - prev.t : null;
    const delta =
      cur.passed != null && prev && prev.passed != null ? cur.passed - prev.passed : null;

    let kind;
    let note = null;

    if (cur.verdict === "AC") {
      if (cur.manualTestBeforeSubmit) {
        kind = MOVE_KINDS.brilliant;
        note = i === 0
          ? "AC ngay nước đầu, có chạy thử trước khi nộp — ván đấu mẫu mực."
          : "Khép ván sau khi tự kiểm tra bằng test tay — cách kết thúc của người chơi trình cao.";
      } else {
        kind = MOVE_KINDS.winning;
        if (i === 0) note = "AC ngay lần nộp đầu tiên.";
      }
    } else if (i === 0) {
      if (cur.manualTestBeforeSubmit) {
        kind = MOVE_KINDS.book;
      } else {
        kind = MOVE_KINDS.hasty;
        note = "Nộp lần đầu khi chưa chạy thử lần nào.";
      }
    } else if (delta == null) {
      kind = MOVE_KINDS.plain;
    } else if (delta > 0) {
      kind = cur.manualTestBeforeSubmit ? MOVE_KINDS.great : MOVE_KINDS.good;
    } else if (delta < 0) {
      kind = MOVE_KINDS.blunder;
      note = `Số test qua giảm ${prev.passed} → ${cur.passed} — sửa mới làm hỏng chỗ đã đúng.`;
    } else if (dtMs != null && dtMs < RUSH_MS && !cur.manualTestBeforeSubmit) {
      kind = MOVE_KINDS.rush;
      note = `Nộp lại sau ${fmtOffset(dtMs)}, không chạy thử — số test qua không đổi.`;
    } else {
      kind = MOVE_KINDS.stall;
      if (!stallNoted) {
        note = "Số test qua không đổi — có thể đang sửa nhầm chỗ. Đọc lại đề một lượt trước khi sửa tiếp.";
        stallNoted = true;
      }
    }
    if (kind !== MOVE_KINDS.stall) stallNoted = false;
    out.push({ kind, note, delta, dtMs });
  }
  return out;
}

// ---- coaching copy ---------------------------------------------------------------
// Positives FIRST, and there is always at least one — a student who just
// finished should never open this sheet and read only what went wrong.

export function derivePositives(a) {
  const out = [];
  const acFirstTry = a.acAt && a.attempts === 1;
  if (acFirstTry) out.push("<b>AC ngay lần nộp đầu tiên</b> — khai cuộc hoàn hảo.");
  if (a.manualTestRate >= 0.5 && !acFirstTry) {
    const n = a.timeline.filter((t) => t.manualTestBeforeSubmit).length;
    out.push(`<b>Tự kiểm tra trước khi nộp</b> (${n}/${a.timeline.length} lần) — thói quen của người chơi trình cao.`);
  }
  const passeds = a.timeline.map((t) => t.passed).filter((p) => p != null);
  if (passeds.length >= 2 && passeds.every((p, i) => i === 0 || p >= passeds[i - 1]) && passeds[passeds.length - 1] > passeds[0]) {
    out.push("<b>Mỗi lần nộp đều qua nhiều test hơn</b> — em đi đúng hướng, không sửa mò.");
  }
  if (a.acAt && a.attempts > 1) out.push(`<b>Không bỏ cuộc</b>: ${a.attempts} lần nộp và kết thúc bằng AC.`);
  if (a.acAt && a.totalMs > 0 && a.totalMs < 10 * 60000) {
    out.push(`<b>Tốc độ tốt</b> — khép lại ván đấu trong ${fmtDuration(a.totalMs)}.`);
  }
  if (out.length === 0) out.push("Em đã vào trận và để lại dữ liệu để học — <b>đó là bước quan trọng nhất</b>.");
  return out;
}

function deriveGrowth(a) {
  const out = [];
  if (a.manualTestRate === 0 && a.attempts > 1) {
    out.push("Thử một lần <b>Run tay</b> trước khi nộp — em sẽ bắt được lỗi sớm hơn cả máy chấm.");
  }
  if (a.repeatedNoProgressCount > 0) {
    out.push(`Có <b>${a.repeatedNoProgressCount} lần nộp liền</b> không tăng số test qua. Nước tiếp theo: đọc lại đề một lượt trước khi sửa code.`);
  }
  if (a.debugRatio > 0.6 && a.attempts > 1) {
    out.push("Phần lớn thời gian nằm <b>sau WA đầu tiên</b>. Mẹo: viết một test nhỏ bằng tay trước khi lao vào sửa.");
  }
  if (!a.acAt) {
    out.push("Ván này <b>chưa AC</b> — quay lại với góc nhìn mới, hoặc để Pháp y chỉ điểm test làm em sai.");
  }
  return out;
}

// ---- eval graph (the chess.com evaluation chart, honest axis) ---------------------
// X = attempt index (even spacing, time offsets labeled underneath).
// Y = fraction of tests passed. The move list below is the accessible,
// screen-reader-friendly table for the same data.

function buildEvalChart(timeline, moves, sessionStart) {
  const n = timeline.length;
  if (n < 2) return "";
  const W = 640, H = 150, PL = 36, PR = 14, PT = 14, PB = 24;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const x = (i) => PL + (i * plotW) / (n - 1);
  const ratio = (t) => {
    if (t.total) return Math.max(0, Math.min(1, (t.passed || 0) / t.total));
    return t.verdict === "AC" ? 1 : 0;
  };
  const y = (r) => PT + (1 - r) * plotH;

  const grid = [1, 0.5, 0].map((r) =>
    `<line class="ev-grid" x1="${PL}" y1="${y(r)}" x2="${W - PR}" y2="${y(r)}"></line>
     <text class="ev-grid-label" x="${PL - 6}" y="${y(r) + 3}" text-anchor="end">${Math.round(r * 100)}%</text>`
  ).join("");

  let line = `M ${x(0)} ${y(ratio(timeline[0]))}`;
  for (let i = 1; i < n; i += 1) {
    line += ` L ${x(i)} ${y(ratio(timeline[i - 1]))} L ${x(i)} ${y(ratio(timeline[i]))}`;
  }
  const area = `${line} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const dots = timeline.map((t, i) => {
    const isAC = t.verdict === "AC";
    const showLabel = i % labelEvery === 0 || i === n - 1;
    return `<circle class="ev-dot ${moves[i].kind.cls}" cx="${x(i)}" cy="${y(ratio(t))}" r="${isAC ? 5.5 : 4.5}"></circle>
      ${showLabel ? `<text class="ev-time" x="${x(i)}" y="${H - 8}">+${fmtOffset(t.t - sessionStart)}</text>` : ""}`;
  }).join("");

  return `<div class="gr-eval" aria-hidden="true">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${grid}
      <path class="ev-area" d="${area}"></path>
      <path class="ev-line" d="${line}"></path>
      ${dots}
    </svg>
  </div>`;
}

// ---- move list (the score sheet — also the accessible table for the chart) --------

function renderMoves(timeline, moves, sessionStart) {
  return timeline.map((t, i) => {
    const m = moves[i];
    const v = t.verdict ? `<span class="vbadge v-${escapeHtml(t.verdict)}">${escapeHtml(t.verdict)}</span>` : "—";
    const counts = t.total != null ? `${t.passed}/${t.total}` : "—";
    const delta = m.delta == null
      ? ""
      : m.delta > 0
        ? `<span class="mv-delta up">▲+${m.delta}</span>`
        : m.delta < 0
          ? `<span class="mv-delta down">▼${m.delta}</span>`
          : `<span class="mv-delta flat">=</span>`;
    const hand = t.manualTestBeforeSubmit ? ` <span class="mv-delta up" title="Có test tay trước lần nộp này">✓run</span>` : "";
    return `<div class="gr-move ${m.kind.cls}">
      <span class="mv-idx">${i + 1}</span>
      <span class="mv-time">+${fmtOffset(t.t - sessionStart)}</span>
      <span>${v}</span>
      <span class="mv-tests">${counts} ${delta}</span>
      <span class="mv-class"><span class="doc-glyph">${m.kind.g}</span><span class="mv-label">${m.kind.label}${hand}</span></span>
    </div>${m.note ? `<div class="gr-move-note">${escapeHtml(m.note)}</div>` : ""}`;
  }).join("");
}

// ---- phase bar (time spent writing vs debugging) ----------------------------------

function renderPhase(a, sessionStart) {
  if (a.attempts < 2 || !a.totalMs || a.totalMs <= 0) return "";
  const firstT = a.timeline[0].t;
  const codeMs = Math.max(0, firstT - sessionStart);
  const debugMs = Math.max(0, a.totalMs - codeMs);
  const codePct = Math.round((codeMs / a.totalMs) * 100);
  const debugPct = 100 - codePct;
  return `<div class="doc-section gr-phase">
    <div class="doc-section-title"><span class="doc-glyph" style="--g: var(--doc-amber)">%</span> Nhịp thời gian</div>
    <div class="gr-phase-bar">
      ${codePct > 0 ? `<span class="ph-code" style="flex-basis:${codePct}%"></span>` : ""}
      ${debugPct > 0 ? `<span class="ph-debug" style="flex-basis:${debugPct}%"></span>` : ""}
    </div>
    <div class="gr-phase-legend">
      <span><span class="ph-dot code"></span>Trước lần nộp đầu <b>${fmtDuration(codeMs)}</b> (${codePct}%)</span>
      <span><span class="ph-dot debug"></span>Sau lần nộp đầu <b>${fmtDuration(debugMs)}</b> (${debugPct}%)</span>
    </div>
  </div>`;
}

function renderInsights(items, kind) {
  const icon = kind === "good" ? "✦" : "→";
  return items.map((html) =>
    `<div class="doc-insight di-${kind}"><span class="di-icon">${icon}</span><span>${html}</span></div>`
  ).join("");
}

function renderSheet(data, app) {
  const a = data.analysis;
  const title = (app.state.meta && app.state.meta.title) || "Bài hiện tại";
  if (!a || a.attempts === 0) {
    return `<div class="doc-sheet">
      <div class="doc-kicker">Tổng kết ván đấu</div>
      <h3 class="doc-title">${escapeHtml(title)}</h3>
      <p class="gr-hero-line">Chưa có lần nộp nào trong phiên này — bấm <b>Judge</b> một lần rồi quay lại, bảng tổng kết sẽ có chuyện để kể.</p>
    </div>`;
  }
  const score = a.score.value;
  const tier = tierOf(score);
  const sessionStart = a.timeline[a.timeline.length - 1].t - a.totalMs;
  const moves = classifyMoves(a.timeline);
  const positives = derivePositives(a);
  const growth = deriveGrowth(a);
  const heroLine = a.acAt
    ? `Khép lại bằng <b>AC</b> sau <b>${a.attempts}</b> lần nộp · ${fmtDuration(a.totalMs)}.`
    : `<b>${a.attempts}</b> lần nộp trong ${fmtDuration(a.totalMs)} — ván đấu còn mở.`;
  const today = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  return `<div class="doc-sheet" style="--tier-rgb: ${tier.rgb}">
    <div class="doc-kicker">Tổng kết ván đấu</div>
    <h3 class="doc-title">${escapeHtml(title)}</h3>
    <div class="doc-meta"><span>${today}</span><span><b>${a.attempts}</b> lần nộp</span><span>phiên thứ <b>${data.sessionCount}</b></span></div>

    <div class="gr-hero">
      <div class="ring-wrap" id="gr-ring" style="--ring-target:${(RING_C * (1 - score / 100)).toFixed(2)}">
        <svg viewBox="0 0 108 108" aria-hidden="true">
          <circle class="ring-track" cx="54" cy="54" r="46"></circle>
          <circle class="ring-arc" cx="54" cy="54" r="46"></circle>
        </svg>
        <div class="ring-label"><span class="ring-num">${score}</span><span class="ring-sub">quy trình</span></div>
      </div>
      <div class="gr-hero-copy">
        <div class="doc-tier">${tierMeter(tier.level)} ${tier.label}</div>
        <div class="gr-hero-line">${heroLine}</div>
      </div>
    </div>

    <div class="doc-rule">◆</div>

    <div class="doc-section">
      <div class="doc-section-title"><span class="doc-glyph">≡</span> Diễn biến ván đấu</div>
      ${buildEvalChart(a.timeline, moves, sessionStart)}
      <div class="gr-moves">${renderMoves(a.timeline, moves, sessionStart)}</div>
    </div>

    <div class="doc-section">
      <div class="doc-section-title"><span class="doc-glyph" style="--g: var(--doc-green)">✦</span> Điểm sáng</div>
      ${renderInsights(positives, "good")}
    </div>
    ${growth.length ? `<div class="doc-section">
      <div class="doc-section-title"><span class="doc-glyph">→</span> Nước cải thiện</div>
      ${renderInsights(growth, "grow")}
    </div>` : ""}

    ${renderPhase(a, sessionStart)}

    <div class="doc-foot">
      <div class="doc-fine">Điểm quy trình đo cách em chơi, không đo em là ai — công thức công khai:<br>${escapeHtml(a.score.formula)}</div>
      <div class="doc-seal" aria-hidden="true"><span class="seal-top">USACO IDE</span><span class="seal-mid">‹/›</span><span class="seal-bot">TỔNG KẾT</span></div>
    </div>
  </div>`;
}

export function initGameReview(app) {
  const btn = document.getElementById("btn-game-review");
  const modal = document.getElementById("game-review-modal");
  const body = document.getElementById("game-review-body");
  const closeBtn = document.getElementById("game-review-close");
  if (!modal || !body) return; // markup not present — feature off

  const closeModal = () => modal.classList.add("hidden");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  async function open() {
    if (!app.state.currentId) return;
    const pid = app.state.currentId;
    body.innerHTML = `<p class="muted"><span class="spinner"></span> Đang lật lại từng nước đi…</p>`;
    modal.classList.remove("hidden");
    try {
      const res = await api.gameReview(pid);
      if (app.state.currentId !== pid) { closeModal(); return; } // switched problems mid-flight
      body.innerHTML = renderSheet(res, app);
      const ring = body.querySelector("#gr-ring");
      if (ring) requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.add("is-on")));
    } catch (err) {
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  }

  if (btn) btn.addEventListener("click", open);
  app.openGameReview = open; // verdict rail's "Xem lại ván đấu" entry point
}
