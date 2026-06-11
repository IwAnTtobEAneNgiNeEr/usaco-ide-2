// code-review.js — AI Code Reviewer. Sends the current code + statement to the
// AI and renders a structured diagnosis (bugs, complexity, overflow/UB risks,
// missing edge cases, style). It points at problems; it does not hand over a
// full optimal solution. Builds its own modal; triggered by #btn-review.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("review-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "review-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide">
      <h2 class="modal-title">🔍 AI soi code</h2>
      <p class="panel-hint">AI chỉ ra bug, độ phức tạp, rủi ro tràn số/UB và edge case còn thiếu trong code hiện tại. Không viết hộ lời giải.</p>
      <div id="review-body" class="mistakes-body"></div>
      <div class="modal-actions">
        <button type="button" id="review-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function render(review) {
  const list = (label, arr, cls) => (arr && arr.length)
    ? `<div class="mk-section"><div class="mk-label ${cls || ""}">${label}</div><ul class="mk-list">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`
    : "";
  return [
    review.tongQuan ? `<p class="mk-overview">${escapeHtml(review.tongQuan)}</p>` : "",
    list("🐞 Lỗi / nghi vấn", review.loi, "mk-bad"),
    review.doPhucTap ? `<div class="mk-section"><div class="mk-label mk-tech">⏱ Độ phức tạp</div><p class="mk-overview">${escapeHtml(review.doPhucTap)}</p></div>` : "",
    list("⚠ Rủi ro (tràn số / UB)", review.rui_ro, "mk-warn"),
    list("➕ Edge case dễ thiếu", review.edgeCase),
    list("✦ Gợi ý cách viết", review.style, "mk-tech")
  ].join("") || `<p class="muted">AI không tìm thấy vấn đề rõ ràng nào. Code có vẻ ổn 👍</p>`;
}

export function initCodeReview(app) {
  const trigger = document.getElementById("btn-review");
  if (!trigger) return;
  const modal = buildModal();
  const body = modal.querySelector("#review-body");
  const close = () => modal.classList.add("hidden");
  modal.querySelector("#review-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  let reviewAbort = null;
  const triggerLabel = trigger.textContent;

  trigger.addEventListener("click", async () => {
    // Mid-flight: abort the running review.
    if (reviewAbort) { reviewAbort.abort(); return; }
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    reviewAbort = new AbortController();
    trigger.textContent = "⏹ Dừng";
    trigger.classList.add("btn-stop");
    body.innerHTML = `<p class="muted"><span class="spinner"></span> AI đang đọc code…</p>`;
    modal.classList.remove("hidden");
    try {
      const res = await api.aiReviewCode({ problemId: app.state.currentId, code: app.getEditorValue() }, { signal: reviewAbort.signal });
      body.innerHTML = render(res.review || {});
    } catch (err) {
      if (err && err.aborted) {
        body.innerHTML = `<p class="muted">⏹ Đã dừng soi code.</p>`;
      } else {
        body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
        if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      reviewAbort = null;
      trigger.textContent = triggerLabel;
      trigger.classList.remove("btn-stop");
    }
  });
}
