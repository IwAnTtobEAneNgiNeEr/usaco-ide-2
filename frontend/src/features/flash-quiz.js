// flash-quiz.js — ⚡ Flash Quiz: 3 quick multiple-choice questions distilled
// by the AI from YOUR own mistakes.md notebook. Spaced recall in 30 seconds —
// "did the lesson from that old WA actually stick?". Opens from the palette,
// the Mistake Notebook, or the Journey home.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function buildModal() {
  const existing = document.getElementById("quiz-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "quiz-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal quiz-modal">
      <h2 class="modal-title">⚡ Flash Quiz <span class="quiz-sub">· ôn lỗi sai cũ</span></h2>
      <div id="quiz-body" class="quiz-body"></div>
      <div class="modal-actions">
        <button type="button" id="quiz-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initFlashQuiz(app) {
  const modal = buildModal();
  const body = modal.querySelector("#quiz-body");
  const close = () => modal.classList.add("hidden");
  modal.querySelector("#quiz-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  let questions = [];
  let idx = 0;
  let correct = 0;
  let answered = false;

  function renderQuestion() {
    const q = questions[idx];
    answered = false;
    body.innerHTML = `
      <div class="quiz-progress">
        ${questions.map((_, i) => `<span class="quiz-dot ${i < idx ? "done" : i === idx ? "now" : ""}"></span>`).join("")}
        <span class="quiz-count">${idx + 1}/${questions.length}</span>
      </div>
      <div class="quiz-q">${escapeHtml(q.q)}</div>
      <div class="quiz-choices">
        ${q.choices.map((c, i) => `
          <button type="button" class="quiz-choice" data-i="${i}">
            <span class="quiz-key">${String.fromCharCode(65 + i)}</span>
            <span class="quiz-text">${escapeHtml(c)}</span>
          </button>`).join("")}
      </div>
      <div id="quiz-explain" class="quiz-explain hidden"></div>
      <div id="quiz-next-row" class="jh-actions hidden" style="margin-top:12px">
        <button type="button" id="quiz-next" class="btn btn-primary">${idx === questions.length - 1 ? "Xem kết quả" : "Câu tiếp →"}</button>
      </div>`;
  }

  function reveal(picked) {
    if (answered) return;
    answered = true;
    const q = questions[idx];
    const ok = picked === q.answerIndex;
    if (ok) correct += 1;
    body.querySelectorAll(".quiz-choice").forEach((btn) => {
      const i = Number(btn.dataset.i);
      btn.disabled = true;
      if (i === q.answerIndex) btn.classList.add("correct");
      else if (i === picked) btn.classList.add("wrong");
    });
    const exp = body.querySelector("#quiz-explain");
    exp.className = `quiz-explain ${ok ? "ok" : "bad"}`;
    exp.innerHTML = `<b>${ok ? "✓ Chính xác!" : "✗ Chưa đúng."}</b> ${escapeHtml(q.explain || "")}`;
    body.querySelector("#quiz-next-row").classList.remove("hidden");
    if (app.playSound) app.playSound(ok ? "success" : "wa");
  }

  function renderResult() {
    const pct = Math.round((correct / questions.length) * 100);
    const tone = pct >= 67 ? "good" : pct >= 34 ? "mid" : "low";
    const msg = pct === 100 ? "Hoàn hảo! Bài học đã thấm." :
      pct >= 67 ? "Khá tốt — vẫn còn chỗ cần xem lại." :
      "Lỗi cũ vẫn đang rình rập. Mở Sổ tay lỗi đọc lại nhé.";
    body.innerHTML = `
      <div class="quiz-result ${tone}">
        <div class="quiz-result-score">${correct}<span>/${questions.length}</span></div>
        <div class="quiz-result-msg">${msg}</div>
      </div>
      <div class="jh-actions" style="justify-content:center;margin-top:14px">
        <button type="button" id="quiz-again" class="btn btn-ghost">⚡ Bộ câu mới</button>
        <button type="button" id="quiz-book" class="btn btn-ghost">📕 Mở sổ tay</button>
      </div>`;
  }

  body.addEventListener("click", (e) => {
    const choice = e.target.closest(".quiz-choice");
    if (choice) { reveal(Number(choice.dataset.i)); return; }
    if (e.target.closest("#quiz-next")) {
      if (idx < questions.length - 1) { idx += 1; renderQuestion(); }
      else renderResult();
      return;
    }
    if (e.target.closest("#quiz-again")) { app.openFlashQuiz(); return; }
    if (e.target.closest("#quiz-book")) { close(); if (app.openMistakeBook) app.openMistakeBook(); }
  });

  app.openFlashQuiz = async () => {
    modal.classList.remove("hidden");
    body.innerHTML = `<p class="jh-muted"><span class="spinner"></span> AI đang soạn quiz từ sổ tay lỗi sai của bạn…</p>`;
    idx = 0; correct = 0; questions = [];
    try {
      const out = await api.flashQuiz();
      questions = out.questions;
      renderQuestion();
    } catch (err) {
      if (err.aborted) { close(); return; }
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  };
}
