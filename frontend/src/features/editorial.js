// editorial.js — Post-AC "📘 Lời giải chuẩn" button + modal.
//
// Appears in the AC banner once a problem has at least one AC in its history
// (shares the same banner as the Synthesizer; the Synthesizer's "fast AC" gate
// applies to ITS button, not ours). Calls /api/ai/editorial which caches the
// payload to editorial.json by statement hash, so re-opening is instant.

import { api } from "../api.js";
import { renderMarkdown, escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("editorial-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "editorial-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide editorial-modal">
      <h2 class="modal-title">📘 Lời giải chuẩn</h2>
      <p class="panel-hint">Đối chiếu với cách bạn vừa AC. Đây là tham khảo, không phải tiêu chuẩn duy nhất.</p>
      <div id="editorial-body" class="editorial-body"></div>
      <div class="modal-actions">
        <button type="button" id="editorial-regen" class="btn btn-ghost btn-sm hidden">↻ Viết lại</button>
        <span class="toolbar-spacer"></span>
        <button type="button" id="editorial-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function renderResult(r) {
  if (!r || (!r.loiGiai && !r.luuY)) {
    return `<p class="muted">AI chưa tổng hợp được lời giải đủ rõ. Thử lại sau.</p>`;
  }
  const tags = (r.kyThuat && r.kyThuat.length)
    ? `<div class="ed-tags">${r.kyThuat.map((t) => `<span class="ed-tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const complexity = r.doPhucTap
    ? `<div class="ed-sec"><div class="ed-label">Độ phức tạp</div><p class="ed-p">${escapeHtml(r.doPhucTap)}</p></div>`
    : "";
  const lessons = (r.baiHoc && r.baiHoc.length)
    ? `<div class="ed-sec"><div class="ed-label">Bài học rút ra</div><ul class="ed-list">${r.baiHoc.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`
    : "";
  const warn = r.luuY
    ? `<div class="ed-sec ed-warn"><div class="ed-label">Lưu ý</div><p class="ed-p">${escapeHtml(r.luuY)}</p></div>`
    : "";
  const body = r.loiGiai
    ? `<div class="ed-sec"><div class="ed-label">Lời giải</div><div class="ed-md">${renderMarkdown(r.loiGiai)}</div></div>`
    : "";
  return tags + body + complexity + lessons + warn;
}

export function initEditorial(app) {
  const banner = document.getElementById("ac-banner");
  if (!banner) return;

  // Inject the "Lời giải chuẩn" button next to the existing Synthesizer button.
  const btn = document.createElement("button");
  btn.id = "btn-editorial";
  btn.type = "button";
  btn.className = "btn btn-ai btn-sm";
  btn.style.background = "rgba(34,197,94,0.15)";
  btn.style.color = "#4ade80";
  btn.style.marginLeft = "6px";
  btn.textContent = "📘 Lời giải chuẩn";
  btn.title = "Xem lời giải chuẩn của bài này (cache nên không tốn token mỗi lần mở)";
  banner.appendChild(btn);
  const btnLabel = btn.textContent;

  const modal = buildModal();
  const body = modal.querySelector("#editorial-body");
  const regenBtn = modal.querySelector("#editorial-regen");
  let edAbort = null;

  const close = () => modal.classList.add("hidden");
  modal.querySelector("#editorial-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  function setStop(active) {
    btn.textContent = active ? "⏹ Dừng" : btnLabel;
    btn.classList.toggle("btn-stop", active);
  }

  async function load(force) {
    // Mid-flight: abort the running generation.
    if (edAbort) { edAbort.abort(); return; }
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const pid = app.state.currentId;
    edAbort = new AbortController();
    setStop(true);
    body.innerHTML = `<p class="muted"><span class="spinner"></span> AI đang viết lời giải chuẩn…</p>`;
    regenBtn.classList.add("hidden");
    modal.classList.remove("hidden");
    try {
      const res = await api.aiEditorial({ problemId: pid, force: !!force }, { signal: edAbort.signal });
      if (app.state.currentId !== pid) { close(); return; } // switched problems mid-flight
      body.innerHTML = renderResult(res.result || {});
      regenBtn.classList.remove("hidden");
      if (res.cached) app.toast("Mở lời giải đã lưu (không tốn token).", "ok");
    } catch (err) {
      if (err && err.aborted) {
        body.innerHTML = `<p class="muted">⏹ Đã dừng tạo lời giải.</p>`;
      } else {
        body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
        if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      edAbort = null;
      setStop(false);
    }
  }

  btn.addEventListener("click", () => load(false));
  regenBtn.addEventListener("click", () => load(true));

  // Banner visibility: show the button as soon as the problem has any AC. The
  // synthesizer banner itself only shows on "fast AC" (≤5 runs); since we live
  // INSIDE it, we additionally toggle our own button to always-on-AC by promoting
  // the banner whenever an AC exists. The Synthesizer's button stays gated.
  const synthRefresh = app.refreshSynthAvail;
  app.refreshSynthAvail = () => {
    if (synthRefresh) synthRefresh();
    const meta = app.state.meta;
    if (!meta || !Array.isArray(meta.history)) { btn.classList.add("hidden"); return; }
    const hasAc = meta.history.some((h) => h.verdict === "AC");
    btn.classList.toggle("hidden", !hasAc);
    // If banner was hidden purely because the AC wasn't "fast" but we still
    // want to expose this button, show the banner with only our button.
    if (hasAc && banner.classList.contains("hidden")) {
      banner.classList.remove("hidden");
      const synthBtn = document.getElementById("btn-synth");
      const chrono = meta.history.slice().reverse();
      const firstAcIdx = chrono.findIndex((h) => h.verdict === "AC");
      const isFastAc = firstAcIdx >= 0 && firstAcIdx < 5;
      if (synthBtn) synthBtn.classList.toggle("hidden", !isFastAc);
    }
  };
}
