// synthesizer.js — the "📈 Nâng cấp" button. Appears ONLY after a problem has
// been solved (an AC in its history). It asks the AI to build a HARDER VARIANT of
// the same problem and explain why a stronger technique is required (e.g. naive
// recursion → memoized DP once N gets large). The payload is cached on disk, so a
// second open never re-spends tokens. It never reveals a full solution; the user
// can spin the variant into a new linked problem to go solve it.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("synth-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "synth-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide synth-modal">
      <h2 class="modal-title">📈 Bản nâng cấp · vì sao cần kỹ thuật mạnh hơn</h2>
      <p class="panel-hint">AI đẩy ràng buộc của bài lên để cách giải cũ "hỏng", rồi chỉ ra kỹ thuật phù hợp hơn và điểm khác biệt cốt lõi. Không đưa lời giải đầy đủ.</p>
      <div id="synth-body" class="synth-body"></div>
      <div class="modal-actions">
        <button type="button" id="synth-regen" class="btn btn-ghost btn-sm hidden">↻ Tạo lại</button>
        <span class="toolbar-spacer"></span>
        <button type="button" id="synth-create" class="btn btn-primary btn-sm hidden">+ Tạo bài nâng cấp để giải</button>
        <button type="button" id="synth-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function renderResult(r) {
  if (!r || !r.baiNangCap) {
    return `<div class="synth-optimal">
      <div class="synth-optimal-glyph">✓</div>
      <p>Bài này đã ở mức tối ưu hợp lý — không có biến thể khó hơn rõ ràng.</p>
      ${r && r.khacBietCotLoi ? `<p class="muted">${escapeHtml(r.khacBietCotLoi)}</p>` : ""}
    </div>`;
  }
  const list = (label, arr) => (arr && arr.length)
    ? `<div class="synth-sec"><div class="synth-label">${label}</div><ul class="synth-list">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`
    : "";

  return [
    // The "why it exists" complexity story, front and center.
    `<div class="synth-shift">
      <div class="synth-shift-col">
        <span class="synth-shift-tag">Cách cũ</span>
        <code class="synth-bigo synth-bigo-old">${escapeHtml(r.doPhucTapCu || "?")}</code>
      </div>
      <span class="synth-arrow">→</span>
      <div class="synth-shift-col">
        <span class="synth-shift-tag">${escapeHtml(r.kyThuatMoi || "Kỹ thuật mới")}</span>
        <code class="synth-bigo synth-bigo-new">${escapeHtml(r.doPhucTapMoi || "?")}</code>
      </div>
    </div>`,
    r.rangBuocMoi ? `<div class="synth-sec"><div class="synth-label">Ràng buộc bị đẩy lên</div><p class="synth-p synth-constraint">${escapeHtml(r.rangBuocMoi)}</p></div>` : "",
    r.viSaoHong ? `<div class="synth-sec"><div class="synth-label synth-label-warn">Vì sao cách cũ hỏng</div><p class="synth-p">${escapeHtml(r.viSaoHong)}</p></div>` : "",
    r.khacBietCotLoi ? `<div class="synth-sec"><div class="synth-label synth-label-key">Khác biệt cốt lõi</div><p class="synth-p">${escapeHtml(r.khacBietCotLoi)}</p></div>` : "",
    list("Cạm bẫy khi cài kỹ thuật mới", r.camBay),
    list("Lộ trình ý tưởng (không có lời giải)", r.loTrinh),
    r.baiNangCap ? `<div class="synth-sec"><div class="synth-label">Đề bài nâng cấp</div><div class="synth-statement">${escapeHtml(r.baiNangCap)}</div></div>` : ""
  ].join("");
}

export function initSynthesizer(app) {
  const trigger = document.getElementById("btn-synth");
  if (!trigger) return;
  const modal = buildModal();
  const body = modal.querySelector("#synth-body");
  const createBtn = modal.querySelector("#synth-create");
  const regenBtn = modal.querySelector("#synth-regen");
  let lastResult = null;
  let synthAbort = null;
  const triggerLabel = trigger.textContent;

  const close = () => modal.classList.add("hidden");
  modal.querySelector("#synth-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // Reveal the toolbar "📈 Bản khó hơn" button once the open problem has any AC.
  app.refreshSynthAvail = () => {
    const meta = app.state.meta;
    const hasAc = !!(meta && Array.isArray(meta.history) && meta.history.some((h) => h.verdict === "AC"));
    trigger.classList.toggle("hidden", !hasAc);
  };

  function setSynthStop(active) {
    if (active) {
      trigger.textContent = "⏹ Dừng";
      trigger.classList.add("btn-stop");
    } else {
      trigger.textContent = triggerLabel;
      trigger.classList.remove("btn-stop");
    }
  }

  async function load(force) {
    // Mid-flight: abort the running synthesis.
    if (synthAbort) { synthAbort.abort(); return; }
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const pid = app.state.currentId;
    synthAbort = new AbortController();
    setSynthStop(true);
    body.innerHTML = `<p class="muted"><span class="spinner"></span> AI đang dựng bản nâng cấp…</p>`;
    createBtn.classList.add("hidden");
    regenBtn.classList.add("hidden");
    modal.classList.remove("hidden");
    try {
      const res = await api.aiSynthesize({ problemId: pid, force: !!force }, { signal: synthAbort.signal });
      if (app.state.currentId !== pid) { close(); return; } // switched problems mid-flight
      lastResult = res.result || {};
      body.innerHTML = renderResult(lastResult);
      regenBtn.classList.remove("hidden");
      createBtn.classList.toggle("hidden", !lastResult.baiNangCap);
    } catch (err) {
      if (err && err.aborted) {
        body.innerHTML = `<p class="muted">⏹ Đã dừng tạo bản nâng cấp.</p>`;
      } else {
        body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
        if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      synthAbort = null;
      setSynthStop(false);
    }
  }

  trigger.addEventListener("click", () => load(false));
  regenBtn.addEventListener("click", () => load(true));

  createBtn.addEventListener("click", async () => {
    if (!lastResult || !lastResult.baiNangCap) return;
    const meta = app.state.meta || {};
    createBtn.disabled = true;
    try {
      const note = [
        `# Bản nâng cấp của: ${meta.title || ""}`,
        "",
        lastResult.baiNangCap,
        "",
        lastResult.rangBuocMoi ? `**Ràng buộc mới:** ${lastResult.rangBuocMoi}` : "",
        lastResult.kyThuatMoi ? `**Kỹ thuật gợi ý:** ${lastResult.kyThuatMoi} (${lastResult.doPhucTapMoi || ""})` : ""
      ].filter(Boolean).join("\n");
      const { problem } = await api.createProblem({
        title: `${meta.title || "Bài"} (nâng cấp)`,
        source: meta.source || "",
        topic: meta.topic || "",
        difficulty: "hard",
        status: "learning",
        statement: note
      });
      await app.refreshProblems();
      app.selectProblem(problem.id);
      close();
      app.toast("Đã tạo bài nâng cấp — bắt đầu giải nhé.", "ok");
    } catch (err) {
      app.toast(err.message, "err");
    } finally {
      createBtn.disabled = false;
    }
  });
}
