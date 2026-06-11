// mistake-book.js — 📕 Sổ tay lỗi sai: every problem's mistakes.md (written by
// the Learning-from-WA analysis) gathered into one place to re-read before a
// contest. The classic competitive-programming "error journal", automated.
//
// Opens from the command palette, the dashboard, or the Journey home.

import { api } from "../api.js";
import { escapeHtml, renderMarkdown } from "../md.js";

function buildModal() {
  const existing = document.getElementById("mbook-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "mbook-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide mbook-modal">
      <h2 class="modal-title">📕 Sổ tay lỗi sai</h2>
      <p class="panel-hint">Mọi phân tích WA của bạn, gom lại một chỗ. Đọc lại 5 phút trước giờ luyện — cách rẻ nhất để không sai lại lỗi cũ.</p>
      <div id="mbook-body" class="mbook-body"></div>
      <div class="modal-actions">
        <button type="button" id="mbook-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function render(items) {
  if (!items.length) {
    return `<p class="jh-muted" style="padding:18px 4px">Chưa có ghi chép nào. Khi một bài bị WA nhiều lần, hãy bấm
      <b>🧠 Analyze My Mistakes</b> trong tab Run — phân tích sẽ được lưu vào đây.</p>`;
  }
  return items.map((it, i) => `
    <details class="mbook-entry" ${i === 0 ? "open" : ""}>
      <summary class="mbook-summary">
        <span class="mbook-title">${escapeHtml(it.title)}</span>
        ${it.topic ? `<span class="jh-tag">${escapeHtml(it.topic)}</span>` : ""}
        ${it.lastVerdict ? `<span class="jh-verdict ${it.lastVerdict === "AC" ? "jh-v-ac" : "jh-v-wa"}">${escapeHtml(it.lastVerdict)}</span>` : ""}
        <button type="button" class="btn btn-ghost btn-sm mbook-open" data-id="${escapeHtml(it.id)}">Mở bài →</button>
      </summary>
      <div class="md-preview mbook-md">${renderMarkdown(it.content)}</div>
    </details>`).join("");
}

export function initMistakeBook(app) {
  const modal = buildModal();
  const body = modal.querySelector("#mbook-body");
  const close = () => modal.classList.add("hidden");
  modal.querySelector("#mbook-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  body.addEventListener("click", (e) => {
    const btn = e.target.closest(".mbook-open");
    if (!btn) return;
    e.preventDefault();
    close();
    app.selectProblem(btn.dataset.id);
  });

  app.openMistakeBook = async () => {
    modal.classList.remove("hidden");
    body.innerHTML = `<p class="jh-muted"><span class="spinner"></span> Đang gom sổ tay…</p>`;
    try {
      const { items } = await api.mistakeBook();
      body.innerHTML = render(items || []);
    } catch (err) {
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  };
}
