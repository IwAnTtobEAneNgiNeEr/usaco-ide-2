// journey.js — the Journey progression layer: a real home screen (greeting,
// streak, XP level, daily quests, continue card, skill map, 7-day chart),
// topbar streak/XP chips, and post-judge celebrations (+XP toast, confetti,
// level-up overlay).
//
// All numbers come from GET /api/progress, which derives them from existing
// run history — this file only renders and celebrates; it never writes.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

// Rotating daily quotes — picked by date so the home feels alive but stable
// within a day.
const QUOTES = [
  "Mỗi AC hôm nay là một bậc thang cho kỳ thi ngày mai.",
  "WA không phải thất bại — đó là một test case bạn vừa học được.",
  "Code chậm mà nghĩ kỹ thắng code nhanh mà đoán mò.",
  "Thuật toán khó nhất là thuật toán bắt đầu.",
  "Streak hôm nay quan trọng hơn điểm số hôm qua.",
  "Đọc đề 2 lần, code 1 lần, debug 0 lần.",
  "Bạn không cần giỏi để bắt đầu, nhưng cần bắt đầu để giỏi.",
  "Một bài mỗi ngày — sau một năm là 365 bài."
];

const NAME_KEY = "usaco2.userName";

function userName() {
  try { return localStorage.getItem(NAME_KEY) || "bạn"; } catch { return "bạn"; }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function quoteOfDay() {
  const d = new Date();
  const idx = (d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()) % QUOTES.length;
  return QUOTES[idx];
}

const VERDICT_CLASS = { AC: "jh-v-ac", WA: "jh-v-wa", TLE: "jh-v-tle", RE: "jh-v-re", CE: "jh-v-ce" };

function stars(n) {
  let s = "";
  for (let i = 0; i < 5; i++) s += `<span class="jh-star ${i < n ? "on" : ""}">★</span>`;
  return s;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Quests that map to a one-click action become clickable shortcuts.
const QUEST_ACTION = { defense: "open-defense", review: "open-review" };

function renderQuests(quests) {
  const done = quests.filter((q) => q.done).length;
  const rows = quests.map((q) => {
    const act = !q.done && QUEST_ACTION[q.id];
    return `
    <div class="jh-quest ${q.done ? "done" : ""} ${act ? "actionable" : ""}" ${act ? `data-action="${act}"` : ""}>
      <span class="jh-quest-icon">${q.icon}</span>
      <div class="jh-quest-main">
        <div class="jh-quest-label">${escapeHtml(q.label)}${act ? ` <span class="jh-quest-go">→</span>` : ""}</div>
        <div class="jh-quest-track"><span style="width:${Math.round((q.progress / q.target) * 100)}%"></span></div>
      </div>
      <span class="jh-quest-state">${q.done ? "✓" : `${q.progress}/${q.target}`}</span>
      <span class="jh-quest-xp">+${q.xp} XP</span>
    </div>`;
  }).join("");
  return `
    <div class="jh-card-head">🗡️ Nhiệm vụ hôm nay <span class="jh-card-sub">${done}/${quests.length} xong</span></div>
    ${rows}`;
}

function renderContinue(p) {
  const c = p.continueProblem;
  if (!c) {
    return `
      <div class="jh-card-head">🚀 Bắt đầu</div>
      <p class="jh-muted">Chưa có bài nào. Tạo bài đầu tiên — dán ảnh đề là AI lo phần còn lại.</p>
      <div class="jh-actions"><button class="btn btn-primary" data-action="new-problem">＋ Bài đầu tiên</button></div>`;
  }
  const v = c.lastVerdict ? `<span class="jh-verdict ${VERDICT_CLASS[c.lastVerdict] || ""}">${escapeHtml(c.lastVerdict)}</span>` : "";
  const review = p.reviewDue > 0
    ? `<button class="btn btn-ghost btn-sm" data-action="open-review">🔁 Ôn tập <span class="jh-badge">${p.reviewDue}</span></button>`
    : "";
  return `
    <div class="jh-card-head">▶ Tiếp tục</div>
    <button class="jh-continue-card" data-action="open-problem" data-id="${escapeHtml(c.id)}">
      <span class="jh-continue-title">${escapeHtml(c.title)}</span>
      <span class="jh-continue-meta">
        ${v}
        ${c.topic ? `<span class="jh-tag">${escapeHtml(c.topic)}</span>` : ""}
        ${c.difficulty && c.difficulty !== "unrated" ? `<span class="jh-tag">${escapeHtml(c.difficulty)}</span>` : ""}
        <span class="jh-open-arrow">Mở bài →</span>
      </span>
    </button>
    <div class="jh-actions">
      <button class="btn btn-ghost btn-sm" data-action="new-problem">＋ Bài mới</button>
      ${review}
      <button class="btn btn-ghost btn-sm" data-action="open-contests">🏆 Contest</button>
      <button class="btn btn-ghost btn-sm" data-action="open-stats">📊 Thống kê</button>
      <button class="btn btn-ghost btn-sm" data-action="open-mistakes">📕 Sổ tay lỗi</button>
    </div>`;
}

function renderWeek(week) {
  const max = Math.max(1, ...week.map((d) => d.runs));
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const bars = week.map((d, i) => {
    const h = d.runs === 0 ? 4 : Math.max(10, Math.round((d.runs / max) * 56));
    const cls = d.ac > 0 ? "ac" : d.runs > 0 ? "on" : "";
    const dow = DOW[new Date(d.date + "T12:00:00").getDay()];
    return `
      <div class="jh-day ${i === week.length - 1 ? "today" : ""}" title="${d.date}: ${d.runs} lượt chạy, ${d.ac} AC">
        <span class="jh-day-bar ${cls}" style="height:${h}px"></span>
        <span class="jh-day-label">${dow}</span>
      </div>`;
  }).join("");
  const total = week.reduce((a, d) => a + d.runs, 0);
  return `
    <div class="jh-card-head">📈 7 ngày qua <span class="jh-card-sub">${total} lượt chạy</span></div>
    <div class="jh-week">${bars}</div>
    <div class="jh-legend"><span class="jh-dot jh-dot-ac"></span> ngày có AC <span class="jh-dot jh-dot-on"></span> có hoạt động</div>`;
}

function renderSkills(skills) {
  if (!skills.length) {
    return `<div class="jh-card-head">🗺️ Bản đồ kỹ năng</div>
      <p class="jh-muted">Gắn <b>topic</b> cho bài tập (dp, graphs, prefix sum…) để xây bản đồ kỹ năng của riêng bạn.</p>
      <div class="jh-actions"><button class="btn btn-ghost btn-sm" data-action="open-skilltree">🗺️ Xem bản đồ đầy đủ</button></div>`;
  }
  const rows = skills.slice(0, 6).map((s) => `
    <div class="jh-skill">
      <span class="jh-skill-name">${escapeHtml(s.topic)}</span>
      <span class="jh-skill-stars">${stars(s.stars)}</span>
      <span class="jh-skill-count">${s.solved}/${s.total}</span>
    </div>`).join("");
  return `<div class="jh-card-head">🗺️ Bản đồ kỹ năng <span class="jh-card-sub">${skills.length} chủ đề</span></div>${rows}
    <div class="jh-actions"><button class="btn btn-ghost btn-sm jh-skillmap-btn" data-action="open-skilltree">🗺️ Mở bản đồ đầy đủ →</button></div>`;
}

function renderOnboarding() {
  return `
    <div class="jh-hero">
      <div class="jh-hero-glyph">‹/›</div>
      <h2 class="jh-hero-title">Bắt đầu hành trình của bạn</h2>
      <p class="jh-hero-sub">3 bước để có lượt AC đầu tiên:</p>
      <div class="jh-steps">
        <div class="jh-step"><b>1.</b> Tạo bài mới <kbd>Ctrl·N</kbd></div>
        <div class="jh-step"><b>2.</b> Dán ảnh đề <kbd>Ctrl·V</kbd> — AI tự đọc đề &amp; tạo test</div>
        <div class="jh-step"><b>3.</b> Code rồi chấm <kbd>Ctrl·⇧·↵</kbd></div>
      </div>
      <button class="btn btn-primary jh-hero-cta" data-action="new-problem">＋ Tạo bài đầu tiên</button>
    </div>`;
}

function renderHome(p) {
  if (!p) return `<p class="jh-muted" style="padding:40px">Đang tải hành trình…</p>`;
  const x = p.xp;
  const streakCls = p.streak.todayActive ? "lit" : (p.streak.current > 0 ? "warm" : "");
  const body = p.totals.problems === 0 ? renderOnboarding() : `
    <section class="jh-level">
      <div class="jh-level-ring">
        <span class="jh-level-num">${x.level}</span>
      </div>
      <div class="jh-level-main">
        <div class="jh-level-name">${escapeHtml(x.levelName)}
          <span class="jh-level-today">${x.today > 0 ? `+${x.today} XP hôm nay` : "chưa có XP hôm nay"}</span>
        </div>
        <div class="jh-xpbar"><span class="jh-xpbar-fill" style="width:${x.pct}%"></span></div>
        <div class="jh-level-detail">${x.total} XP · còn ${Math.max(0, x.nextLevelAt - x.total)} XP nữa lên cấp ${x.level + 1}</div>
      </div>
    </section>

    <section id="jh-boss-host"></section>

    <div class="jh-grid">
      <section class="jh-card">${renderQuests(p.quests)}</section>
      <section class="jh-card">${renderContinue(p)}</section>
    </div>
    <div class="jh-grid">
      <section class="jh-card">${renderWeek(p.week)}</section>
      <section class="jh-card">${renderSkills(p.skills)}</section>
    </div>`;

  return `
    <div class="journey-home">
      <header class="jh-head">
        <div class="jh-head-text">
          <div class="jh-greet">${greeting()}, <span class="jh-name" title="Nhấp đúp để đổi tên">${escapeHtml(userName())}</span> 👋</div>
          <div class="jh-quote">“${escapeHtml(quoteOfDay())}”</div>
        </div>
        <div class="jh-streak ${streakCls}" title="Chuỗi ngày luyện tập liên tiếp · kỷ lục ${p.streak.best} ngày">
          <span class="jh-flame">🔥</span>
          <span class="jh-streak-num">${p.streak.current}</span>
          <span class="jh-streak-label">ngày<br/>kỷ lục ${p.streak.best}</span>
        </div>
      </header>
      ${body}
    </div>`;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function initJourney(app) {
  const host = app.el.editorEmpty;
  if (!host) return;
  host.classList.add("journey-mode");

  let last = null;        // previous snapshot, for delta detection
  let refreshTimer = null;

  // --- topbar chips (created here so index.html stays lean) ---
  const topActions = document.querySelector(".topbar-actions");
  const chipWrap = document.createElement("div");
  chipWrap.className = "jh-chips";
  chipWrap.innerHTML = `
    <button id="jh-chip-home" class="btn btn-ghost btn-sm" title="Trang chủ hành trình">🏠</button>
    <button id="jh-chip-streak" class="jh-chip" title="Chuỗi ngày luyện tập">🔥 <b>0</b></button>
    <button id="jh-chip-xp" class="jh-chip" title="Cấp độ &amp; XP">Lv <b>0</b></button>`;
  if (topActions) topActions.insertBefore(chipWrap, topActions.firstChild);
  const chipStreak = chipWrap.querySelector("#jh-chip-streak b");
  const chipStreakBtn = chipWrap.querySelector("#jh-chip-streak");
  const chipXp = chipWrap.querySelector("#jh-chip-xp b");

  const goHome = () => { app.clearEditor(); };
  chipWrap.querySelector("#jh-chip-home").addEventListener("click", goHome);
  chipStreakBtn.addEventListener("click", goHome);
  chipWrap.querySelector("#jh-chip-xp").addEventListener("click", goHome);
  app.goHome = goHome;

  function paintChips(p) {
    chipStreak.textContent = p.streak.current;
    chipStreakBtn.classList.toggle("lit", p.streak.todayActive);
    chipXp.textContent = p.xp.level;
  }

  function paintHome(p) {
    host.innerHTML = renderHome(p);
    // Let satellite features (Weekend Boss card, …) fill their slots.
    document.dispatchEvent(new CustomEvent("journey:painted", { detail: { progress: p } }));
  }

  // Celebrations intentionally disabled — the gamification layer is demoted, so
  // judging no longer triggers XP toasts, level-up overlays, or confetti. The
  // Journey home (reachable via the 🏠 chip) still shows streak/XP/quests
  // quietly for anyone who wants them. Kept as a no-op so refresh() needn't care.
  function celebrate(/* prev, next */) {}

  async function refresh({ quiet = false } = {}) {
    try {
      const p = await api.progress();
      celebrate(quiet ? last : null, p);
      last = p;
      paintChips(p);
      // Only re-render the home if it is visible (don't fight the editor view).
      if (!host.classList.contains("hidden")) paintHome(p);
    } catch { /* backend hiccup — keep old chips */ }
  }
  app.refreshJourney = refresh;

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh({ quiet: true }), 900);
  }

  // After every judge/meta sync (verdicts recorded) → quiet refresh with deltas.
  const origSync = app.syncMeta;
  app.syncMeta = async (...args) => {
    const r = await origSync.apply(app, args);
    scheduleRefresh();
    return r;
  };
  // Runs without verdict changes still advance quests.
  const origRuns = app.incrementRuns;
  app.incrementRuns = (...args) => {
    const r = origRuns.apply(app, args);
    scheduleRefresh();
    return r;
  };
  // Going home re-renders with fresh data.
  const origClear = app.clearEditor;
  app.clearEditor = (...args) => {
    const r = origClear.apply(app, args);
    app.el.currentTitle.textContent = "Hành trình";
    paintHome(last);
    refresh();
    return r;
  };

  // --- home interactions (delegated; innerHTML re-renders are safe) ---
  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "new-problem") app.openMetaModal(null);
    else if (action === "open-problem") app.selectProblem(btn.dataset.id);
    else if (action === "open-contests") document.getElementById("btn-contests")?.click();
    else if (action === "open-stats" || action === "open-review") document.getElementById("btn-dashboard")?.click();
    else if (action === "open-mistakes") app.openMistakeBook && app.openMistakeBook();
    else if (action === "open-skilltree") app.openSkillTree && app.openSkillTree();
    else if (action === "open-defense") {
      // The defense quest: jump to the most recent AC'd problem, then open viva.
      const acProblem = (app.state.problems || []).find((p) => p.lastVerdict === "AC" || p.status === "solved");
      if (!acProblem) { app.toast("Chưa có bài AC nào để bảo vệ.", "err"); return; }
      const go = () => { if (app.openDefense) app.openDefense(); };
      if (app.state.currentId === acProblem.id) go();
      else { app.selectProblem(acProblem.id); setTimeout(go, 600); }
    }
  });
  // Double-click the name to rename inline (window.prompt is unavailable in
  // the Electron shell, so we swap in a real <input>).
  host.addEventListener("dblclick", (e) => {
    const name = e.target.closest(".jh-name");
    if (!name || name.querySelector("input")) return;
    const input = document.createElement("input");
    input.className = "jh-name-input";
    input.value = userName();
    input.maxLength = 24;
    name.textContent = "";
    name.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      const next = input.value.trim();
      if (next) { try { localStorage.setItem(NAME_KEY, next.slice(0, 24)); } catch { /* private mode */ } }
      paintHome(last);
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
      else if (ev.key === "Escape") { ev.stopPropagation(); input.removeEventListener("blur", commit); paintHome(last); }
    });
  });

  // First paint.
  refresh();
}
