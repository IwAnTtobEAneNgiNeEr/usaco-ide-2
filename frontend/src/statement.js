// statement.js — Problem view controller (center column).
//
// Flow:  paste / upload image  ->  OCR  ->  statement.md  ->  AI analyze + tests
// (in parallel)  ->  populate the Analysis / Examples / Generated-tests cards.
// Pasting or editing the statement auto-triggers the pipeline (debounced).

import { api } from "./api.js";
import { renderMeta } from "./editor.js";
import { renderMarkdown, escapeHtml } from "./md.js";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Không đọc được tệp."));
    fr.readAsDataURL(file);
  });
}

function status(app, html) { app.el.statementStatus.innerHTML = html; }

// A spinning status line with an inline "✕ Hủy" button wired to `controller`.
// Aborting cancels only this pipeline/OCR request — sibling AI tasks (e.g. the
// Coach) keep running. (See aiCall's two-tier note in api.js.)
function busyStatus(app, label, controller) {
  status(app, `<span class="spinner"></span> ${label} <button type="button" class="stmt-cancel" title="Hủy tác vụ AI này">✕ Hủy</button>`);
  const btn = app.el.statementStatus.querySelector(".stmt-cancel");
  if (btn) btn.addEventListener("click", () => {
    try { controller.abort(); } catch { /* ignore */ }
    btn.disabled = true; btn.textContent = "Đang hủy…";
  });
}

function hashOf(s) {
  // Cheap stable hash for change-detection (not security).
  let h = 0;
  const str = String(s || "").trim();
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return h + ":" + str.length;
}

// Client-side sample extractor (mirror of backend) — used when re-opening a
// problem so the Examples card shows without re-calling the model.
function extractSamples(text) {
  text = String(text || "");
  if (!text.trim()) return [];
  const blocks = [];
  const re = /(^|\n)[^\n]*?\b(input|output)\b[^\n]*\n+```[a-zA-Z]*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push({ kind: m[2].toLowerCase(), body: m[3].replace(/\s+$/, "") });
  const samples = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "input") {
      const out = blocks[i + 1] && blocks[i + 1].kind === "output" ? blocks[i + 1] : null;
      samples.push({ input: blocks[i].body, output: out ? out.body : "" });
      if (out) i++;
    }
  }
  if (samples.length === 0) {
    const bare = [];
    const bre = /```[a-zA-Z]*\n([\s\S]*?)```/g;
    let b;
    while ((b = bre.exec(text)) !== null) bare.push(b[1].replace(/\s+$/, ""));
    for (let i = 0; i + 1 < bare.length; i += 2) samples.push({ input: bare[i], output: bare[i + 1] });
  }
  return samples.slice(0, 6);
}

// ---- Renderers -------------------------------------------------------------

// CF rating → a coarse colour band for the rating chip.
function ratingBand(r) {
  if (r >= 2100) return "r-hard";
  if (r >= 1600) return "r-gold";
  if (r >= 1200) return "r-silver";
  return "r-bronze";
}

function renderAnalysis(app, a) {
  const card = app.el.analysisCard;
  const hasDiff = a && (a.usacoTier || a.cfRating || a.doKho || a.doPhucTapYeuCauTime || a.doPhucTapYeuCauSpace);
  if (!a || (!a.tomTat && !(a.kyThuat && a.kyThuat.length) && !a.rangBuoc && !hasDiff && !a.luuY)) {
    card.classList.add("hidden"); card.innerHTML = ""; return;
  }
  card.classList.remove("hidden");
  const tech = (a.kyThuat || []).map((t) => `<span class="tag-pill tech">${escapeHtml(t)}</span>`).join("");
  const tags = (a.tags || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");
  const row = (label, body, cls) => body
    ? `<div class="an-row"><div class="an-label">${label}</div><div class="an-body ${cls || ""}">${body}</div></div>`
    : "";

  // Difficulty line: USACO tier chip + estimated CF rating chip + complexity chips + the prose note.
  const diffChips = [
    a.usacoTier ? `<span class="diff-chip tier-${escapeHtml(a.usacoTier.toLowerCase())}">${escapeHtml(a.usacoTier)}</span>` : "",
    a.cfRating ? `<span class="diff-chip rating ${ratingBand(a.cfRating)}" title="Ước lượng theo thang Codeforces">CF ~${a.cfRating}</span>` : "",
    a.doPhucTapYeuCauTime ? `<span class="diff-chip time-complexity" title="Độ phức tạp thời gian yêu cầu">Time: ${escapeHtml(a.doPhucTapYeuCauTime)}</span>` : "",
    a.doPhucTapYeuCauSpace ? `<span class="diff-chip space-complexity" title="Độ phức tạp bộ nhớ yêu cầu">Space: ${escapeHtml(a.doPhucTapYeuCauSpace)}</span>` : ""
  ].filter(Boolean).join("");
  const diffBody = `${diffChips}${a.doKho ? `<span class="diff-note">${escapeHtml(a.doKho)}</span>` : ""}`;

  card.innerHTML = `
    <div class="card-title">Phân tích AI</div>
    ${row("Tóm tắt", a.tomTat ? escapeHtml(a.tomTat) : "")}
    ${row("Độ khó", hasDiff ? diffBody : "", "an-diff")}
    ${row("Kỹ thuật", tech)}
    ${row("Ràng buộc", a.rangBuoc ? escapeHtml(a.rangBuoc) : "")}
    ${row("Lưu ý", a.luuY ? `<span class="an-warn">${escapeHtml(a.luuY)}</span>` : "")}
    ${tags ? row("Tags", tags) : ""}`;
}

function renderExamples(app, samples) {
  const card = app.el.examplesCard;
  if (!samples || samples.length === 0) { card.classList.add("hidden"); card.innerHTML = ""; return; }
  card.classList.remove("hidden");
  card.innerHTML = `<div class="card-title">Ví dụ mẫu (${samples.length})</div>` +
    samples.map((s, i) => `
      <div class="ex-pair" data-ex-idx="${i}">
        <div class="ex-col">
          <div class="ex-head">Input ${i + 1}</div>
          <pre class="ex-pre">${escapeHtml(s.input || "")}</pre>
        </div>
        <div class="ex-col">
          <div class="ex-head">Output ${i + 1}</div>
          <pre class="ex-pre">${escapeHtml(s.output || "(—)")}</pre>
        </div>
        <div class="ex-explain-row">
          <button type="button" class="btn btn-ai btn-sm ex-explain-btn" data-ex="${i}">✨ Giải thích ví dụ này</button>
          <div class="ex-explain-body hidden" data-ex-body="${i}"></div>
        </div>
      </div>`).join("");

  // Per-example abort controllers so each explanation is independent.
  const aborts = new Array(samples.length).fill(null);

  card.querySelectorAll(".ex-explain-btn").forEach((btn) => {
    const idx = Number(btn.dataset.ex);
    const bodyEl = card.querySelector(`[data-ex-body="${idx}"]`);
    const label = btn.textContent;

    btn.addEventListener("click", async () => {
      // Mid-flight: abort this specific explanation.
      if (aborts[idx]) { aborts[idx].abort(); return; }
      if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }

      aborts[idx] = new AbortController();
      btn.textContent = "⏹ Dừng";
      btn.classList.add("btn-stop");
      bodyEl.classList.remove("hidden");
      bodyEl.innerHTML = `<span class="spinner"></span> AI đang phân tích ví dụ…`;

      try {
        const res = await api.aiExplainTestCase({
          problemId: app.state.currentId,
          input: samples[idx].input || "",
          output: samples[idx].output || ""
        }, { signal: aborts[idx].signal });

        bodyEl.innerHTML = renderMarkdown(res.explanation || "(không có phản hồi)");
        btn.textContent = "✓ Đã giải thích";
        btn.disabled = true;
      } catch (err) {
        if (err && err.aborted) {
          bodyEl.innerHTML = `<span class="muted">⏹ Đã dừng giải thích.</span>`;
        } else {
          bodyEl.innerHTML = `<span class="mk-bad">${escapeHtml(err.message)}</span>`;
          if (err.data && err.data.code === "NO_KEY") {
            app.setTab("settings");
            app.toast("Chưa có API key — mở Settings.", "err");
          }
        }
      } finally {
        aborts[idx] = null;
        if (!btn.disabled) {
          btn.textContent = label;
          btn.classList.remove("btn-stop");
        } else {
          btn.classList.remove("btn-stop");
        }
      }
    });
  });
}

function renderGenTests(app, tests, notes) {
  const card = app.el.genTestsCard;
  card.classList.remove("hidden");
  app.state.aiTests = tests || [];
  const note = (notes || []).length
    ? `<div class="gt-notes">${notes.map((n) => `<div>${escapeHtml(n)}</div>`).join("")}</div>` : "";
  if (!tests || tests.length === 0) {
    card.innerHTML = `<div class="card-title">Test do AI tạo</div>${note}
      <div class="muted" style="font-size:12px">AI chưa tạo được test nào. Thử bổ sung đề bài rõ hơn.</div>`;
    return;
  }
  card.innerHTML = `
    <div class="card-title gt-title">
      <span>Test do AI tạo · <b>${tests.length}</b></span>
      <label class="gt-selall"><input type="checkbox" id="gt-select-all" checked /> Chọn tất cả</label>
    </div>
    ${note}
    <div class="gt-list">
      ${tests.map((t, i) => `
        <div class="gt-card" data-i="${i}">
          <div class="gt-card-head">
            <input type="checkbox" class="gt-pick" checked />
            <input type="text" class="gt-name" value="${escapeHtml(t.name)}" />
            ${t.expectedKnown ? "" : '<span class="gt-warn" title="Chưa có đáp án kiểm chứng">NO EXPECTED</span>'}
          </div>
          ${t.reason ? `<div class="gt-reason">${escapeHtml(t.reason)}</div>` : ""}
          <div class="gt-io">
            <label>Input<textarea class="gt-input" spellcheck="false">${escapeHtml(t.input)}</textarea></label>
            <label>Expected<textarea class="gt-expected" spellcheck="false">${escapeHtml(t.expected)}</textarea></label>
          </div>
        </div>`).join("")}
    </div>
    <div class="gt-foot">
      <button id="gt-apply" class="btn btn-primary btn-sm" type="button">➕ Thêm test đã chọn vào bộ</button>
    </div>`;

  const selAll = card.querySelector("#gt-select-all");
  selAll.addEventListener("change", () => {
    card.querySelectorAll(".gt-pick").forEach((cb) => { cb.checked = selAll.checked; });
  });
  card.querySelector("#gt-apply").addEventListener("click", () => applyGenTests(app, card));
}

async function applyGenTests(app, card) {
  if (!app.state.currentId) return;
  const chosen = [...card.querySelectorAll(".gt-card")].filter((c) => c.querySelector(".gt-pick").checked);
  if (chosen.length === 0) { app.toast("Chọn ít nhất một test.", "err"); return; }
  const btn = card.querySelector("#gt-apply");
  btn.disabled = true; btn.textContent = "Đang thêm…";
  let added = 0;
  try {
    for (const c of chosen) {
      const src = app.state.aiTests[Number(c.dataset.i)] || {};
      await api.addTest(app.state.currentId, {
        name: c.querySelector(".gt-name").value.trim() || src.name,
        input: c.querySelector(".gt-input").value,
        expected: c.querySelector(".gt-expected").value,
        reason: src.reason || "",
        generatedBy: "ai"
      });
      added += 1;
    }
    app.toast(`Đã thêm ${added} test`, "ok");
    await app.reloadTests();
    card.classList.add("hidden"); card.innerHTML = "";
    app.setTab("tests");
  } catch (err) {
    app.toast(err.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "➕ Thêm test đã chọn vào bộ";
  }
}

// Ensure a problem is open before pasting/importing — auto-create an untitled
// one when none is selected, so "paste → ready" needs no manual New click.
async function ensureProblem(app) {
  if (app.state.currentId) return true;
  try {
    const stamp = new Date().toLocaleString();
    const { problem } = await api.createProblem({ title: `Untitled — ${stamp}` });
    await app.refreshProblems();
    await app.loadProblem(problem.id);
    return !!app.state.currentId;
  } catch (err) {
    app.toast(err.message, "err");
    return false;
  }
}

// ---- Pipeline --------------------------------------------------------------

async function runPipeline(app, { force = false, regen = false } = {}) {
  if (!app.state.currentId) return;
  const statement = app.el.ioStatement.value;
  if (!statement.trim()) {
    if (force) app.toast("Đề bài đang trống.", "err");
    return;
  }
  const h = hashOf(statement);
  if (!force && h === app.state._processedHash) return; // unchanged → skip
  if (app.state._pipelineBusy) { app.state._pipelinePending = true; return; }

  app.state._pipelineBusy = true;
  app.state._processedHash = h;
  const pipelineAbort = new AbortController();
  app.state._pipelineAbort = pipelineAbort;
  busyStatus(app, "Đang phân tích đề &amp; tạo test…", pipelineAbort);
  app.el.genTestsCard.classList.remove("hidden");
  app.el.genTestsCard.innerHTML = `<div class="card-title">Test do AI tạo</div><div class="muted" style="font-size:12px"><span class="spinner"></span> Đang tạo test…</div>`;

  try {
    await api.saveStatement(app.state.currentId, statement);
    app.state.savedStatement = statement;

    const res = await api.aiProcess({
      problemId: app.state.currentId,
      statement,
      code: app.getEditorValue(),
      regen // explicit "re-analyze / regenerate" bypasses the server-side disk cache
    }, { signal: pipelineAbort.signal });

    if (res.analysis) {
      renderAnalysis(app, res.analysis);
      if (app.state.meta) app.state.meta.analysis = res.analysis;
      try { const { problem } = await api.getProblem(app.state.currentId); app.state.meta = problem; } catch { /* non-fatal */ }
      renderMeta(app);
      app.refreshProblems();
    } else if (res.analysisError) {
      status(app, `<span class="warn-text">Phân tích lỗi: ${escapeHtml(res.analysisError)}</span>`);
    }

    renderExamples(app, res.samples || extractSamples(statement));

    if (res.testsError) {
      app.el.genTestsCard.classList.remove("hidden");
      app.el.genTestsCard.innerHTML = `<div class="card-title">Test do AI tạo</div><div class="warn-text" style="font-size:12px">Không tạo được test: ${escapeHtml(res.testsError)}</div>`;
      status(app, `<span class="warn-text">Tạo test lỗi: ${escapeHtml(res.testsError)}</span>`);
    } else {
      const tests = res.tests || [];
      const verified = tests.filter((t) => t.expectedKnown);
      const unverified = tests.filter((t) => !t.expectedKnown);
      // On a fresh problem (no tests yet), auto-add the execution-verified tests
      // silently and only surface the unverified ones for manual review.
      let added = 0;
      if (verified.length && (app.state.tests || []).length === 0) {
        try {
          for (const t of verified) {
            await api.addTest(app.state.currentId, { name: t.name, input: t.input, expected: t.expected, reason: t.reason || "", generatedBy: "ai" });
            added += 1;
          }
          await app.reloadTests();
        } catch (err) { app.toast(err.message, "err"); }
      }
      if (added > 0) {
        if (unverified.length) renderGenTests(app, unverified, res.notes);
        else { app.el.genTestsCard.classList.add("hidden"); app.el.genTestsCard.innerHTML = ""; }
        status(app, `✓ Phân tích xong · đã thêm <b>${added}</b> test đã kiểm chứng${unverified.length ? ` · <b>${unverified.length}</b> test cần xem lại bên dưới` : ""}.`);
      } else {
        renderGenTests(app, tests, res.notes);
        status(app, `✓ Đã phân tích &amp; tạo <b>${tests.length}</b> test.`);
      }
      if (app.playSound) app.playSound("complete");
    }
  } catch (err) {
    app.state._processedHash = null; // allow retry
    app.el.genTestsCard.classList.add("hidden");
    app.el.genTestsCard.innerHTML = "";
    if (err && err.aborted) {
      status(app, `Đã hủy phân tích đề &amp; tạo test.`);
    } else {
      status(app, `<span class="warn-text">${escapeHtml(err.message)}</span>`);
      if (err.data && err.data.code === "NO_KEY") {
        app.state._aiAutoDisabled = true;
        app.toast("Chưa có API key — mở Settings để nhập.", "err");
        app.setTab("settings");
      }
    }
  } finally {
    app.state._pipelineBusy = false;
    app.state._pipelineAbort = null;
    if (app.state._pipelinePending) { app.state._pipelinePending = false; runPipeline(app, { force: true }); }
  }
}

// OCR an image/PDF data URL, append the markdown, then auto-run the pipeline.
async function runOcr(app, dataUrl, mimeType, fileName) {
  if (!(await ensureProblem(app))) return;
  app.showProblemView();
  const ocrAbort = new AbortController();
  busyStatus(app, `Đang OCR ${escapeHtml(fileName || mimeType || "ảnh")} …`, ocrAbort);
  try {
    const res = await api.aiOcr({ dataUrl, mimeType, fileName }, { signal: ocrAbort.signal });
    const md = (res.markdown || "").trim();
    if (!md) { status(app, `<span class="warn-text">OCR failed: không có nội dung.</span>`); return; }
    const cur = app.el.ioStatement.value.trim();
    app.el.ioStatement.value = cur ? cur + "\n\n---\n\n" + md : md;
    await api.saveStatement(app.state.currentId, app.el.ioStatement.value);
    app.state.savedStatement = app.el.ioStatement.value;
    app.state._aiAutoDisabled = false;
    const viaLabel = { tesseract: "Tesseract (local)", markitdown: "MarkItDown" }[res.via] || res.via || "OCR";
    const cleanLabel = res.cleaned ? " · đã làm sạch tiếng Việt" : "";
    status(app, `OCR xong (${viaLabel}${cleanLabel}). Đang phân tích…`);
    await runPipeline(app, { force: true });
  } catch (err) {
    if (err && err.aborted) { status(app, `Đã hủy OCR.`); return; }
    status(app, `<span class="warn-text">${escapeHtml(err.message)}</span>`);
    if (err.data && err.data.code === "NO_KEY") app.setTab("settings");
  }
}

// Pull an image out of a clipboard/drag DataTransfer or ClipboardItem list.
async function imageFromClipboardItems(items) {
  for (const it of items || []) {
    if (it && it.type && it.type.startsWith("image/")) {
      const blob = it.getAsFile ? it.getAsFile() : it;
      if (blob) return { blob, type: it.type };
    }
  }
  return null;
}

// ---- Public: render on problem load ---------------------------------------

export function loadProblemView(app) {
  app.state._processedHash = hashOf(app.el.ioStatement.value);
  app.state._pipelineBusy = false;
  app.state._pipelinePending = false;
  const a = app.state.meta && app.state.meta.analysis;
  renderAnalysis(app, a);
  renderExamples(app, extractSamples(app.el.ioStatement.value));
  app.el.genTestsCard.classList.add("hidden");
  app.el.genTestsCard.innerHTML = "";
}

// ---- Init ------------------------------------------------------------------

export function initStatement(app) {
  const { el } = app;

  app.showProblemView = () => app.setView("problem");
  app.runStatementPipeline = () => { app.showProblemView(); runPipeline(app, { force: true }); };

  // Debounced auto-pipeline as the statement changes.
  let debounceTimer = null;
  const scheduleAuto = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (app.state._aiAutoDisabled) return;
      const v = el.ioStatement.value;
      if (v.trim().length < 30) return;            // too short to be a real statement
      if (hashOf(v) === app.state._processedHash) return;
      runPipeline(app, { force: false });
    }, 1500);
  };
  el.ioStatement.addEventListener("input", scheduleAuto);

  el.btnSaveStatement.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    try {
      await api.saveStatement(app.state.currentId, el.ioStatement.value);
      app.state.savedStatement = el.ioStatement.value;
      app.toast("Đã lưu đề bài", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });

  el.btnClearStatement.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    if (el.ioStatement.value.trim() && !confirm("Xoá nội dung đề bài?")) return;
    el.ioStatement.value = "";
    app.state._processedHash = hashOf("");
    el.analysisCard.classList.add("hidden"); el.analysisCard.innerHTML = "";
    el.examplesCard.classList.add("hidden"); el.examplesCard.innerHTML = "";
    el.genTestsCard.classList.add("hidden"); el.genTestsCard.innerHTML = "";
    status(app, "Dán ảnh (Ctrl+V), tải ảnh/PDF, hoặc gõ đề bài — AI sẽ tự phân tích &amp; tạo test.");
    try { await api.saveStatement(app.state.currentId, ""); app.state.savedStatement = ""; } catch (err) { app.toast(err.message, "err"); }
  });

  // Upload image / PDF.
  el.btnUploadImage.addEventListener("click", () => el.imageFile.click());
  el.imageFile.addEventListener("change", async () => {
    const file = el.imageFile.files[0];
    el.imageFile.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await runOcr(app, dataUrl, file.type, file.name);
    } catch (err) { app.toast(err.message, "err"); }
  });

  // Paste button — read image from the async clipboard API.
  el.btnPasteImage.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) { app.toast("Nhấn Ctrl+V để dán ảnh.", "err"); return; }
      const clipItems = await navigator.clipboard.read().catch((err) => {
        if (err.name === "NotAllowedError") {
          throw new Error("Trình duyệt không cho phép đọc clipboard. Hãy cấp quyền hoặc nhấn Ctrl+V trực tiếp.");
        }
        throw new Error("Clipboard trống hoặc không đọc được. Hãy chụp màn hình trước.");
      });
      let foundImg = false;
      for (const item of clipItems || []) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const dataUrl = await fileToDataUrl(blob);
          await runOcr(app, dataUrl, type, "pasted-image");
          foundImg = true;
          break;
        }
      }
      if (!foundImg) {
        app.toast("Clipboard không có ảnh. Hãy chụp màn hình trước.", "err");
      }
    } catch (err) {
      app.toast(err.message || "Clipboard bị chặn — bấm vào ô đề bài rồi nhấn Ctrl+V.", "err");
    }
  });

  // Ctrl+V directly into the statement box.
  el.ioStatement.addEventListener("paste", async (e) => {
    const found = await imageFromClipboardItems(e.clipboardData && e.clipboardData.items);
    if (found) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(found.blob);
      await runOcr(app, dataUrl, found.type, "pasted-image");
    }
  });

  // Global Ctrl+V — paste a screenshot from anywhere (Snipping Tool / Lightshot /
  // Windows clipboard) as long as a problem is open and no text field is focused.
  document.addEventListener("paste", async (e) => {
    const t = e.target;
    const typing = t && (t === el.codeEditor || (t.tagName === "INPUT") || (t.tagName === "TEXTAREA" && t !== el.ioStatement));
    if (typing) return;               // let real text fields handle their own paste
    if (t === el.ioStatement) return; // handled by the listener above
    const found = await imageFromClipboardItems(e.clipboardData && e.clipboardData.items);
    if (found) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(found.blob);
      await runOcr(app, dataUrl, found.type, "pasted-image"); // runOcr auto-creates a problem if none open
    }
  });

  // Drag & drop an image file onto the statement box.
  el.ioStatement.addEventListener("dragover", (e) => { e.preventDefault(); });
  el.ioStatement.addEventListener("drop", async (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && /^image\//.test(file.type)) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(file);
      await runOcr(app, dataUrl, file.type, file.name);
    }
  });

  el.btnAnalyze.addEventListener("click", () => { app.state._aiAutoDisabled = false; runPipeline(app, { force: true, regen: true }); });
  el.btnAiGenStatement.addEventListener("click", () => { app.state._aiAutoDisabled = false; runPipeline(app, { force: true, regen: true }); });

  let templateAbort = null;
  if (el.btnAiTemplate) {
    el.btnAiTemplate.addEventListener("click", async () => {
      if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
      if (templateAbort) { templateAbort.abort(); return; }

      const statement = el.ioStatement.value.trim();
      if (!statement) { app.toast("Đề bài đang trống — cần đề bài để sinh template.", "err"); return; }

      templateAbort = new AbortController();
      el.btnAiTemplate.textContent = "⏹ Dừng";
      el.btnAiTemplate.classList.add("btn-stop");
      status(app, `<span class="spinner"></span> AI đang sinh template code…`);

      try {
        const res = await api.aiTemplate({
          problemId: app.state.currentId,
          statement
        }, { signal: templateAbort.signal });

        if (res.code) {
          app.setEditorValue(res.code);
          app.setView("code");
          app.toast("Đã sinh & nạp template thành công!", "ok");
          if (app.playSound) app.playSound("complete");
          status(app, `✓ Đã sinh template thành công.`);
        } else {
          throw new Error(res.error || "Không nhận được code từ AI.");
        }
      } catch (err) {
        if (err && err.aborted) {
          status(app, `Đã hủy sinh template.`);
        } else {
          app.toast(err.message, "err");
          status(app, `<span class="warn-text">Sinh template lỗi: ${escapeHtml(err.message)}</span>`);
          if (err.data && err.data.code === "NO_KEY") {
            app.setTab("settings");
            app.toast("Chưa có API key — mở Settings.", "err");
          }
        }
      } finally {
        templateAbort = null;
        el.btnAiTemplate.textContent = "📝 Sinh Template";
        el.btnAiTemplate.classList.remove("btn-stop");
      }
    });
  }
}
