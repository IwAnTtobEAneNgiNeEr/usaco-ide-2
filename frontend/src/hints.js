// hints.js — leveled AI hints (1=nudge, 2=technique, 3=approach). Never the full solution.

import { api } from "./api.js";
import { escapeHtml } from "./md.js";

export function initHints(app) {
  const { el } = app;

  app.openHint = () => {
    if (!app.state.currentId) { app.toast("Open a problem first.", "err"); return; }
    el.hintBody.innerHTML = `<span class="muted">Pick a hint level. Higher = stronger, but never the full solution.</span>`;
    el.hintModal.classList.remove("hidden");
  };
  const close = () => el.hintModal.classList.add("hidden");
  el.hintClose.addEventListener("click", close);
  el.hintModal.addEventListener("click", (e) => { if (e.target === el.hintModal) close(); });

  // One controller shared by the three level buttons: clicking any level while
  // a hint is in flight aborts it (same ⏹ Dừng pattern as every other AI feature).
  let hintAbort = null;
  let busyBtn = null;
  const setBusy = (btn) => {
    busyBtn = btn;
    if (btn) { btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = "⏹ Dừng"; btn.classList.add("btn-stop"); }
  };
  const clearBusy = () => {
    if (busyBtn) { busyBtn.textContent = busyBtn.dataset.label; busyBtn.classList.remove("btn-stop"); }
    busyBtn = null;
  };

  el.hintModal.querySelectorAll(".hint-levels [data-level]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (hintAbort) { hintAbort.abort(); return; } // mid-flight: stop the running hint
      hintAbort = new AbortController();
      setBusy(btn);
      const level = Number(btn.dataset.level);
      el.hintBody.innerHTML = `<span class="spinner"></span> Thinking of a level ${level} hint…`;
      try {
        const { hint } = await api.aiHint({
          problemId: app.state.currentId,
          level,
          statement: app.el.ioStatement.value,
          code: app.getEditorValue()
        }, { signal: hintAbort.signal });
        el.hintBody.innerHTML =
          (hint.technique ? `<span class="hint-tech">${escapeHtml(hint.technique)}${hint.difficulty ? " · " + escapeHtml(hint.difficulty) : ""}</span>` : "") +
          `<div>${escapeHtml(hint.hint || "(no hint returned)")}</div>`;
      } catch (err) {
        if (err && err.aborted) {
          el.hintBody.innerHTML = `<span class="muted">⏹ Đã dừng.</span>`;
        } else {
          el.hintBody.innerHTML = `<span style="color:var(--wa)">${escapeHtml(err.message)}</span>`;
          if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); }
        }
      } finally {
        hintAbort = null;
        clearBusy();
      }
    });
  });
}
