// flash-quiz.js — ⚡ Ôn lỗi nhanh (Flash Quiz), finally real (README-AUTOPILOT.md
// flow v2).
//
// journey.css has carried a full set of .quiz-* styles since v4.6 for a
// feature nobody ever built; this file is the missing half. Every question is
// the student's OWN recorded mistake: the backend (GET /api/planner/quiz)
// reads the Student Model's recurringBugs, resolves their moment/<ts>.json
// evidence files, and asks the student to re-classify last week's bug — pure
// active recall, zero AI calls, zero invented content (README-LOOPS §1.2).
//
// Data honesty (FEATURE-RULES §4): 1-2 questions repeating is worse than
// nothing, so a session needs at least MIN_QUESTIONS distinct mistakes; below
// that we teach instead of quizzing. And two consecutive opens must not feel
// identical — buildSession() rotates by recency (localStorage) and reshuffles
// answer order, so the pool never presents the same way twice in a row.
//
// Entry points: the Giáo Án Động plan card on the home, and the AC card's
// "Nước đi tiếp theo" when the planner schedules a quiz. Both call
// app.openFlashQuiz().

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const KEYS = ["A", "B", "C", "D"];

// Rotation state — the anti-repeat memory (FEATURE-RULES §4.4).
const RECENT_KEY = "usaco2.quizRecent";
const SESSION_MAX = 6;   // most questions in one sitting
const MIN_QUESTIONS = 3; // below this, teach instead of quizzing

function qKey(q) { return `${q.tag || ""}|${String(q.why || "").slice(0, 60)}`; }

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(keys) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(keys.slice(-16))); } catch { /* private mode */ }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Order least-recently-seen first, cap the session, shuffle each question's
// choices, then remember what we showed so the next open differs.
function buildSession(all) {
  const recent = loadRecent();
  const seen = new Set(recent);
  const unseen = shuffle(all.filter((q) => !seen.has(qKey(q))));
  const seenQ = shuffle(all.filter((q) => seen.has(qKey(q))));
  const ordered = [...unseen, ...seenQ].slice(0, SESSION_MAX);
  ordered.forEach((q) => { const o = buildOptions(q, all); q._mode = o.mode; q._prompt = o.prompt; q._options = o.options; q._long = o.long; });
  saveRecent([...recent, ...ordered.map(qKey)]);
  return ordered;
}

// Two archetypes over the SAME real data, so a small pool still feels varied
// (FEATURE-RULES §4 — the fix for "1-2 câu lặp đi lặp lại"):
//   • classify — the error text is given, pick its TYPE (the original).
//   • situation — the error TYPE is given, pick the real situation the student
//     hit it in, with other recorded mistakes as distractors.
// Both resolve to option.correct, so the answer path is archetype-agnostic.
function buildOptions(q, pool) {
  const others = pool.filter((o) => o.why && o.why !== q.why);
  const canSituation = q.why && q.tagLabel && others.length >= 2;
  if (canSituation && Math.random() < 0.5) {
    const distractors = shuffle(others).slice(0, 3).map((o) => ({ label: o.why, correct: false }));
    return {
      mode: "situation",
      prompt: `Lỗi loại <b>«${escapeHtml(q.tagLabel)}»</b> — em từng dính ở tình huống nào?`,
      options: shuffle([{ label: q.why, correct: true }, ...distractors]),
      long: true,
    };
  }
  return {
    mode: "classify",
    prompt: `Ván trước em dính lỗi này:<br><span class="quiz-why">“${escapeHtml(q.why)}”</span><br>Nó thuộc loại lỗi nào?`,
    options: shuffle((q.choices || []).map((c) => ({ label: c.label, correct: c.tag === q.tag }))),
    long: false,
  };
}

function renderDots(idx, total, answers) {
  const dots = Array.from({ length: total }, (_, i) => {
    const cls = i < idx ? "done" : i === idx ? "now" : "";
    return `<span class="quiz-dot ${cls}"></span>`;
  }).join("");
  return `<div class="quiz-progress">${dots}<span class="quiz-count">${Math.min(idx + 1, total)}/${total}</span></div>`;
}

function renderQuestion(q, idx, total) {
  const opts = q._options || [];
  return `
    ${renderDots(idx, total)}
    <div class="quiz-q">${q._prompt}</div>
    <div class="quiz-choices ${q._long ? "quiz-choices-long" : ""}">
      ${opts.map((o, i) => `
        <button type="button" class="quiz-choice" data-idx="${i}" data-correct="${o.correct ? "1" : "0"}">
          <span class="quiz-key">${KEYS[i]}</span><span>${escapeHtml(o.label)}</span>
        </button>`).join("")}
    </div>
    <div id="quiz-explain-slot"></div>`;
}

function renderExplain(q, correct) {
  const seen = q.seenCount > 1 ? ` Lỗi này em đã gặp <b>${q.seenCount} lần</b> — đáng một chỗ trong trí nhớ.` : "";
  const wrongLine = q._mode === "situation"
    ? `Chưa đúng — ô xanh mới là tình huống của lỗi «${escapeHtml(q.tagLabel)}».`
    : `Chưa đúng — đây là <b>${escapeHtml(q.tagLabel)}</b>.`;
  return `<div class="quiz-explain ${correct ? "ok" : "bad"}">
    ${correct ? "Chuẩn." : wrongLine}
    ${q.hint ? ` Mẹo cũ của Coach: ${escapeHtml(q.hint)}` : ""}${seen}
  </div>
  <div class="quiz-nav"><button type="button" class="btn btn-primary btn-sm" id="quiz-next">Câu tiếp →</button></div>`;
}

function renderResult(score, total) {
  const cls = score === total ? "good" : score >= Math.ceil(total / 2) ? "mid" : "low";
  const msg = score === total
    ? "Sạch bóng — các bài học cũ vẫn còn nguyên trong đầu."
    : score >= Math.ceil(total / 2)
      ? "Nhớ được phần lớn — câu sai chính là chỗ đáng đọc lại Sổ tay lỗi."
      : "Quên gần hết rồi — mở Sổ tay lỗi đọc lại 2 phút, đáng giá hơn giải bài mới.";
  return `<div class="quiz-result ${cls}">
    <div class="quiz-result-score">${score}<span>/${total}</span></div>
    <div class="quiz-result-msg">${msg}</div>
  </div>
  <div class="quiz-nav">
    <button type="button" class="btn btn-ghost btn-sm" id="quiz-retry">Làm lại</button>
    <button type="button" class="btn btn-primary btn-sm" id="quiz-done">Xong</button>
  </div>`;
}

// Teaching state — shown when there aren't enough real mistakes yet. Copy adapts
// to whether the file is empty or just too thin for a worthwhile session.
function renderEmpty(count = 0) {
  const head = count === 0
    ? "Chưa có lỗi nào để ôn."
    : `Mới có <b>${count}</b> lỗi trong sổ — chưa đủ cho một lượt ôn.`;
  return `<div class="quiz-q" style="margin-top:8px">${head}</div>
  <p class="muted" style="font-size:12.5px;line-height:1.6">Ôn lỗi nhanh lấy câu hỏi từ <b>lỗi lặp của chính em</b> — mỗi lần Coach chẩn đoán một ván WA/RE/TLE, lỗi đó vào Sổ hồ sơ. Giải thêm vài bài rồi quay lại; không có dữ liệu thật thì không bịa câu hỏi.</p>`;
}

export function initFlashQuiz(app) {
  const modal = document.getElementById("quiz-modal");
  const body = document.getElementById("quiz-body");
  const closeBtn = document.getElementById("quiz-close");
  if (!modal || !body) return; // markup not present — feature off

  const closeModal = () => modal.classList.add("hidden");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  let questions = [];
  let idx = 0;
  let score = 0;

  function showQuestion() {
    if (idx >= questions.length) {
      body.innerHTML = renderResult(score, questions.length);
      body.querySelector("#quiz-retry")?.addEventListener("click", () => { idx = 0; score = 0; showQuestion(); });
      body.querySelector("#quiz-done")?.addEventListener("click", closeModal);
      return;
    }
    const q = questions[idx];
    body.innerHTML = renderQuestion(q, idx, questions.length);
    body.querySelectorAll(".quiz-choice").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (body.querySelector("#quiz-explain-slot").children.length) return; // already answered
        const correct = btn.dataset.correct === "1";
        if (correct) score += 1;
        body.querySelectorAll(".quiz-choice").forEach((b) => {
          b.disabled = true;
          if (b.dataset.correct === "1") b.classList.add("correct");
          else if (b === btn) b.classList.add("wrong");
        });
        const slot = body.querySelector("#quiz-explain-slot");
        slot.innerHTML = renderExplain(q, correct);
        slot.querySelector("#quiz-next").addEventListener("click", () => { idx += 1; showQuestion(); });
        slot.querySelector("#quiz-next").focus();
        // ⚔ Every answer trains this error's mastery. Three correct in a row
        // marks it as mastered; a miss puts a mastered one back on review.
        // Quietly appended to the explain line — the quiz never waits on this.
        const trained = await api.arenaCardTrain(q.tag, correct);
        if (trained && trained.ok) {
          const ex = slot.querySelector(".quiz-explain");
          if (ex && trained.tamedJustNow) ex.insertAdjacentHTML("beforeend", ` <b>Lỗi «${escapeHtml(q.tagLabel)}» giờ đã nắm vững.</b>`);
          else if (ex && trained.escaped) ex.insertAdjacentHTML("beforeend", ` Lỗi «${escapeHtml(q.tagLabel)}» cần ôn lại — đúng 3 lần liên tiếp để nắm vững.`);
        }
      });
    });
  }

  app.openFlashQuiz = async () => {
    body.innerHTML = `<p class="muted"><span class="spinner"></span> Đang lật lại Sổ hồ sơ lỗi…</p>`;
    modal.classList.remove("hidden");
    try {
      const res = await api.plannerQuiz();
      const all = Array.isArray(res.questions) ? res.questions : [];
      if (all.length < MIN_QUESTIONS) { body.innerHTML = renderEmpty(all.length); return; }
      questions = buildSession(all);
      idx = 0; score = 0;
      showQuestion();
    } catch (err) {
      body.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  };
}
