// autopsy.js — "Biên Bản Pháp Y" v2 (README-LOOPS.md task A3, restyled per
// README-LOOPS-UX-CRITIQUE.md §4.1 — neon-ink, amber accent, mono glyphs).
// The UI for the WA Autopsy pipeline: one click on a failing verdict → the
// backend builds an AI reference, shrinks the failing input to a minimal
// certificate, and this modal presents the Evidence Pack as a calm forensic
// document. The student walks away with a 3-line test they can SEE the bug
// in — plus one-click paths to save it as a test case, visualize it, or take
// it to the Coach.
//
// Honesty rules (README-LOOPS.md §1.2): if the reference didn't match the
// official samples, a warning band says so before anything else is believed.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function fmtBytes(n) {
  if (n == null) return "?";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function fmtDur(ms) {
  if (ms == null) return "?";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function renderLoading(trigger) {
  return `<div class="doc-sheet doc-accent-amber">
    <div class="doc-kicker">Biên bản pháp y</div>
    <h3 class="doc-title">Đang khám nghiệm ${escapeHtml(trigger || "WA")}…</h3>
    <p class="gr-hero-line"><span class="spinner"></span> Dựng lời giải tham chiếu → đối chiếu sample → thu nhỏ test lỗi về tối giản. Thường mất 10–30 giây.</p>
    <div class="doc-actions"><button type="button" id="autopsy-stop" class="btn btn-ghost btn-sm"><span class="b-glyph">■</span> Dừng</button></div>
  </div>`;
}

function renderError(err) {
  const note = (err.data && (err.data.note || err.data.error)) || err.message || "Có lỗi không rõ.";
  return `<div class="doc-sheet doc-accent-amber">
    <div class="doc-kicker">Biên bản pháp y</div>
    <h3 class="doc-title">Chưa lập được biên bản</h3>
    <div class="doc-warn"><span class="doc-glyph">!</span><span>${escapeHtml(note)}</span></div>
    <p class="doc-fine" style="margin-top:10px">Pháp y cần: API key (Settings → AI), g++, và lỗi tái hiện được với lời giải tham chiếu. Thử lại sau khi kiểm tra các điều kiện trên.</p>
  </div>`;
}

function renderPack(pack, referenceNote, app) {
  const title = (app.state.meta && app.state.meta.title) || pack.problemId;
  const today = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const verified = pack.reference && pack.reference.verifiedOnSamples;
  const s = pack.shrink || {};
  const expected = String(pack.expectedOutput || "").replace(/\s+$/, "");
  const student = String(pack.studentOutput || "").replace(/\s+$/, "");

  return `<div class="doc-sheet doc-accent-amber">
    <div class="doc-kicker">Biên bản pháp y · ${escapeHtml(pack.trigger || "WA")}</div>
    <h3 class="doc-title">${escapeHtml(title)}</h3>
    <div class="doc-meta">
      <span>${today}</span>
      <span>thu nhỏ <b>${fmtBytes(s.fromBytes)} → ${fmtBytes(s.toBytes)}</b></span>
      <span><b>${s.runs ?? "?"}</b> lần chạy đối chứng</span>
      <span>${fmtDur(s.durationMs)}</span>
    </div>

    ${verified
      ? `<div class="doc-insight di-good"><span class="di-icon">✦</span><span>Lời giải tham chiếu <b>khớp sample chính thức</b> — đáp án bên dưới đáng tin.</span></div>`
      : `<div class="doc-warn"><span class="doc-glyph">!</span><span><b>Tham chiếu chưa được kiểm chứng bằng sample chính thức</b> — coi đáp án bên dưới là gợi ý, tự kiểm tra lại trước khi tin.</span></div>`}

    <div class="doc-rule">◆</div>

    <div class="doc-section">
      <div class="doc-section-title"><span class="doc-glyph">Δ</span> Test nhỏ nhất làm em sai</div>
      <div class="doc-input-block"><pre class="doc-pre" id="autopsy-min-input">${escapeHtml(pack.minimalInput || "")}</pre></div>
    </div>

    <div class="doc-section">
      <div class="doc-section-title"><span class="doc-glyph">≠</span> Trên test đó</div>
      <div class="doc-io">
        <div class="io-cell is-expected">
          <div class="io-label">Đáp án đúng (tham chiếu)</div>
          <pre class="doc-pre">${escapeHtml(expected) || "<i>(rỗng)</i>"}</pre>
        </div>
        <div class="io-cell is-student">
          <div class="io-label">Code của em ${pack.trigger !== "WA" ? `· ${escapeHtml(pack.trigger)}` : "in ra"}</div>
          <pre class="doc-pre">${escapeHtml(student) || "<i>(không có output)</i>"}</pre>
        </div>
      </div>
    </div>

    <div class="doc-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="autopsy-copy"><span class="b-glyph">❏</span> Copy input</button>
      <button type="button" class="btn btn-ghost btn-sm" id="autopsy-save-test"><span class="b-glyph">+</span> Lưu làm test case</button>
      <button type="button" class="btn btn-ghost btn-sm" id="autopsy-viz"><span class="b-glyph">◉</span> Soi test</button>
      <button type="button" class="btn btn-ai btn-sm" id="autopsy-coach"><span class="b-glyph">❯</span> Hỏi Coach với test này</button>
    </div>

    <div class="doc-foot">
      <div class="doc-fine">${escapeHtml(referenceNote || "")}<br>Biên bản lưu tại workspace/problems/${escapeHtml(pack.problemId)}/autopsy/.</div>
      <div class="doc-seal" aria-hidden="true"><span class="seal-top">USACO IDE</span><span class="seal-mid">Δ</span><span class="seal-bot">PHÁP Y</span></div>
    </div>
  </div>`;
}

export function initAutopsy(app) {
  const modal = document.getElementById("autopsy-modal");
  const body = document.getElementById("autopsy-body");
  const closeBtn = document.getElementById("autopsy-close");
  if (!modal || !body) return; // markup not present — feature off

  let abort = null;
  const closeModal = () => {
    if (abort) { abort.abort(); abort = null; }
    modal.classList.add("hidden");
  };
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function wireActions(pack, pid) {
    const guard = (fn) => () => {
      if (app.state.currentId !== pid) { app.toast("Bài đã đổi — biên bản này thuộc bài khác.", "err"); return; }
      fn();
    };
    const copyBtn = body.querySelector("#autopsy-copy");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(pack.minimalInput || "")
        .then(() => app.toast("Đã copy test tối giản.", "ok"))
        .catch(() => app.toast("Không copy được.", "err"));
    });
    const saveBtn = body.querySelector("#autopsy-save-test");
    if (saveBtn) saveBtn.addEventListener("click", guard(async () => {
      try {
        await api.addTest(pid, {
          input: pack.minimalInput || "",
          expected: String(pack.expectedOutput || "").replace(/\s+$/, ""),
        });
        saveBtn.disabled = true;
        saveBtn.textContent = "✓ Đã lưu";
        app.toast("Test tối giản đã vào bộ test của bài.", "ok");
        if (app.reloadTests) await app.reloadTests();
      } catch (err) { app.toast(err.message, "err"); }
    }));
    const vizBtn = body.querySelector("#autopsy-viz");
    if (vizBtn) vizBtn.addEventListener("click", () => {
      if (app.openVisualizer) { closeModal(); app.openVisualizer(pack.minimalInput || "", "Test tối giản (Pháp y)"); }
    });
    const coachBtn = body.querySelector("#autopsy-coach");
    if (coachBtn) coachBtn.addEventListener("click", guard(() => {
      closeModal();
      if (app.coachAsk) app.coachAsk(pack.trigger === "TLE" ? "why-tle" : "why-wa");
    }));
  }

  // Entry point for the verdict rail: input = the failing test's stdin.
  app.openAutopsy = async (input, trigger) => {
    if (!app.state.currentId) return;
    if (abort) { abort.abort(); abort = null; }
    const pid = app.state.currentId;
    abort = new AbortController();
    body.innerHTML = renderLoading(trigger);
    modal.classList.remove("hidden");
    const stopBtn = body.querySelector("#autopsy-stop");
    if (stopBtn) stopBtn.addEventListener("click", () => { if (abort) abort.abort(); });
    try {
      const res = await api.autopsy(pid, { input, trigger }, { signal: abort.signal });
      if (app.state.currentId !== pid) { closeModal(); return; } // switched mid-flight
      body.innerHTML = renderPack(res.pack, res.referenceNote, app);
      wireActions(res.pack, pid);
    } catch (err) {
      if (err && err.aborted) {
        body.innerHTML = `<div class="doc-sheet doc-accent-amber"><div class="doc-kicker">Biên bản pháp y</div><p class="gr-hero-line">■ Đã dừng khám nghiệm.</p></div>`;
      } else {
        body.innerHTML = renderError(err);
        if (err.data && err.data.code === "NO_KEY") {
          closeModal();
          app.setTab("settings");
          app.toast("Chưa có API key — mở Settings.", "err");
        }
      }
    } finally {
      abort = null;
    }
  };
}
