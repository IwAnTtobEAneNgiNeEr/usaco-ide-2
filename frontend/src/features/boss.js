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

function card(inner, mod = "") {
  return `<div class="jh-boss ${mod}">${inner}</div>`;
}

function render(s) {
  if (!s) {
    return card(`<div class="jh-boss-head"><span class="jh-boss-sigil">⚔️</span>
      <div class="jh-boss-main"><div class="jh-boss-title">Boss tuần</div>
      <div class="jh-boss-sub">Đang dò la hang ổ…</div></div></div>`);
  }
  if (s.error) {
    return card(`<div class="jh-boss-head"><span class="jh-boss-sigil">⚔️</span>
      <div class="jh-boss-main"><div class="jh-boss-title">Boss tuần ${escapeHtml(s.week || "")}</div>
      <div class="jh-boss-sub">${escapeHtml(s.error)}</div></div></div>`);
  }

  const week = escapeHtml(s.week || "");

  // --- no boss yet: the summon pitch ---
  if (!s.boss) {
    const w = s.weakness;
    const pitch = w
      ? `Điểm yếu phát hiện: <b class="jh-boss-topic">${escapeHtml(w.topic)}</b> — ${w.waCount} WA / ${w.attempts} bài. Boss sẽ đánh đúng chỗ đó.`
      : `Chưa đủ dữ liệu điểm yếu — boss sẽ thử tổng lực cơ bản.`;
    return card(`
      <div class="jh-boss-head">
        <span class="jh-boss-sigil pulse">🐲</span>
        <div class="jh-boss-main">
          <div class="jh-boss-title">Boss tuần ${week} <span class="jh-boss-xp">+${s.xpReward} XP</span></div>
          <div class="jh-boss-sub">${pitch}</div>
        </div>
        <button class="btn jh-boss-btn" data-boss="summon" type="button">🔮 Triệu hồi Boss</button>
      </div>`, "summonable");
  }

  const b = s.boss;
  if (!b.exists) {
    return card(`
      <div class="jh-boss-head"><span class="jh-boss-sigil">🌫️</span>
        <div class="jh-boss-main">
          <div class="jh-boss-title">Boss tuần ${week}</div>
          <div class="jh-boss-sub">Boss đã bị xóa khỏi kho bài. Tuần sau nó sẽ trở lại — mạnh hơn.</div>
        </div></div>`);
  }

  // --- defeated: trophy state ---
  if (b.status === "defeated") {
    return card(`
      <div class="jh-boss-head">
        <span class="jh-boss-sigil">🏆</span>
        <div class="jh-boss-main">
          <div class="jh-boss-title">Đã hạ gục Boss ${week}! <span class="jh-boss-xp won">+${s.xpReward} XP</span></div>
          <div class="jh-boss-sub">“${escapeHtml(b.taunt || "")}” — nó đã phải nuốt lời. Boss mới xuất hiện vào tuần sau.</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-boss="open" data-id="${escapeHtml(b.problemId)}" type="button">Xem lại trận</button>
      </div>`, "defeated");
  }

  // --- alive: the fight is on ---
  return card(`
    <div class="jh-boss-head">
      <span class="jh-boss-sigil pulse">🐲</span>
      <div class="jh-boss-main">
        <div class="jh-boss-title">${escapeHtml(b.title)} <span class="jh-boss-xp">+${s.xpReward} XP</span></div>
        <div class="jh-boss-sub">“${escapeHtml(b.taunt || "Ngươi dám thách thức ta?")}”</div>
        <div class="jh-boss-meta">
          <span class="jh-tag">${escapeHtml(b.topic || "")}</span>
          ${b.rating ? `<span class="jh-tag">~CF ${b.rating}</span>` : ""}
          ${b.attempts ? `<span class="jh-tag">${b.attempts} lượt đã đánh</span>` : ""}
        </div>
      </div>
      <button class="btn jh-boss-btn" data-boss="open" data-id="${escapeHtml(b.problemId)}" type="button">⚔️ Vào trận</button>
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
