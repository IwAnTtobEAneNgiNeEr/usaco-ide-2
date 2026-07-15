// arena.js — ⚔ Luyện tập xếp hạng (arena) frontend shell (S1-S12 backend, built 2026-07-06).
//
// Owns the three pieces that live OUTSIDE the moment card:
//   • Arena HUD — one quiet topbar chip: rating · rank (± band while
//     provisional). Sits next to the streak/XP chips; click goes home.
//   • Match strip — one slim line above the verdict rail, only when a problem
//     has a live fight (open with WAs / adjourned) or a fixable rated-gate gap
//     (unconfirmed problem rating). Never shown otherwise — pre-judge silence
//     is a feature.
//   • app.arena helpers — moment.js/journey.js consume these instead of
//     re-implementing fetch/degrade logic. EVERY helper resolves null on any
//     failure: a missing route must never break a caller (VIỆC 5).
//
// Design laws honored here: token-driven colors only, glyph mono (no emoji),
// finite animations, one primary CTA per surface (README-LOOPS §6, AUTOPILOT §1).

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const nullOn = (p) => p.catch(() => null);

// Reasons a match is GIAO HỮU, in the order they should be fixed.
export function friendlyReasons(elig) {
  const e = elig || {};
  const out = [];
  if (!e.sample) out.push("đề chưa có sample chính thức");
  if (!e.reference) out.push("chưa có lời giải tham chiếu tin cậy");
  if (!e.problemRatingConfirmed) out.push("rating bài chưa xác nhận");
  return out;
}

export function initArena(app) {
  // ---- HUD chip (identity, not a tool — same family as the streak/XP chips) ----
  const topActions = document.querySelector(".topbar-actions");
  let hudBtn = null;
  if (topActions) {
    hudBtn = document.createElement("button");
    hudBtn.id = "arena-hud";
    hudBtn.className = "jh-chip ar-hud";
    hudBtn.title = "Xếp hạng — rating của em (bấm để về trang chủ)";
    hudBtn.innerHTML = `<span class="ar-hud-g" aria-hidden="true">≠</span><b>—</b>`;
    hudBtn.setAttribute("aria-label", "Xếp hạng — đang tải rating");
    topActions.insertBefore(hudBtn, topActions.firstChild);
    hudBtn.addEventListener("click", () => { if (app.goHome) app.goHome(); });
  }

  let ratingCache = null; // last GET /api/arena/rating payload (or null)

  async function refreshHud() {
    ratingCache = await nullOn(api.arenaRating());
    if (!hudBtn) return;
    if (!ratingCache || !ratingCache.ok) { hudBtn.classList.add("hidden"); return; }
    const r = ratingCache;
    const provisional = (r.gamesPlayed || 0) < 30;
    hudBtn.classList.remove("hidden");
    hudBtn.innerHTML = `<span class="ar-hud-g" aria-hidden="true">≠</span><b>${r.rating}</b>` +
      (provisional ? `<span class="ar-hud-band">±${r.band}</span>` : "");
    hudBtn.title = `${r.tier ? r.tier.name : ""} · ${r.rating}` +
      (provisional ? ` (tạm tính — hội tụ sau ~30 trận rated, đã đấu ${r.gamesPlayed})` : "") +
      (r.nextTierGap > 0 ? ` · còn ${r.nextTierGap} tới bậc kế` : "") +
      " — bấm để về trang chủ";
    hudBtn.setAttribute("aria-label", hudBtn.title);
  }

  // ---- Match strip (above the rail; the pre-judge "luật chơi" line) -----------
  const rail = document.getElementById("verdict-rail");
  const strip = document.createElement("div");
  strip.id = "arena-strip";
  strip.className = "ar-strip hidden";
  if (rail && rail.parentNode) rail.parentNode.insertBefore(strip, rail);

  let stripPid = null;
  let matchCache = null; // last GET /:id/match payload for stripPid

  function hideStrip() { strip.classList.add("hidden"); strip.innerHTML = ""; }

  function renderStrip(pid, m) {
    // The match-law line: ALWAYS visible while a problem is open, because the
    // student must know BEFORE pressing Judge whether this fight counts
    // (chess.com shows Rated/Unrated before the game, not after). Buttons only
    // appear when there's something actionable.
    const match = m.match || {};
    const live = match.state === "open" || match.state === "adjourned";
    const canConfirm = !m.eligibility.problemRatingConfirmed && m.problemRating > 0;
    // Nâng cấp tham chiếu: THIS problem is already solved but has no reference yet — the
    // student's own AC'd code is sitting right there, free to promote.
    const meta = app.state.meta || {};
    const solved = meta.lastVerdict === "AC" || meta.status === "solved";
    const canPromote = solved && !m.eligibility.reference;

    const gate = m.wouldBeRated
      ? `<span class="ar-badge ar-rated">RATED</span><span class="ar-strip-note">AC trận này sẽ được tính điểm</span>`
      : `<span class="ar-badge ar-friendly">GIAO HỮU</span><span class="ar-strip-note">${escapeHtml(friendlyReasons(m.eligibility).join(" · "))}</span>`;

    const fight = live
      ? `<span class="ar-strip-fight">· trận ${match.state === "adjourned" ? "đang hoãn" : "đang mở"}${match.waCount ? ` — ${match.waCount} WA` : ""}</span>`
      : "";

    const actions = [];
    if (canPromote) actions.push(`<button type="button" class="ar-strip-btn" data-ar="promote">Xác thực làm tham chiếu <span class="ar-strip-hint">· đã AC, 0 token</span></button>`);
    if (canConfirm) actions.push(`<button type="button" class="ar-strip-btn" data-ar="confirm">Xác nhận ~${m.problemRating}</button>`);
    if (live && match.state === "open") actions.push(`<button type="button" class="ar-strip-btn" data-ar="adjourn">Hoãn trận</button>`);
    if (live) actions.push(`<button type="button" class="ar-strip-btn ar-strip-danger" data-ar="surrender">Đầu hàng</button>`);

    strip.innerHTML = `<span class="ar-strip-g" aria-hidden="true">≠</span>${gate}${fight}<span class="ar-strip-sp"></span>${actions.join("")}`;
    strip.classList.remove("hidden");
  }

  // Xem trước tiền trận: which bug species have bitten the student before in
  // THIS problem's topic cluster (the repeat-error file as a scouting report on
  // yourself). One quiet line under the match-law line; absent = silent.
  async function refreshScout(pid) {
    const r = await nullOn(api.arenaScoutingReport(pid));
    if (app.state.currentId !== pid || stripPid !== pid) return;
    const old = strip.querySelector(".ar-scout");
    if (old) old.remove();
    if (!r || !r.ok || !Array.isArray(r.bugs) || !r.bugs.length) return;
    const div = document.createElement("div");
    div.className = "ar-scout";
    div.innerHTML = `<span class="ar-scout-g">◎</span>Xem trước: chủ đề này em từng sai vì ` +
      r.bugs.slice(0, 3).map((b) => `<b>${escapeHtml(b.label)}</b> ×${b.count}`).join(" · ");
    strip.appendChild(div);
  }

  async function refreshStrip(pid) {
    if (!pid) { hideStrip(); return; }
    const m = await nullOn(api.arenaMatch(pid));
    if (app.state.currentId !== pid) return; // switched away while fetching
    if (!m || !m.ok) { hideStrip(); return; }
    stripPid = pid;
    matchCache = m;
    renderStrip(pid, m);
    refreshScout(pid); // async, best-effort — appends its own row when it lands
  }

  strip.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ar]");
    if (!btn || app.state.currentId !== stripPid) return;
    const act = btn.dataset.ar;
    if (act === "promote") {
      btn.disabled = true; btn.textContent = "Đang xác thực…";
      const r = await nullOn(api.arenaPromoteFromAc(stripPid));
      if (r && r.ok && r.referencePromoted) {
        app.toast(r.ratingConfirmed ? "Đã xác thực tham chiếu + xác nhận rating — bài này giờ đủ điều kiện rated." : "Đã xác thực code AC cũ thành tham chiếu tin cậy.", "ok");
        refreshStrip(stripPid);
      } else {
        const why = { "sample-mismatch": "đề đã đổi từ lúc AC — không khớp sample nữa.", "no-compiler": "g++ chưa sẵn sàng.", "no-ac-code": "không tìm được code lúc AC." };
        app.toast(`Chưa xác thực được: ${(r && why[r.reason]) || "thử lại sau."}`, "err");
        btn.disabled = false; btn.textContent = "Xác thực làm tham chiếu";
      }
    } else if (act === "confirm") {
      const r = await nullOn(api.arenaConfirmRating(stripPid));
      if (r && r.ok) { app.toast("Đã xác nhận rating bài — trận này đủ điều kiện tính điểm hơn.", "ok"); refreshStrip(stripPid); refreshHud(); }
      else app.toast("Chưa xác nhận được (cần phân tích đề trước).", "err");
    } else if (act === "adjourn") {
      const r = await nullOn(api.arenaAdjourn(stripPid));
      if (r && r.ok) { app.toast("Đã hoãn trận — không mất điểm, về trả nợ lúc nào cũng được.", "ok"); refreshStrip(stripPid); }
    } else if (act === "surrender") {
      // Two-step confirm (no window.confirm — Electron shell). 3s to change your mind.
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1";
        btn.textContent = "Chắc chưa? Đầu hàng thật";
        setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ""; btn.textContent = "Đầu hàng"; } }, 3000);
        return;
      }
      const r = await nullOn(api.arenaSurrender(stripPid));
      if (r && r.ok) {
        const d = r.rating && r.rating.delta;
        app.toast(d ? `Đã đầu hàng (${d} điểm). Trận sau gỡ.` : "Đã đầu hàng — trận giao hữu, không mất điểm.", "ok");
        refreshStrip(stripPid);
        refreshHud();
      }
    }
  });

  // ---- Gauntlet runner with per-problem replay memory --------------------------
  // Same (pid, code) re-AC'd = replay the last result instantly, zero compute.
  let gauntletMemory = null; // { key, result }
  let gauntletAbort = null;

  async function runGauntlet(pid, code) {
    const key = `${pid}|${code}`;
    if (gauntletMemory && gauntletMemory.key === key) return { ...gauntletMemory.result, replayed: true };
    if (gauntletAbort) gauntletAbort.abort();
    gauntletAbort = new AbortController();
    try {
      const r = await api.arenaGauntlet(pid, { code }, { signal: gauntletAbort.signal });
      if (r) gauntletMemory = { key, result: r };
      return r;
    } catch (err) {
      if (err && err.aborted) return null;
      // NO_KEY etc. arrive as HTTP errors — normalize to the route's soft shape.
      const code2 = err && err.data && err.data.code;
      return { ok: false, reason: code2 === "NO_KEY" ? "no-key" : "error", note: err && err.message };
    } finally {
      gauntletAbort = null;
    }
  }

  // Sealed Gauntlet: same fight, but the reveal streams — onEvent(frame) gets
  // every real progress frame ({stage:"phase-start"|"progress"}). Shares the
  // replay memory with runGauntlet (a replayed result just skips the theater —
  // the theater was real the first time, replaying it would be a lie).
  async function runGauntletStream(pid, code, onEvent) {
    const key = `${pid}|${code}`;
    if (gauntletMemory && gauntletMemory.key === key) return { ...gauntletMemory.result, replayed: true };
    if (gauntletAbort) gauntletAbort.abort();
    gauntletAbort = new AbortController();
    try {
      const r = await api.arenaGauntletStream(pid, { code }, { signal: gauntletAbort.signal, onEvent });
      if (r) gauntletMemory = { key, result: r };
      return r;
    } catch (err) {
      if (err && err.aborted) return null;
      const code2 = err && err.data && err.data.code;
      return { ok: false, reason: code2 === "NO_KEY" ? "no-key" : "error", note: err && err.message };
    } finally {
      gauntletAbort = null;
    }
  }

  // ---- shared helpers for moment.js / journey.js -------------------------------
  app.arena = {
    friendlyReasons,
    rating: () => ratingCache,
    refreshHud,
    refreshStrip: () => refreshStrip(app.state.currentId),
    stakesFor: (pid) => nullOn(api.arenaStakes(pid)),
    ghostFor: (pid) => nullOn(api.arenaGhost(pid)),
    cardFor: (tag) => nullOn(api.arenaCard(tag)),
    reel: () => nullOn(api.arenaReel()),
    matchFor: (pid) => (pid === stripPid && matchCache ? Promise.resolve(matchCache) : nullOn(api.arenaMatch(pid))),
    runGauntlet,
    runGauntletStream,
    // Reject an illegitimate AI-generated counterexample — nullOn so a missing
    // route (older backend) degrades to a no-op instead of throwing.
    gauntletReject: (pid, body) => nullOn(api.arenaGauntletReject(pid, body)),
    abortGauntlet: () => { if (gauntletAbort) { gauntletAbort.abort(); gauntletAbort = null; } },
    // Đối Thủ & Sổ Cái (backend 2026-07-07) — same nullOn discipline: a
    // missing route must never break a caller. mysteryReroll keeps its error
    // (the 409 reason — cooldown/already-opened — IS the UI content).
    nextBet: () => nullOn(api.arenaNextBet()),
    mysteryOpen: () => nullOn(api.arenaMysteryOpen()),
    mysteryReroll: () => api.arenaMysteryReroll(),
    sealFor: (pid) => nullOn(api.arenaSeal(pid)),
    seals: () => nullOn(api.arenaSeals()),
    specimenQueue: () => nullOn(api.arenaSpecimenQueue()),
    bossCases: () => nullOn(api.arenaBossCases()),
  };

  // ---- lifecycle ----------------------------------------------------------------
  if (app.bus) {
    app.bus.on("problem:opened", ({ id } = {}) => { app.arena.abortGauntlet(); refreshStrip(id || app.state.currentId); });
    // After every judge the match state moved server-side; keep strip + HUD live.
    app.bus.on("verdict", (payload) => {
      if (payload && payload.kind === "judge") {
        refreshStrip(app.state.currentId);
        if (payload.arena && payload.arena.rating) refreshHud();
      }
    });
  }

  refreshHud();
}
