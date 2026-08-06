// journey.js — the "Hôm nay" home surface (S1) + the "Hồ sơ" surface (S3).
//
// Home v2 (REDESIGN-IA.md §2) is deliberately spare: a header with a thin stat
// strip, then exactly THREE units —
//   1. Nước đi tiếp theo  — the single most urgent action (nợ WA > bài dở >
//      kế hoạch > bài mới), with at most two quiet alternates.
//   2. Kế hoạch hôm nay    — the planner's short list (no second loud CTA).
//   3. dòng ngữ cảnh       — the weekend challenge slot, shown only when due.
// Everything that used to pile onto the home (rating block, doors, XP ring,
// 7-day chart, skill map, achievements, repeat-error file) moved to the "Hồ sơ"
// surface, reached by clicking the stat strip.
//
// All numbers come from GET /api/progress + /api/planner + the arena helpers,
// each derived from real history — this file only renders; it never writes
// progress. Vocabulary follows REDESIGN-IA §4 (HLV voice, no game-show words).

import { api } from "../api.js";
import { escapeHtml } from "../md.js";
import {
  normalizeEntry, visibleSuggestions, entryQueryString,
  parseHidden, serializeHidden, FEEDBACK_STORE_KEY, FEEDBACK_KINDS,
} from "../core/entry-model.js";
import { TRACKS } from "../core/track-contract.js";
import { translateReason } from "../core/module-model.js";

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
const tr = (english, vietnamese) => document.documentElement.lang === "en" ? english : vietnamese;
const levelLabel = (value) => ({ "Người mới": "Newcomer", "Tập sự": "Apprentice", "Thành thạo": "Skilled", "Chuyên gia": "Expert" }[value] || value);

function userName() {
  try { return localStorage.getItem(NAME_KEY) || tr("there", "bạn"); } catch { return tr("there", "bạn"); }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return tr("Good morning", "Chào buổi sáng");
  if (h < 14) return tr("Good afternoon", "Chào buổi trưa");
  if (h < 18) return tr("Good afternoon", "Chào buổi chiều");
  return tr("Good evening", "Chào buổi tối");
}

function quoteOfDay() {
  const d = new Date();
  const idx = (d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()) % QUOTES.length;
  const englishQuotes = [
    "Every AC today is a step toward tomorrow's contest.", "WA is not failure — it is a test case you just learned from.",
    "Careful thinking beats fast guessing.", "The hardest algorithm is the one you start.",
    "Today's streak matters more than yesterday's score.", "Read twice, code once, debug less.",
    "You do not need to be great to start, but you need to start to become great.", "One problem a day becomes 365 in a year."
  ];
  return tr(englishQuotes[idx], QUOTES[idx]);
}

const VERDICT_CLASS = { AC: "jh-v-ac", WA: "jh-v-wa", TLE: "jh-v-tle", RE: "jh-v-re", CE: "jh-v-ce" };

function stars(n) {
  let s = "";
  for (let i = 0; i < 5; i++) s += `<span class="jh-star ${i < n ? "on" : ""}"></span>`;
  return s;
}

function displayProblemTitle(title) {
  return String(title || "")
    .replace(/^\s*[⚔️🐲]+\s*/u, "")
    .replace(/^Boss\s+(\d{4}-W\d+)\s*[—–-]\s*/i, "Thử thách $1 — ");
}

// ---------------------------------------------------------------------------
// Header + stat strip
// ---------------------------------------------------------------------------

// A thin, clickable identity row: streak · level · rating. Clicking any part
// opens the "Hồ sơ" surface where the detail lives. Numbers only — the strip
// never becomes a card.
function renderStatStrip(p, arena) {
  const x = p.xp;
  const streakCls = p.streak.todayActive ? "lit" : "";
  const rating = arena && arena.rating ? arena.rating : null;
  const ratingSeg = rating
    ? `<b>${rating.rating}</b><span class="jh-stat-tag">${escapeHtml((rating.tier && rating.tier.name) || "rating")}</span>`
    : `<b>—</b><span class="jh-stat-tag">rating</span>`;
  return `
    <button type="button" class="jh-stats" data-action="open-profile" title="${tr("Open learning profile", "Mở Hồ sơ học tập")}">
      <span class="jh-stat ${streakCls}">
        <span class="jh-stat-k">${tr("Streak", "Chuỗi")}</span>
        <b>${p.streak.current}</b><span class="jh-stat-tag">${tr("days", "ngày")}${p.streak.best ? tr(` · best ${p.streak.best}`, ` · kỷ lục ${p.streak.best}`) : ""}</span>
      </span>
      <span class="jh-stat-div" aria-hidden="true"></span>
      <span class="jh-stat">
        <span class="jh-stat-k">${tr("Level", "Cấp")}</span>
        <b>${x.level}</b><span class="jh-stat-tag">${escapeHtml(document.documentElement.lang === "en" ? levelLabel(x.levelName) : x.levelName)}</span>
      </span>
      <span class="jh-stat-div" aria-hidden="true"></span>
      <span class="jh-stat">
        <span class="jh-stat-k">${tr("Rating", "Xếp hạng")}</span>
        ${ratingSeg}
      </span>
      <span class="jh-stat-open" aria-hidden="true">${tr("Profile →", "Hồ sơ →")}</span>
    </button>`;
}

// ---------------------------------------------------------------------------
// Focus block — the home's one decision surface. It owns every answer to
// “Tiếp tục làm gì / bắt đầu gì?” so Home never presents competing plans.
// ---------------------------------------------------------------------------

// The priority ladder (REDESIGN-IA §2): an unfinished/adjourned match (nợ WA)
// outranks a problem left mid-solve (bài dở), which outranks the planner's
// first pick (kế hoạch), which outranks "just pick something new". Exactly one
// of these becomes the loud button; the sealed/self-select options ride below
// as quiet chips.
function nextPrimary(p, plan, arena) {
  const adj = arena && arena.adjourned ? arena.adjourned : null;
  const revenge = arena && arena.nextBet && Array.isArray(arena.nextBet.revenge) && arena.nextBet.revenge.length
    ? arena.nextBet.revenge[0] : null;

  // 1) Nợ WA — an adjourned or WA-carrying match is the strongest reason to return.
  if (adj) {
    const why = adj.waCount ? tr(`${adj.waCount} tests are still failing — finish the job`, `còn ${adj.waCount} test chưa qua — quay lại xử nốt`) : tr("match in progress — return and finish it", "trận đang bỏ dở — quay lại kết thúc");
    return { action: "open-problem", id: adj.id, kicker: tr("WA debt", "Nợ WA"), title: displayProblemTitle(adj.title || adj.id), why };
  }
  if (revenge) {
    const why = revenge.gauntletLastResult === "broken"
      ? "AC cũ bị một test khó phá — món nợ chưa trả"
      : "trận đã buông — món nợ chưa trả";
    return { action: "open-problem", id: revenge.id, kicker: tr("WA debt", "Nợ WA"), title: displayProblemTitle(revenge.title || revenge.id), why };
  }

  // 2) Bài dở — a problem opened but not yet solved.
  const c = p.continueProblem;
  if (c && c.lastVerdict !== "AC" && c.status !== "solved") {
    const bits = [c.lastVerdict ? `lần trước ${c.lastVerdict}` : "đang làm dở", c.topic].filter(Boolean).join(" · ");
    return { action: "open-problem", id: c.id, kicker: tr("Continue", "Tiếp tục"), title: displayProblemTitle(c.title), why: bits };
  }

  // 3) Kế hoạch — the planner's first actionable pick.
  const item = plan && Array.isArray(plan.items) ? plan.items.find((it) => it.kind === "quiz" || it.id) : null;
  if (item) {
    if (item.kind === "quiz") {
      return { action: "open-quiz", kicker: tr("Next step", "Nước đi tiếp theo"), title: tr("Quick review — revisit an old mistake", "Ôn lỗi nhanh — nhắc lại lỗi cũ"), why: item.reason || tr("a few minutes of active recall before a new problem", "vài phút active recall trước khi giải bài mới") };
    }
    const prefix = item.kind === "review" ? "Ôn lại: " : "";
    return { action: "open-problem", id: item.id, kicker: tr("Next step", "Nước đi tiếp theo"), title: prefix + displayProblemTitle(item.title || item.id), why: item.reason || "" };
  }

  // 4) A solved-through-everything day, or a returning veteran — offer a fresh bài.
  if (c) {
    return { action: "open-problem", id: c.id, kicker: tr("Review", "Xem lại"), title: displayProblemTitle(c.title), why: tr("your latest problem — reopen it to practice more", "bài gần nhất — mở lại nếu muốn luyện thêm") };
  }
  if (document.getElementById("btn-random")) {
    return { action: "open-random", kicker: tr("Next step", "Nước đi tiếp theo"), title: tr("Open a new problem", "Mở một bài mới"), why: tr("nothing is pending — practice a suitable random problem", "chưa có việc nào tồn — luyện một bài ngẫu nhiên trong tầm") };
  }
  return { action: "new-problem", kicker: tr("Start", "Bắt đầu"), title: tr("Create your first problem", "Tạo bài đầu tiên"), why: tr("paste a statement image — AI reads it and prepares tests", "dán ảnh đề — AI đọc đề và dựng test cho em") };
}

function renderFocus(p, plan, arena, entry) {
  // The entry route has the best view of unfinished work. Standalone modules
  // are deliberately excluded: Practice only recommends problem-solving work.
  const continueItem = entry && entry.continueItem && entry.continueItem.open?.type !== "module"
    ? entry.continueItem
    : null;
  const primary = continueItem
    ? {
        action: "open-problem", id: continueItem.id, kicker: "Việc cần làm ngay",
        title: displayProblemTitle(continueItem.title),
        why: translateReason(continueItem.reason) || (continueItem.lastVerdict ? `lần trước ${continueItem.lastVerdict}` : ""),
      }
    : nextPrimary(p, plan, arena);
  const dataId = primary.id ? ` data-id="${escapeHtml(primary.id)}"` : "";
  const suggestions = entry
    ? visibleSuggestions(entry.suggestions, new Set())
      .filter((item) => item.open?.type !== "module" && item.id !== primary.id)
      .slice(0, 2)
      .map((item) => ({ id: item.id, title: displayProblemTitle(item.title), why: translateReason(item.reason) }))
    : (plan?.items || [])
      .filter((item) => item.id && item.id !== primary.id)
      .slice(0, 2)
      .map((item) => ({ id: item.id, title: displayProblemTitle(item.title || item.id), why: item.reason || "" }));
  const alternatives = suggestions.length
    ? `<div class="jh-focus-options"><span class="jh-focus-options-label">${tr("Or switch to", "Nếu em muốn đổi bài")}</span>${suggestions.map((item) => `
        <button type="button" class="jh-focus-option" data-action="open-problem" data-id="${escapeHtml(item.id)}">
          <span>${escapeHtml(item.title)}</span>${item.why ? `<small>${escapeHtml(item.why)}</small>` : ""}
        </button>`).join("")}</div>`
    : "";

  return `
    <section class="jh-unit jh-focus" aria-label="${tr("What to do next", "Việc nên làm tiếp theo")}">
      <div class="jh-focus-head"><span>${tr("What should you work on today?", "Hôm nay nên làm gì?")}</span></div>
      <button type="button" class="jh-focus-primary" data-action="${primary.action}"${dataId}>
        <span class="jh-focus-kicker">${escapeHtml(primary.kicker)}</span>
        <strong>${escapeHtml(primary.title)}</strong>
        ${primary.why ? `<span>${escapeHtml(primary.why)}</span>` : ""}
        <span class="jh-focus-go" aria-hidden="true">${tr("Continue →", "Tiếp tục →")}</span>
      </button>
      ${alternatives}
    </section>`;
}

// ---------------------------------------------------------------------------
// Onboarding (0 problems)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// S3 «Hồ sơ» — the surfaces that used to crowd the home now live here.
// This is the A-side SHELL: it re-homes week/skills/rank/repeat-errors/
// achievements and links out to the mistake workbook (Workstream B completes
// that view). Kept token-driven and card-based, no new modal.
// ---------------------------------------------------------------------------

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
    <div class="jh-card-head"><span class="jh-card-icon" data-icon="activity" aria-hidden="true"></span><span>7 ngày qua</span><span class="jh-card-sub">${total} lượt chạy</span></div>
    <div class="jh-week">${bars}</div>
    <div class="jh-legend"><span class="jh-dot jh-dot-ac"></span> ngày có AC <span class="jh-dot jh-dot-on"></span> có hoạt động</div>`;
}

function renderSkills(skills) {
  if (!skills.length) {
    return `<div class="jh-card-head"><span class="jh-card-icon" data-icon="skills" aria-hidden="true"></span><span>Bản đồ kỹ năng</span></div>
      <p class="jh-muted">Gắn <b>topic</b> cho bài tập (dp, graphs, prefix sum…) để xây bản đồ kỹ năng của riêng bạn.</p>
      <div class="jh-actions"><button class="btn btn-ghost btn-sm" data-action="open-skilltree">Xem bản đồ đầy đủ</button></div>`;
  }
  const rows = skills.slice(0, 6).map((s) => `
    <div class="jh-skill">
      <span class="jh-skill-name">${escapeHtml(s.topic)}</span>
      <span class="jh-skill-stars">${stars(s.stars)}</span>
      <span class="jh-skill-count">${s.solved}/${s.total}</span>
    </div>`).join("");
  return `<div class="jh-card-head"><span class="jh-card-icon" data-icon="skills" aria-hidden="true"></span><span>Bản đồ kỹ năng</span><span class="jh-card-sub">${skills.length} chủ đề</span></div>${rows}
    <div class="jh-actions"><button class="btn btn-ghost btn-sm jh-skillmap-btn" data-action="open-skilltree">Mở bản đồ đầy đủ →</button></div>`;
}

function renderQuests(quests) {
  const done = quests.filter((q) => q.done).length;
  const rows = quests.map((q) => `
    <div class="jh-quest ${q.done ? "done" : ""}">
      <span class="jh-quest-icon" data-quest="${escapeHtml(q.id)}" aria-hidden="true"></span>
      <div class="jh-quest-main">
        <div class="jh-quest-label">${escapeHtml(q.label)}</div>
        <div class="jh-quest-track"><span style="width:${Math.round((q.progress / q.target) * 100)}%"></span></div>
      </div>
      <span class="jh-quest-state">${q.done ? "✓" : `${q.progress}/${q.target}`}</span>
    </div>`).join("");
  return `
    <div class="jh-card-head"><span class="jh-card-icon" data-icon="quests" aria-hidden="true"></span><span>Nhiệm vụ hôm nay</span><span class="jh-card-sub">${done}/${quests.length} xong</span></div>
    ${rows}`;
}

// The rating detail card, re-homed from the old "Đấu Trường" home block. Rating,
// the road to the next tier, and the free 1-click reference promotion.
function renderRankCard(a) {
  if (!a || !a.rating) {
    return `<div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Luyện tập xếp hạng</span></div>
      <p class="jh-muted">AC bài đầu tiên có sample chính thức để bắt đầu tính rating.</p>`;
  }
  const r = a.rating;
  const provisional = (r.gamesPlayed || 0) < 30;
  const season = a.season && a.season.current
    ? `mùa ${a.season.current.seasonId} · đỉnh mùa ${a.season.current.seasonBestRating}`
    : "";
  const road = a.roadmap
    ? `<div class="ar-road">
        <div class="ar-road-label">
          <span>Đường lên bậc kế — ${a.roadmap.progressPct}%</span>
          <span>${a.roadmap.ratingGap > 0 ? `còn ${a.roadmap.ratingGap} điểm tới sàn ${a.roadmap.ratingFloor}` : `đã chạm sàn ${a.roadmap.ratingFloor}`}</span>
        </div>
        <div class="ar-road-track"><span class="ar-road-fill" style="width:${Math.min(100, Math.max(0, a.roadmap.progressPct))}%"></span></div>
      </div>`
    : "";
  const up = a.upgrade;
  const upgradeBlock = up && up.summary && (up.summary.canPromoteReference > 0 || up.summary.canConfirmRating > 0)
    ? `<button type="button" class="ar-upgrade" data-action="arena-promote-all">
        <span class="ar-upgrade-g">↗</span>
        <span class="ar-upgrade-text">
          <b>${up.summary.canPromoteReference}</b> bài đã AC có thể xác thực thành tham chiếu tính điểm
          ${up.summary.canConfirmRating ? ` · <b>${up.summary.canConfirmRating}</b> chờ xác nhận rating` : ""}
          <span class="ar-upgrade-sub">0 token — dùng chính code em đã AC</span>
        </span>
        <span class="ar-upgrade-arrow">Xác thực tất cả →</span>
      </button>`
    : "";
  return `
    <div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Luyện tập xếp hạng</span><span class="jh-card-sub">${season}</span></div>
    <div class="ar-home-row">
      <span class="ar-home-rating">${r.rating}</span>
      <span class="ar-home-tier">${escapeHtml((r.tier && r.tier.name) || "")}</span>
      ${provisional ? `<span class="ar-home-sub">±${r.band} tạm tính · ${r.gamesPlayed}/30 trận xếp hạng</span>`
        : (r.nextTierGap > 0 ? `<span class="ar-home-sub">còn ${r.nextTierGap} tới bậc kế</span>` : "")}
    </div>
    ${road}
    ${upgradeBlock}`;
}

// Repeat-error file (renamed from the old specimen cabinet): bug cards due for review on the same
// [3,7,21,60] clock as problem reviews, plus recurring counterexamples.
function renderRepeatErrors(queue, bosses, problems) {
  const cardsDue = (queue || []).filter((it) => it.type === "card").slice(0, 4);
  // Test-data hygiene: zz-* ids are test fixtures that historically leaked into
  // real data files; never show them even if one slips through again.
  const bossRows = (bosses || []).filter((b) => !/^zz-/.test(String(b.problemId || ""))).slice(0, 2);
  // The backend names a boss by its counterexample hash ("Sai kết quả #5fec")
  // — an internal id, banned from UI (§15.2). Render the problem's real title
  // and the actual failing input instead: that's the evidence a student can
  // act on.
  const titleFor = (problemId) => {
    const match = (problems || []).find((item) => item.id === problemId);
    return match ? displayProblemTitle(match.title || match.id) : "";
  };
  if (!cardsDue.length && !bossRows.length) {
    return `<div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Hồ sơ lỗi lặp</span></div>
      <p class="jh-muted">Chưa có lỗi tới hạn ôn — mỗi WA có chẩn đoán sẽ được ghi vào đây và nhắc lại đúng lúc.</p>`;
  }
  const dueRows = cardsDue.map((c, i) => `
    <button type="button" class="ar-led-row" style="--i:${i}" data-action="open-quiz">
      <span class="ar-led-g">❏</span>
      <span class="ar-led-main">${escapeHtml(c.label)} <span class="ar-led-sub">mức ${c.level} · quá hạn ôn ${c.overdueBy} ngày</span></span>
      <span class="ar-led-act">Ôn →</span>
    </button>`).join("");
  const bossRowsHtml = bossRows.map((b, i) => {
    const title = titleFor(b.problemId) || "Bài đã xóa khỏi thư viện";
    const input = String(b.minimalInput == null ? "" : b.minimalInput).trim().slice(0, 18);
    const evidenceBit = input ? ` · test nhỏ nhất: «${escapeHtml(input)}»` : "";
    return `
    <button type="button" class="ar-led-row is-boss" style="--i:${cardsDue.length + i}" data-action="open-problem" data-id="${escapeHtml(b.problemId)}">
      <span class="ar-led-g">⟁</span>
      <span class="ar-led-main">${escapeHtml(title)} <span class="ar-led-sub">sai lặp lại ${b.count} lần${evidenceBit} — quay lại xử dứt điểm</span></span>
      <span class="ar-led-act">Mở →</span>
    </button>`;
  }).join("");
  return `
    <div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Hồ sơ lỗi lặp</span><span class="jh-card-sub">${cardsDue.length ? `${cardsDue.length} lỗi tới hạn ôn` : "lỗi lặp có tên"}</span></div>
    ${dueRows}${bossRowsHtml}`;
}

// Achievements (renamed from the old seal archive): the solved archive, graded by tier.
const SEAL_GLYPH_H = { 1: "◇", 2: "◆", 3: "✦", 4: "❖" };

function renderAchievements(seals) {
  if (!Array.isArray(seals) || !seals.length) {
    return `<div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Bộ thành tích</span></div>
      <p class="jh-muted">AC bài đầu tiên để mở thành tích đầu tiên.</p>`;
  }
  const byTier = [4, 3, 2, 1].map((t) => ({ t, n: seals.filter((s) => s.tier === t).length })).filter((x) => x.n > 0);
  const counts = byTier.map((x) => `<span class="ar-tier-chip" data-tier="${x.t}">${SEAL_GLYPH_H[x.t]} ${seals.find((s) => s.tier === x.t).tierName} ×${x.n}</span>`).join("");
  const top = seals.slice(0, 3).map((s, i) => `
    <button type="button" class="ar-led-row" style="--i:${i}" data-action="open-problem" data-id="${escapeHtml(s.id)}">
      <span class="ar-medal" data-tier="${s.tier}"><span class="ar-led-g" data-tier="${s.tier}">${SEAL_GLYPH_H[s.tier]}</span></span>
      <span class="ar-led-main">${escapeHtml(displayProblemTitle(s.title))}
        <span class="ar-led-sub">${escapeHtml(s.tierName)}${s.kintsugi && s.kintsugi.waCount ? ` · ${s.kintsugi.waCount} lần sửa trước khi AC` : " · AC ngay"}</span></span>
    </button>`).join("");
  return `
    <div class="jh-card-head"><span class="jh-card-icon" aria-hidden="true"></span><span>Bộ thành tích</span><span class="jh-card-sub">${seals.length} bài</span></div>
    <div class="ar-tier-chips">${counts}</div>
    ${top}`;
}

// Profile cards speak the SAME visual language as the practice cards (index +
// mono kicker + role-tinted ink) so Hồ sơ, Luyện tập, and the statement sheet
// read as one system instead of three.
function profileCard(role, index, label, inner) {
  return `
    <section class="jh-card jh-pcard" data-role="${role}">
      <div class="jh-pcard-top"><span class="jh-pcard-index">${index}</span><span class="jh-pcard-label">${label}</span></div>
      ${inner}
    </section>`;
}

function renderProfile(p, arena, problems) {
  if (!p) return `<p class="jh-muted" style="padding:40px">Đang tải hồ sơ…</p>`;
  const a = arena || {};
  return `
    <div class="journey-home jh-profile">
      <header class="jh-head jh-profile-head">
        <div class="jh-head-text">
          <nav class="jh-view-nav" aria-label="Khu vực chính"><button type="button" data-action="home-back">Hôm nay</button><button type="button" data-action="open-practice">Luyện tập</button><button type="button" data-action="open-xuong">Xưởng</button><button type="button" class="active" data-action="open-profile">Hồ sơ</button></nav>
          <div class="jh-greet">Hồ sơ học tập</div>
          <div class="jh-quote">Nhìn lại: em đã học được gì và còn yếu ở đâu.</div>
        </div>
      </header>

      <div class="jh-grid">
        ${profileCard("amber", "01", "Bộ nhớ lỗi", renderRepeatErrors(a.specimenQueue, a.bosses, problems))}
        ${profileCard("cyan", "02", "Kỹ năng", renderSkills(p.skills))}
      </div>
      <div class="jh-grid">
        ${profileCard("mint", "03", "Nhịp luyện", renderWeek(p.week))}
        ${profileCard("violet", "04", "Xếp hạng", renderRankCard(a))}
      </div>
      <div class="jh-grid">
        ${profileCard("violet", "05", "Thành tích", renderAchievements(a.seals))}
        ${profileCard("cyan", "06", "Nhiệm vụ ngày", renderQuests(p.quests))}
      </div>
    </div>`;
}

function renderPractice(problems) {
  const recent = (Array.isArray(problems) ? problems : []).slice(0, 8);
  const topics = [...new Set(recent.flatMap((problem) => [problem.topic, ...(problem.tags || [])]).filter(Boolean))].slice(0, 3);
  const evidence = topics.length ? topics.join(" · ") : "chủ đề em vừa học";
  const cards = [
    // Card contract (README §15.4): mỗi card nói VIỆC em làm và KẾT QUẢ em
    // nhận; dòng meta = kết quả/bằng chứng, không bao giờ là tech stack.
    { action: "open-random", role: "cyan", index: "01", title: "Bài phù hợp", label: "Cá nhân hóa", copy: `AI ra một đề mới vừa tầm, nhắm đúng chỗ em vừa luyện (${evidence}). Em giải như bài thi thật — Judge chấm, sai thì Coach mổ.`, meta: "Kết quả: một bài mới để em giải và kiểm chứng đúng điểm đang yếu" },
    { action: "open-contests", role: "violet", index: "02", title: "Bộ đề theo chủ đề", label: "Bộ đề", copy: "Chọn chủ đề và dải Elo, AI dựng 5–7 bài khó dần. Em làm lần lượt; AC tới đâu, tiến độ ghi tới đó.", meta: "Kết quả: một vòng luyện trọn vẹn, có tiến độ để quay lại" },
    { action: "open-corefill", role: "mint", index: "03", title: "Điền lõi", label: "Sửa tư duy", copy: "Một lời giải hoàn chỉnh bị khoét đúng đoạn lõi. Em viết lại phần đó; sai là thấy ngay test nào gãy và vì sao.", meta: "Kết quả: nắm chắc invariant của dạng bài, không thuộc vẹt" },
    { action: "open-rush", role: "amber", index: "04", title: "Debug tốc độ", label: "Săn bug", copy: "Code chạy được nhưng giấu đúng một lỗi logic. Em tìm và sửa trước khi hết giờ — sai mất mạng, bug vẫn là của em.", meta: "Kết quả: mắt soi bug nhanh hơn sau mỗi ván" },
    { action: "open-stress", role: "cyan", index: "05", title: "Stress Test", label: "Kỹ năng thi đấu", copy: "Chọn một bài đã có lời giải trước. Em viết generator và brute force; app đối chiếu với Solution đến khi lộ case sai nhỏ nhất.", meta: "Kết quả: bắt được bug ẩn trong lời giải trước khi giám khảo bắt" }
  ];
  return `
    <div class="journey-home jh-practice">
      <header class="jh-head">
        <div class="jh-head-text">
          <nav class="jh-view-nav" aria-label="Khu vực chính"><button type="button" data-action="home-back">Hôm nay</button><button type="button" class="active" data-action="open-practice">Luyện tập</button><button type="button" data-action="open-xuong">Xưởng</button><button type="button" data-action="open-profile">Hồ sơ</button></nav>
          <div class="jh-greet">Phòng luyện kỹ năng</div>
          <div class="jh-quote">Chọn đúng công cụ cho mục tiêu hiện tại; mọi hoạt động code dùng cùng một nhịp thao tác.</div>
        </div>
      </header>
      <section class="jh-practice-grid" aria-label="Các hoạt động luyện tập">
        ${cards.map((card) => `<button type="button" class="jh-practice-card" data-role="${card.role}" data-action="${card.action}">
          <span class="jh-practice-index">${card.index}</span>
          <span class="jh-practice-label">${card.label}</span>
          <strong>${card.title}</strong>
          <span class="jh-practice-copy">${escapeHtml(card.copy)}</span>
          <span class="jh-practice-meta">${card.meta}</span>
          <span class="jh-practice-go" aria-hidden="true">Mở →</span>
        </button>`).join("")}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Home v2 shell
// ---------------------------------------------------------------------------

function renderHome(p, plan, arena, entry) {
  if (!p) return `<p class="jh-muted" style="padding:40px">Đang tải hành trình…</p>`;

  // Stat/rating stay secondary. The single focus block replaces the former
  // Next move, Gợi ý bắt đầu, Kế hoạch và Kèo surfaces.
  const body = p.totals.problems === 0 ? renderOnboarding() : `
    ${renderStatStrip(p, arena)}
    ${renderFocus(p, plan, arena, entry)}
    <section class="jh-unit jh-context" id="jh-boss-host"></section>`;

  return `
    <div class="journey-home">
      <header class="jh-head">
        <div class="jh-head-text">
          <nav class="jh-view-nav" aria-label="${tr("Main areas", "Khu vực chính")}"><button type="button" class="active" data-action="home-back">${tr("Today", "Hôm nay")}</button><button type="button" data-action="open-practice">${tr("Practice", "Luyện tập")}</button><button type="button" data-action="open-xuong">${tr("Workshop", "Xưởng")}</button><button type="button" data-action="open-profile">${tr("Profile", "Hồ sơ")}</button></nav>
          <div class="jh-greet">${greeting()}, <span class="jh-name" title="Nhấp đúp để đổi tên">${escapeHtml(userName())}</span></div>
          <div class="jh-quote">“${escapeHtml(quoteOfDay())}”</div>
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
  let homeView = "today"; // today | practice | xuong | profile

  // --- topbar chips (created here so index.html stays lean) ---
  const topActions = document.querySelector(".topbar-actions");
  const chipWrap = document.createElement("div");
  chipWrap.className = "jh-chips";
  chipWrap.innerHTML = `
    <button id="jh-chip-home" class="btn btn-ghost btn-sm" title="${tr("Journey home", "Trang chủ hành trình")}" aria-label="${tr("Journey home", "Trang chủ hành trình")}">⌂</button>
    <button id="jh-chip-streak" class="jh-chip" title="${tr("Practice streak", "Chuỗi ngày luyện tập")}" aria-label="${tr("Practice streak", "Chuỗi ngày luyện tập")}">${tr("Streak", "Chuỗi")} <b>0</b></button>
    <button id="jh-chip-xp" class="jh-chip" title="Cấp độ &amp; XP">Lv <b>0</b></button>`;
  if (topActions) topActions.insertBefore(chipWrap, topActions.firstChild);
  const chipStreak = chipWrap.querySelector("#jh-chip-streak b");
  const chipStreakBtn = chipWrap.querySelector("#jh-chip-streak");
  const chipXp = chipWrap.querySelector("#jh-chip-xp b");

  const goHome = () => { app.clearEditor(); };
  // Deep-link vào view Xưởng (dùng bởi nút "← Xưởng" trong project workspace).
  // clearEditor PHẢI chạy trước vì wrapper của nó reset homeView về "today".
  app.openXuongList = () => { app.clearEditor(); homeView = "xuong"; paintHome(last); };
  chipWrap.querySelector("#jh-chip-home").addEventListener("click", goHome);
  chipStreakBtn.addEventListener("click", goHome);
  chipWrap.querySelector("#jh-chip-xp").addEventListener("click", goHome);
  app.goHome = goHome;

  function paintChips(p) {
    chipStreak.textContent = p.streak.current;
    chipStreakBtn.classList.toggle("lit", p.streak.todayActive);
    chipXp.textContent = p.xp.level;
  }

  let lastPlan = null;  // the day's plan — kept so click handlers can act on it
  let lastArena = null; // rating/roadmap/season/adjourned snapshot
  let lastEntry = null; // normalized GET /api/recommendations/entry (null = route absent)
  let entryUnavailable = false; // 404'd once → stop asking this session
  let hiddenSug = parseHidden((() => { try { return localStorage.getItem(FEEDBACK_STORE_KEY); } catch { return "[]"; } })());
  let useFeedbackCache = false;
  let lastFeedbackItem = null;
  let homeSearchQ = ""; // survives innerHTML repaints

  function persistHidden() {
    try { localStorage.setItem(FEEDBACK_STORE_KEY, serializeHidden(hiddenSug)); } catch { /* private mode */ }
  }

  async function fetchEntry() {
    if (entryUnavailable) return null;
    try {
      // The dismissal list rides along so server-side ranking respects it.
      useFeedbackCache = false;
      const track = app.state.filters.track === TRACKS.ALGORITHM_ENGINEERING ? TRACKS.ALGORITHM_ENGINEERING : TRACKS.COMPETITIVE;
      return normalizeEntry(await api.entryRecommendations(entryQueryString(track)));
    } catch (err) {
      if (err && err.status === 404) entryUnavailable = true;
      useFeedbackCache = true;
      return null;
    }
  }

  // Xưởng (S6) renders through features/xuong.js — journey only provides the
  // shell + nav so all four surfaces share one header pattern.
  function renderXuongShell() {
    return `
    <div class="journey-home jh-practice">
      <header class="jh-head">
        <div class="jh-head-text">
          <nav class="jh-view-nav" aria-label="Khu vực chính"><button type="button" data-action="home-back">Hôm nay</button><button type="button" data-action="open-practice">Luyện tập</button><button type="button" class="active" data-action="open-xuong">Xưởng</button><button type="button" data-action="open-profile">Hồ sơ</button></nav>
          <div class="jh-greet">Xưởng</div>
          <div class="jh-quote">Chạy sản phẩm trước để hiểu vì sao thuật toán tồn tại — rồi thực hành, Verify và tiến hóa.</div>
        </div>
      </header>
      <div id="xg-host"></div>
    </div>`;
  }

  function paintHome(p) {
    if (!p) { host.innerHTML = renderHome(p, lastPlan, lastArena, lastEntry); return; }
    host.innerHTML = homeView === "profile"
      ? renderProfile(p, lastArena, app.state.problems)
      : (homeView === "practice" ? renderPractice(app.state.problems)
        : (homeView === "xuong" ? renderXuongShell() : renderHome(p, lastPlan, lastArena, lastEntry)));
    if (homeView === "xuong") {
      const xgHost = host.querySelector("#xg-host");
      if (xgHost && app.xuong) app.xuong.mountList(xgHost);
    }
    const homeSearch = host.querySelector("#jh-search");
    if (homeSearch && homeSearchQ) homeSearch.value = homeSearchQ;
    // Satellite features (weekend challenge card) fill #jh-boss-host — only on
    // the Today view, where that slot exists.
    if (homeView === "today") {
      document.dispatchEvent(new CustomEvent("journey:painted", { detail: { progress: p } }));
    }
  }

  // Gather the arena home block's data. Every piece best-effort; the scan for
  // an adjourned match only touches the 8 most-recent problems (bounded I/O).
  async function fetchArena() {
    if (!app.arena) return null;
    try {
      const [ratingR, roadmapR, seasonR, upgradeR, nextBetR, specimenR, sealsR, bossesR] = await Promise.allSettled([
        api.arenaRating(), api.arenaRoadmap(), api.arenaSeason(), api.arenaUpgradeCandidates(),
        api.arenaNextBet(), api.arenaSpecimenQueue(), api.arenaSeals(), api.arenaBossCases(),
      ]);
      const rating = ratingR.status === "fulfilled" && ratingR.value && ratingR.value.ok ? ratingR.value : null;
      if (!rating) return null; // no rating route → no block at all
      const ok = (r) => (r.status === "fulfilled" && r.value && r.value.ok ? r.value : null);
      const out = {
        rating,
        roadmap: ok(roadmapR),
        season: ok(seasonR),
        upgrade: ok(upgradeR),
        nextBet: ok(nextBetR),
        specimenQueue: (ok(specimenR) || {}).items || null,
        seals: (ok(sealsR) || {}).seals || null,
        bosses: (ok(bossesR) || {}).bosses || null,
        adjourned: null,
      };
      const recent = (app.state.problems || []).slice(0, 8);
      const matches = await Promise.allSettled(recent.map((pr) => api.arenaMatch(pr.id)));
      for (let i = 0; i < matches.length; i += 1) {
        const m = matches[i].status === "fulfilled" ? matches[i].value : null;
        if (!m || !m.ok || !m.match) continue;
        const st = m.match.state;
        if (st === "adjourned" || (st === "open" && m.match.waCount > 0)) {
          out.adjourned = { id: recent[i].id, title: recent[i].title, waCount: m.match.waCount || 0 };
          if (st === "adjourned") break; // an adjourned match outranks a merely-open one
        }
      }
      return out;
    } catch { return null; }
  }

  function startPlanItem(item) {
    if (!item) return;
    if (item.kind === "quiz") { if (app.openFlashQuiz) app.openFlashQuiz(); return; }
    if (item.id) app.selectProblem(item.id);
  }

  // Celebrations intentionally disabled — the gamification layer is demoted, so
  // judging no longer triggers XP toasts, level-up overlays, or confetti. Kept
  // as a no-op so refresh() needn't care.
  function celebrate(/* prev, next */) {}

  async function refresh({ quiet = false } = {}) {
    try {
      // Plan/arena/entry fetches are best-effort — a hiccup must never break the home.
      const [pRes, planRes, arenaRes, entryRes] = await Promise.allSettled([
        api.progress(), api.plannerSession(), fetchArena(), fetchEntry(),
      ]);
      if (pRes.status !== "fulfilled") throw new Error("progress failed");
      const p = pRes.value;
      lastPlan = planRes.status === "fulfilled" && planRes.value.plan ? planRes.value.plan : null;
      lastArena = arenaRes.status === "fulfilled" ? arenaRes.value : null;
      lastEntry = entryRes.status === "fulfilled" ? entryRes.value : null;
      celebrate(quiet ? last : null, p);
      last = p;
      paintChips(p);
      // Only re-render the home if it is visible (don't fight the editor view).
      if (!host.classList.contains("hidden")) paintHome(p);
    } catch { /* backend hiccup — keep old chips */ }
  }
  app.refreshJourney = refresh;
  document.addEventListener("localechange", () => {
    chipStreakBtn.childNodes[0].nodeValue = `${tr("Streak", "Chuỗi")} `;
    if (!host.classList.contains("hidden")) paintHome(last);
    if (!app.state.currentId) app.el.currentTitle.textContent = tr("Journey", "Hành trình");
  });

  document.addEventListener("personalized:state", (event) => {
    const card = host.querySelector('[data-action="open-random"]');
    if (!card) return;
    const meta = card.querySelector(".jh-practice-meta");
    const state = event.detail?.state;
    card.disabled = state === "loading";
    card.classList.toggle("is-loading", state === "loading");
    if (state === "loading") meta.textContent = "Đang đọc 8 bài gần nhất và cân Elo…";
    else if (state === "done") {
      const why = event.detail.rationale || {};
      meta.textContent = `${why.topic || "chủ đề gần đây"} · ~${why.generatedRating || why.targetRating || "?"} Elo · đã tạo`;
    } else if (state === "error") meta.textContent = "Chưa tạo được · xem thông báo để xử lý";
  });

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
  // Going home returns to the Today view and re-renders with fresh data.
  const origClear = app.clearEditor;
  app.clearEditor = (...args) => {
    const r = origClear.apply(app, args);
    homeView = "today";
    app.el.currentTitle.textContent = tr("Journey", "Hành trình");
    paintHome(last);
    refresh();
    return r;
  };

  // --- home interactions (delegated; innerHTML re-renders are safe) ---
  host.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "new-problem") app.openMetaModal(null);
    else if (action === "open-profile") { homeView = "profile"; paintHome(last); }
    else if (action === "open-practice") { homeView = "practice"; paintHome(last); }
    else if (action === "open-xuong") { homeView = "xuong"; paintHome(last); }
    else if (action === "home-back") { homeView = "today"; paintHome(last); }
    // --- hai hướng bắt đầu (B2): route into the ONE Library with the lens set ---
    else if (action === "start-competitive" || action === "start-algorithm-engineering") {
      const track = action === "start-algorithm-engineering" ? TRACKS.ALGORITHM_ENGINEERING : TRACKS.COMPETITIVE;
      const trackBtn = document.querySelector(`#track-row [data-track="${track}"]`);
      if (trackBtn) trackBtn.click();
      // reveal the sidebar if it was collapsed, then land focus on the list
      document.body.classList.remove("sidebar-collapsed");
      const list = document.getElementById("problem-list");
      const first = list && list.querySelector(".p-item");
      if (first) { first.scrollIntoView({ block: "nearest" }); first.focus && first.focus(); }
      else document.getElementById("search")?.focus();
    }
    else if (action === "open-random") document.getElementById("btn-random")?.click();
    else if (action === "open-contests") app.openContests?.();
    else if (action === "open-corefill") app.openCorefill?.();
    else if (action === "open-rush") app.openRush?.();
    else if (action === "open-stress") {
      // Stress-test needs a solution to hammer. From the Home card there's no
      // current problem, so prefer one the student has actually solved (AC)
      // over an arbitrary first row that may be an unsolved import with no code.
      const problems = app.state.problems || [];
      const solved = problems.find((p) => p.lastVerdict === "AC" || p.status === "solved");
      const id = app.state.currentId || (solved && solved.id) || problems[0]?.id;
      if (!id) { app.toast("Cần có ít nhất một bài để mở Sinh Test.", "err"); return; }
      if (app.state.currentId !== id) await app.selectProblem(id);
      app.openStress?.(id);
    }
    else if (action === "arena-promote-all") {
      // Bulk-promote every AC'd problem's own code into a trusted reference
      // (0 AI tokens). One click, whole workspace.
      btn.disabled = true;
      const label = btn.querySelector(".ar-upgrade-arrow");
      if (label) label.textContent = "Đang xác thực…";
      try {
        const result = await api.arenaPromoteAll();
        if (result && result.ok) {
          app.toast(`Đã xác thực ${result.referencePromoted} bài thành tham chiếu tính điểm${result.ratingConfirmed ? ` · xác nhận rating ${result.ratingConfirmed} bài` : ""}.`, "ok");
        } else {
          app.toast("Xác thực chưa xong — thử lại sau.", "err");
        }
      } catch {
        app.toast("Xác thực chưa xong — thử lại sau.", "err");
      }
      refresh();
    }
    else if (action === "plan-item") startPlanItem(lastPlan && lastPlan.items && lastPlan.items[Number(btn.dataset.idx)]);
    // --- entry suggestion feedback (quá dễ / quá khó / không phù hợp) ---
    else if (action === "sug-feedback") {
      const row = btn.closest(".jh-sug-row");
      if (row && !row.querySelector(".jh-sug-fbrow")) row.insertAdjacentHTML("beforeend", feedbackStripHtml(btn.dataset.id));
    }
    else if (action === "sug-feedback-cancel") {
      const strip = btn.closest(".jh-sug-fbrow");
      if (strip) strip.remove();
    }
    else if (action === "sug-feedback-send") {
      const kind = FEEDBACK_KINDS.find((k) => k.id === btn.dataset.kind);
      const track = app.state.filters.track === TRACKS.ALGORITHM_ENGINEERING ? TRACKS.ALGORITHM_ENGINEERING : TRACKS.COMPETITIVE;
      if (!kind) return;
      try {
        await api.recommendationFeedback(btn.dataset.id, { track, signal: kind.id });
        lastFeedbackItem = btn.dataset.id;
        app.toast(`Đã ghi nhận “${kind.label}” — ${kind.effect}.`, "ok");
      } catch {
        // Cache only when the canonical local-first store is unavailable.
        hiddenSug.add(btn.dataset.id);
        persistHidden();
        useFeedbackCache = true;
        app.toast("Chưa gửi được phản hồi; đã lưu tạm trên thiết bị.", "err");
      }
      refresh({ quiet: true });
    }
    else if (action === "sug-feedback-reset") {
      const track = app.state.filters.track === TRACKS.ALGORITHM_ENGINEERING ? TRACKS.ALGORITHM_ENGINEERING : TRACKS.COMPETITIVE;
      try {
        await api.recommendationFeedback(btn.dataset.id, { track, signal: "reset" });
        lastFeedbackItem = null;
        app.toast("Đã đặt lại phản hồi; xếp hạng trở về tín hiệu backend.", "ok");
      } catch {
        hiddenSug.delete(btn.dataset.id);
        persistHidden();
        useFeedbackCache = true;
        app.toast("Chưa gửi được reset; đã xóa cache trên thiết bị.", "err");
      }
      refresh({ quiet: true });
    }
    else if (action === "open-problem") app.selectProblem(btn.dataset.id);
    else if (action === "open-module") app.openStandaloneModule?.(btn.dataset.id.replace(/^module:/, ""));
    else if (action === "open-quiz") { if (app.openFlashQuiz) app.openFlashQuiz(); }
    else if (action === "mystery-reroll") {
      e.stopPropagation();
      btn.disabled = true;
      try {
        const r = await api.arenaMysteryReroll();
        if (r && r.ok) { app.toast("Đã đổi bài niêm phong — đề mới, vẫn giấu mặt.", "ok"); refresh(); return; }
      } catch (err) {
        const reason = err && err.data && err.data.reason;
        if (reason === "already-opened") app.toast("Đề đã mở — không đổi được nữa. Vào làm thôi.", "err");
        else if (reason === "cooldown") app.toast("Mỗi ngày chỉ đổi bài niêm phong một lần — mai đổi tiếp.", "err");
        else app.toast("Chưa đổi được bài niêm phong.", "err");
      }
      refresh();
    }
    else if (action === "mystery-open") {
      // Opening a sealed problem IS the reveal — the backend locks the reroll
      // the moment it's opened (no dodging a problem you've already seen).
      btn.disabled = true; btn.textContent = "Đang mở…";
      try {
        const r = await api.arenaMysteryOpen();
        if (r && r.ok && r.problem && r.problem.id) { app.selectProblem(r.problem.id); return; }
      } catch { /* fall through to the toast */ }
      app.toast("Chưa mở được bài niêm phong — thử lại sau.", "err");
      refresh();
    }
    else if (action === "open-contests") document.getElementById("btn-contests")?.click();
    else if (action === "open-stats" || action === "open-review") document.getElementById("btn-dashboard")?.click();
    else if (action === "open-mistakes") app.openMistakeBook && app.openMistakeBook();
    else if (action === "open-skilltree") app.openSkillTree && app.openSkillTree();
  });
  // --- home search → the Library's ONE search box (no second result list) ---
  host.addEventListener("input", (e) => {
    const inp = e.target.closest("#jh-search");
    if (!inp) return;
    homeSearchQ = inp.value;
    const librarySearch = document.getElementById("search");
    if (librarySearch && librarySearch.value !== inp.value) {
      librarySearch.value = inp.value;
      librarySearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  host.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.closest("#jh-search")) return;
    e.preventDefault();
    const list = document.getElementById("problem-list");
    const first = list && list.querySelector(".p-item");
    if (first) first.scrollIntoView({ block: "nearest" });
    document.getElementById("search")?.focus();
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
