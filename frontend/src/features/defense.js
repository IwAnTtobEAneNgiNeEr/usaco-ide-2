// defense.js — 🎓 Bảo vệ AC (viva voce). After you AC a problem, the AI
// examiner asks 3 questions about YOUR code; you answer in your own words and
// get graded. Passing stamps meta.defense → the progress engine pays +25 XP.
// The cheapest known cure for "AC nhưng không hiểu vì sao AC".

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("defense-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "defense-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide defense-modal">
      <h2 class="modal-title">🎓 Bảo vệ AC <span id="defense-prob" class="defense-prob"></span></h2>
      <div id="defense-body" class="defense-body"></div>
      <div class="modal-actions">
        <button type="button" id="defense-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function introView(meta) {
  const prev = meta && meta.defense;
  const prevLine = prev && prev.passed
    ? `<p class="defense-prev">✅ Bạn đã bảo vệ thành công bài này (<b>${prev.score}/10</b>). Làm lại để luyện thêm — XP chỉ tính lần đầu.</p>`
    : "";
  return `
    ${prevLine}
    <p class="jh-muted">AI giám khảo sẽ đọc <b>code thật</b> của bạn và hỏi 3 câu: ý tưởng, độ phức tạp, edge case.
    Trả lời bằng lời của chính bạn (tiếng Việt thoải mái, ngắn mà trúng là được). Đạt ≥7/10 → <b>+25 XP</b>.</p>
    <div class="jh-actions" style="margin-top:14px">
      <button type="button" id="defense-start" class="btn btn-primary">Bắt đầu vấn đáp</button>
    </div>`;
}

function questionsView(questions) {
  return `
    <div class="defense-qs">
      ${questions.map((q, i) => `
        <div class="defense-q">
          <div class="defense-q-label">Câu ${i + 1}/3</div>
          <div class="defense-q-text">${escapeHtml(q)}</div>
          <textarea class="defense-answer" data-i="${i}" rows="3" spellcheck="false"
            placeholder="Trả lời của bạn…"></textarea>
        </div>`).join("")}
    </div>
    <div class="jh-actions" style="margin-top:6px">
      <button type="button" id="defense-submit" class="btn btn-primary">Nộp câu trả lời</button>
      <span class="jh-muted" style="align-self:center">Giám khảo chấm ý hiểu, không bắt bẻ câu chữ.</span>
    </div>`;
}

function resultView(r, questions) {
  const cls = r.passed ? "pass" : "fail";
  const rows = (r.feedback || []).map((f, i) => `
    <div class="defense-fb ${f.ok ? "ok" : "bad"}">
      <span class="defense-fb-mark">${f.ok ? "✓" : "✗"}</span>
      <div class="defense-fb-main">
        <div class="defense-fb-q">${escapeHtml(questions[i] || `Câu ${i + 1}`)}</div>
        <div class="defense-fb-c">${escapeHtml(f.comment || "")}</div>
      </div>
    </div>`).join("");
  return `
    <div class="defense-result ${cls}">
      <div class="defense-score">${r.score}<span>/10</span></div>
      <div class="defense-verdict">
        <div class="defense-verdict-line">${r.passed ? "🎉 Bảo vệ thành công! +25 XP" : "Chưa đạt — đọc nhận xét rồi thử lại nhé."}</div>
        ${r.summary ? `<div class="jh-muted">${escapeHtml(r.summary)}</div>` : ""}
      </div>
    </div>
    ${rows}
    ${r.passed ? "" : `<div class="jh-actions" style="margin-top:10px"><button type="button" id="defense-retry" class="btn btn-primary">Thử lại</button></div>`}`;
}

export function initDefense(app) {
  const modal = buildModal();
  const body = modal.querySelector("#defense-body");
  const probLabel = modal.querySelector("#defense-prob");
  const close = () => modal.classList.add("hidden");
  modal.querySelector("#defense-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  let questions = [];

  async function startInterview() {
    const id = app.state.currentId;
    body.innerHTML = `<p class="jh-muted"><span class="spinner"></span> Giám khảo đang đọc code của bạn…</p>`;
    try {
      const out = await api.defenseQuestions(id);
      questions = out.questions;
      body.innerHTML = questionsView(questions);
      const first = body.querySelector(".defense-answer");
      if (first) first.focus();
    } catch (err) {
      if (err.aborted) { close(); return; }
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  }

  async function submit() {
    const id = app.state.currentId;
    const answers = [...body.querySelectorAll(".defense-answer")].map((t) => t.value.trim());
    if (answers.some((a) => !a)) { app.toast("Hãy trả lời đủ cả 3 câu.", "err"); return; }
    const qa = questions.map((q, i) => ({ q, a: answers[i] }));
    const btn = body.querySelector("#defense-submit");
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Đang chấm…`; }
    try {
      const r = await api.defenseGrade(id, qa);
      body.innerHTML = resultView(r, questions);
      if (r.passed) {
        if (app.playSound) app.playSound("ac");
        // syncMeta picks up meta.defense → journey pays the +25 XP toast itself.
        if (app.syncMeta) app.syncMeta();
      } else if (app.playSound) app.playSound("wa");
    } catch (err) {
      if (err.aborted) { close(); return; }
      app.toast(err.message, "err");
      if (btn) { btn.disabled = false; btn.textContent = "Nộp câu trả lời"; }
    }
  }

  body.addEventListener("click", (e) => {
    if (e.target.closest("#defense-start")) startInterview();
    else if (e.target.closest("#defense-submit")) submit();
    else if (e.target.closest("#defense-retry")) startInterview();
  });

  app.openDefense = () => {
    const meta = app.state.meta;
    if (!app.state.currentId || !meta) { app.toast("Mở một bài đã AC trước đã.", "err"); return; }
    const hasAc = meta.lastVerdict === "AC" || (meta.history || []).some((h) => h.verdict === "AC");
    if (!hasAc) { app.toast("Bài này chưa AC — giải xong rồi mới bảo vệ được.", "err"); return; }
    probLabel.textContent = "· " + (meta.title || "");
    body.innerHTML = introView(meta);
    modal.classList.remove("hidden");
  };

  // A third button on the AC banner (next to the Synthesizer's), so the
  // invitation appears exactly when you've just earned an AC.
  const acBanner = document.getElementById("ac-banner");
  if (acBanner) {
    const btn = document.createElement("button");
    btn.id = "btn-defense";
    btn.className = "btn btn-ai btn-sm";
    btn.type = "button";
    btn.style.background = "rgba(34,197,94,0.15)";
    btn.style.color = "#4ade80";
    btn.textContent = "🎓 Bảo vệ AC (+25 XP)";
    btn.addEventListener("click", () => app.openDefense());
    acBanner.appendChild(btn);
  }
}
