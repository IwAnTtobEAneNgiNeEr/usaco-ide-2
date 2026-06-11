// wa-review.js — "Learning from WA". When a problem has been Wrong-Answered
// enough times (>= THRESHOLD), a banner appears in the Run console offering
// "Analyze My Mistakes". The AI diagnoses the wrong thinking / missing cases /
// edge cases / techniques to use — it NEVER rewrites the code. The diagnosis is
// also persisted to the problem's mistakes.md by the backend.
//
// Auto-Fix: a companion button that asks the AI for precise code fixes (JSON
// diffs). Each fix can be applied individually into the code editor.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const THRESHOLD = 3;

// Count Wrong-Answer runs for the current problem from its history index.
function waCount(app) {
  const history = (app.state.meta && app.state.meta.history) || [];
  return history.filter((h) => h.verdict === "WA").length;
}

function renderReview(review) {
  const list = (label, arr, cls) => (arr && arr.length)
    ? `<div class="mk-section"><div class="mk-label ${cls || ""}">${label}</div><ul class="mk-list">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`
    : "";
  return [
    review.tongQuan ? `<p class="mk-overview">${escapeHtml(review.tongQuan)}</p>` : "",
    list("❌ Sai tư duy ở đâu", review.saiTuDuy, "mk-bad"),
    list("➕ Trường hợp còn thiếu", review.truongHopThieu),
    list("⚠ Edge case chưa xử lý", review.edgeCase, "mk-warn"),
    list("🛠 Kỹ thuật nên dùng", review.kyThuatNenDung, "mk-tech")
  ].join("") || `<p class="muted">AI không tìm thấy nhận xét cụ thể nào.</p>`;
}

function renderAutoFix(app, explanation, fixes) {
  let html = "";
  if (explanation) {
    html += `<div class="mk-section"><div class="mk-label mk-tech">🔧 Lý do sai</div><p class="mk-overview">${escapeHtml(explanation)}</p></div>`;
  }
  if (!fixes || fixes.length === 0) {
    html += `<p class="muted">AI không tìm được bản vá chính xác nào. Hãy thử "Analyze Mistakes" để hiểu lỗi tư duy.</p>`;
    return html;
  }
  html += `<div class="mk-section"><div class="mk-label mk-tech">📝 Các bản vá (${fixes.length})</div>`;
  fixes.forEach((fix, i) => {
    html += `
      <div class="af-fix" data-fix-idx="${i}">
        <div class="af-diff">
          <div class="af-diff-old"><div class="af-diff-label">− Xóa</div><pre class="af-pre bad">${escapeHtml(fix.search)}</pre></div>
          <div class="af-diff-new"><div class="af-diff-label">+ Thay bằng</div><pre class="af-pre good">${escapeHtml(fix.replace)}</pre></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm af-apply" data-fix-idx="${i}">✅ Áp dụng Fix ${i + 1}</button>
      </div>`;
  });
  html += `</div>`;
  return html;
}

export function initWaReview(app) {
  const banner = document.getElementById("wa-banner");
  const countEl = document.getElementById("wa-count");
  const btn = document.getElementById("btn-analyze-mistakes");
  const modal = document.getElementById("mistakes-modal");
  const body = document.getElementById("mistakes-body");
  const closeBtn = document.getElementById("mistakes-close");
  if (!banner || !btn || !modal) return; // markup not present — feature off

  let waAbort = null;
  let fixAbort = null;
  const btnLabel = btn.textContent;

  // --- Inject the Auto-Fix button next to the Analyze button in the banner ---
  const fixBtn = document.createElement("button");
  fixBtn.id = "btn-auto-fix";
  fixBtn.className = "btn btn-ai btn-sm";
  fixBtn.type = "button";
  fixBtn.textContent = "✨ Auto-Fix";
  fixBtn.title = "AI tìm dòng sai và sinh bản vá";
  banner.appendChild(fixBtn);
  const fixBtnLabel = fixBtn.textContent;

  // Toggle the banner based on the current problem's WA count.
  app.refreshWaReview = () => {
    const n = waCount(app);
    if (countEl) countEl.textContent = String(n);
    banner.classList.toggle("hidden", !(app.state.currentId && n >= THRESHOLD));
  };

  const openModal = (html) => {
    body.innerHTML = html;
    modal.classList.remove("hidden");
  };
  const closeModal = () => modal.classList.add("hidden");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // Wire up Apply Fix buttons after rendering. `pid` pins the fixes to the
  // problem they were generated for — never patch a different problem's code.
  function wireApplyButtons(fixes, pid) {
    body.querySelectorAll(".af-apply").forEach((applyBtn) => {
      applyBtn.addEventListener("click", () => {
        if (app.state.currentId !== pid) {
          app.toast("Bản vá này thuộc bài khác — mở lại bài đó để áp dụng.", "err");
          return;
        }
        const idx = Number(applyBtn.dataset.fixIdx);
        const fix = fixes[idx];
        if (!fix) return;
        const current = app.getEditorValue();
        const count = current.split(fix.search).length - 1;
        if (count === 0) {
          app.toast("Không tìm thấy đoạn code cần thay — có thể đã sửa rồi.", "err");
          return;
        }
        if (count > 1) {
          app.toast(`Đoạn code xuất hiện ${count} lần — bản vá không rõ ràng, không áp dụng.`, "err");
          return;
        }
        app.setEditorValue(current.replace(fix.search, fix.replace));
        if (app.el.codeEditor && typeof app.el.codeEditor.dispatchEvent === "function") {
          app.el.codeEditor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        applyBtn.disabled = true;
        applyBtn.textContent = "✓ Đã áp dụng";
        app.toast(`Đã áp dụng Fix ${idx + 1}`, "ok");
        ensureRejudgeButton(pid);
      });
    });
  }

  // After at least one fix is applied, offer to re-judge immediately so the
  // user learns on the spot whether the patch actually fixed the verdict.
  function ensureRejudgeButton(pid) {
    if (body.querySelector("#af-rejudge")) return;
    const row = document.createElement("div");
    row.className = "af-rejudge-row";
    row.innerHTML = `<button type="button" id="af-rejudge" class="btn btn-judge btn-sm">▶ Chấm lại ngay</button>`;
    body.appendChild(row);
    row.querySelector("#af-rejudge").addEventListener("click", async () => {
      if (app.state.currentId !== pid) { app.toast("Bài đã đổi — mở lại bài đó để chấm.", "err"); return; }
      closeModal();
      const r = await app.judgeAll(); // saves code + judges + syncs meta
      if (!r || app.state.currentId !== pid) return; // judge errored (already toasted) or problem switched
      const s = r.summary || {};
      if (r.verdict === "AC") {
        app.toast("✅ Fix đã chữa: AC!", "ok");
      } else {
        app.toast(`⚠ Vẫn ${r.verdict}${s.passed != null ? ` (${s.passed}/${s.total} pass)` : ""}`, "err");
      }
    });
  }

  // --- Analyze Mistakes (existing) ---
  btn.addEventListener("click", async () => {
    // Mid-flight: abort the running analysis.
    if (waAbort) { waAbort.abort(); return; }
    if (!app.state.currentId) return;
    const pid = app.state.currentId;
    waAbort = new AbortController();
    btn.textContent = "⏹ Dừng";
    btn.classList.add("btn-stop");
    openModal(`<p class="muted"><span class="spinner"></span> AI đang xem lại đề, code và lịch sử WA…</p>`);
    try {
      const res = await api.aiReviewMistakes({ problemId: pid, code: app.getEditorValue() }, { signal: waAbort.signal });
      if (app.state.currentId !== pid) { closeModal(); return; } // switched problems mid-flight
      openModal(renderReview(res.review || {}));
      app.toast("Đã lưu phân tích vào mistakes.md", "ok");
    } catch (err) {
      if (err && err.aborted) {
        openModal(`<p class="muted">⏹ Đã dừng phân tích.</p>`);
      } else {
        openModal(`<p class="mk-bad">${escapeHtml(err.message)}</p>`);
        if (err.data && err.data.code === "NO_KEY") { closeModal(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      waAbort = null;
      btn.textContent = btnLabel;
      btn.classList.remove("btn-stop");
    }
  });

  // --- Auto-Fix ---
  fixBtn.addEventListener("click", async () => {
    // Mid-flight: abort the running auto-fix.
    if (fixAbort) { fixAbort.abort(); return; }
    if (!app.state.currentId) return;
    const pid = app.state.currentId;
    fixAbort = new AbortController();
    fixBtn.textContent = "⏹ Dừng";
    fixBtn.classList.add("btn-stop");

    // Gather the latest test result context for the AI.
    const meta = app.state.meta || {};
    const lastRun = (meta.history || [])[0];
    let testResult = "";
    if (lastRun) {
      testResult = `Verdict: ${lastRun.verdict || "?"}`;
      if (lastRun.passed != null) testResult += ` · ${lastRun.passed}/${lastRun.total} pass`;
      if (lastRun.stderr) testResult += `\nstderr: ${String(lastRun.stderr).slice(0, 500)}`;
      if (lastRun.stdout) testResult += `\nstdout (thực tế): ${String(lastRun.stdout).slice(0, 500)}`;
    }

    openModal(`<p class="muted"><span class="spinner"></span> AI đang phân tích code và tìm chỗ sửa…</p>`);
    try {
      const res = await api.aiAutoFix({
        problemId: pid,
        code: app.getEditorValue(),
        testResult
      }, { signal: fixAbort.signal });

      if (app.state.currentId !== pid) { closeModal(); return; } // switched problems mid-flight
      const fixes = res.fixes || [];
      openModal(renderAutoFix(app, res.explanation, fixes));
      wireApplyButtons(fixes, pid);
      if (fixes.length > 0) app.toast(`AI tìm thấy ${fixes.length} bản vá`, "ok");
    } catch (err) {
      if (err && err.aborted) {
        openModal(`<p class="muted">⏹ Đã dừng Auto-Fix.</p>`);
      } else {
        openModal(`<p class="mk-bad">${escapeHtml(err.message)}</p>`);
        if (err.data && err.data.code === "NO_KEY") { closeModal(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      fixAbort = null;
      fixBtn.textContent = fixBtnLabel;
      fixBtn.classList.remove("btn-stop");
    }
  });

  app.refreshWaReview();
}
