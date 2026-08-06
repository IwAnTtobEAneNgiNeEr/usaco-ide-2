// boss.js — ⚔️ Weekend Boss card on the Journey home.
//
// One AI-authored problem per week, aimed at your weakest topic. The card has
// three states: summonable (weakness pitch + summon button), alive (taunt +
// "Vào trận"), defeated (trophy). The boss itself is a normal problem, so the
// whole IDE (judge, coach, lab) works on it unchanged.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

let cached = null;     // last /api/boss payload — repainted instantly on re-renders
let loading = false;
const tr = (english, vietnamese) => document.documentElement.lang === "en" ? english : vietnamese;

function challengeMark(state = "ready") {
  return "";
}

function challengeTitle(title, week) {
  const clean = String(title || "")
    .replace(/^\s*[⚔️🐲]+\s*/u, "")
    .replace(/^Boss\s+\d{4}-W\d+\s*[—–-]\s*/i, "");
  return clean ? `${tr("Challenge", "Thử thách")} ${week} — ${clean}` : `${tr("Weekly challenge", "Thử thách tuần")} ${week}`;
}

function card(inner, mod = "") {
  return `<div class="jh-boss ${mod}">${inner}</div>`;
}

function render(s) {
  if (!s) {
    return card(`<div class="jh-boss-head">${challengeMark("loading")}
      <div class="jh-boss-main"><div class="jh-boss-kicker">${tr("Adaptive challenge", "Thử thách thích ứng")}</div><div class="jh-boss-title">${tr("Preparing this week's challenge", "Đang chuẩn bị thử thách tuần")}</div>
      <div class="jh-boss-sub">${tr("The system is reviewing your practice history.", "Hệ thống đang phân tích lịch sử luyện tập của bạn.")}</div></div></div>`);
  }
  if (s.error) {
    return card(`<div class="jh-boss-head">${challengeMark("error")}
      <div class="jh-boss-main"><div class="jh-boss-kicker">Thử thách thích ứng</div><div class="jh-boss-title">Tuần ${escapeHtml(s.week || "")}</div>
      <div class="jh-boss-sub">${escapeHtml(s.error)}</div></div></div>`);
  }

  const week = escapeHtml(s.week || "");

  // --- no boss yet: the summon pitch ---
  if (!s.boss) {
    const w = s.weakness;
    const pitch = w
      ? tr(`Weakness detected: <b class="jh-boss-topic">${escapeHtml(w.topic)}</b> — ${w.waCount} WA across ${w.attempts} problems. This challenge targets it.`, `Điểm yếu phát hiện: <b class="jh-boss-topic">${escapeHtml(w.topic)}</b> — ${w.waCount} WA / ${w.attempts} bài. Boss sẽ đánh đúng chỗ đó.`)
      : tr("Not enough weakness data yet — this challenge uses a balanced baseline.", "Chưa đủ dữ liệu điểm yếu — boss sẽ thử tổng lực cơ bản.");
    return card(`
      <div class="jh-boss-head">
        ${challengeMark("ready")}
        <div class="jh-boss-main">
          <div class="jh-boss-kicker">${tr("Weekly challenge", "Thử thách tuần")} · ${week}</div>
          <div class="jh-boss-title">${tr("A challenge designed around your weak point", "Bài đấu được thiết kế theo điểm yếu")} <span class="jh-boss-xp">+${s.xpReward} XP</span></div>
          <div class="jh-boss-sub">${pitch}</div>
        </div>
        <button class="btn jh-boss-btn" data-boss="summon" type="button">${tr("Create challenge", "Tạo thử thách")} <span aria-hidden="true">→</span></button>
      </div>`, "summonable");
  }

  const b = s.boss;
  if (!b.exists) {
    return card(`
      <div class="jh-boss-head">${challengeMark("error")}
        <div class="jh-boss-main">
          <div class="jh-boss-kicker">Thử thách tuần · ${week}</div>
          <div class="jh-boss-title">Thử thách không còn trong kho bài</div>
          <div class="jh-boss-sub">Một thử thách thích ứng mới sẽ mở vào tuần sau.</div>
        </div></div>`);
  }

  // --- defeated: trophy state ---
  if (b.status === "defeated") {
    return card(`
      <div class="jh-boss-head">
        ${challengeMark("won")}
        <div class="jh-boss-main">
          <div class="jh-boss-kicker">Hoàn thành · ${week}</div>
          <div class="jh-boss-title">Đã chinh phục thử thách tuần <span class="jh-boss-xp won">+${s.xpReward} XP</span></div>
          <div class="jh-boss-sub">Kết quả đã được ghi vào tiến trình. Thử thách mới mở vào tuần sau.</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-boss="open" data-id="${escapeHtml(b.problemId)}" type="button">Xem lại trận</button>
      </div>`, "defeated");
  }

  // --- alive: the fight is on ---
  return card(`
    <div class="jh-boss-head">
      ${challengeMark("live")}
      <div class="jh-boss-main">
        <div class="jh-boss-kicker">Đang diễn ra · ${week}</div>
        <div class="jh-boss-title">${escapeHtml(challengeTitle(b.title, s.week || ""))} <span class="jh-boss-xp">+${s.xpReward} XP</span></div>
        <div class="jh-boss-sub">“${escapeHtml(b.taunt || "Ngươi dám thách thức ta?")}”</div>
        <div class="jh-boss-meta">
          <span class="jh-tag">${escapeHtml(b.topic || "")}</span>
          ${b.rating ? `<span class="jh-tag">~CF ${b.rating}</span>` : ""}
          ${b.attempts ? `<span class="jh-tag">${b.attempts} lượt đã đánh</span>` : ""}
        </div>
      </div>
      <button class="btn jh-boss-btn" data-boss="open" data-id="${escapeHtml(b.problemId)}" type="button">Mở thử thách <span aria-hidden="true">→</span></button>
    </div>`, "alive");
}

export function initBoss(app) {
  function paint() {
    const slot = document.getElementById("jh-boss-host");
    if (slot) slot.innerHTML = render(cached);
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try { cached = await api.bossStatus(); }
    catch (err) { cached = { error: err.message }; }
    finally { loading = false; }
    paint();
  }

  // Fill the slot every time the home re-renders; fetch fresh data lazily.
  document.addEventListener("journey:painted", () => {
    paint();      // instant (cached)
    refresh();    // then update
  });
  document.addEventListener("localechange", paint);

  // Card interactions (delegated on the document — the slot is re-created often).
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-boss]");
    if (!btn) return;
    const action = btn.dataset.boss;

    if (action === "open") {
      app.selectProblem(btn.dataset.id);
      return;
    }
    if (action === "summon") {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> AI đang rèn boss… (~1 phút)`;
      try {
        cached = await api.bossSummon();
        paint();
        app.toast("⚔️ Boss đã xuất hiện trong kho bài — vào trận thôi!", "ok");
        if (app.playSound) app.playSound("timer");
        if (app.refreshProblems) app.refreshProblems();
      } catch (err) {
        if (!err.aborted) app.toast(err.message, "err");
        paint(); // restore the summon button
      }
    }
  });
}
