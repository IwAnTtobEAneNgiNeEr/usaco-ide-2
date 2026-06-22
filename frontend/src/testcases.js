// testcases.js — Test Suite (cards) management for the Tests tab.
// AI generation/preview now lives inline in the Problem view (statement.js).

import { api } from "./api.js";
import { escapeHtml } from "./md.js";

function preview(text, n = 28) {
  const one = String(text || "").replace(/\s+/g, " ").trim();
  if (!one) return "(empty)";
  return one.length > n ? one.slice(0, n) + "…" : one;
}

// ---- Result painting -------------------------------------------------------

export function applyTestResults(app, results) {
  const map = {};
  (results || []).forEach((r) => { map[r.testId] = r; });
  app.state.testResults = map;
  for (const card of app.el.testsList.querySelectorAll(".tcard")) {
    paintCardResult(card, map[card.dataset.tid]);
  }
  renderTestsSummary(app);
}

function paintCardResult(card, result) {
  const badge = card.querySelector(".tc-badge");
  const time = card.querySelector(".tcard-time");
  const out = card.querySelector(".tc-out");
  if (!result) {
    badge.className = "vbadge tc-badge";
    badge.textContent = "—";
    time.textContent = "";
    if (out) out.textContent = "";
    card.removeAttribute("data-status"); // un-run → hidden by the "only failing" filter
    return;
  }
  badge.className = `vbadge tc-badge v-${result.status}`;
  badge.textContent = result.status;
  card.dataset.status = result.status;
  time.textContent = `${Math.round(result.timeMs)}ms`;
  if (out) {
    let txt = `actual:\n${result.actual || ""}`;
    if (result.checkerMessage) txt += `\n\n⚖ checker: ${result.checkerMessage}`;
    if (result.stderr) txt += `\n\nstderr:\n${result.stderr}`;
    if (result.diff) txt += `\n\ndiff @ line ${result.diff.line}\n  expected: ${result.diff.expected}\n  actual:   ${result.diff.actual}`;
    out.textContent = txt;
  }
}

function renderTestsSummary(app) {
  const tests = app.state.tests || [];
  const results = app.state.testResults || {};
  const statuses = tests.map((t) => results[t.id] && results[t.id].status).filter(Boolean);
  if (statuses.length === 0) {
    app.el.testsSummary.textContent = `${tests.length} test case${tests.length === 1 ? "" : "s"}`;
    return;
  }
  const passed = statuses.filter((s) => s === "AC").length;
  app.el.testsSummary.innerHTML = `${tests.length} tests · <b style="color:var(--ac)">${passed} AC</b> / ${statuses.length} run`;
}

export function renderTests(app) {
  const tests = app.state.tests || [];
  const open = app.state.openTests;
  const results = app.state.testResults || {};
  const list = app.el.testsList;
  renderTestsSummary(app);

  if (tests.length === 0) {
    list.innerHTML = `<div class="tests-empty">Chưa có test. Bấm <b>+ Add test</b>, hoặc mở tab <b>Problem</b> để AI tự tạo test từ đề bài.</div>`;
    return;
  }

  list.innerHTML = tests.map((t) => `
    <div class="tcard ${open.has(t.id) ? "open" : ""}" data-tid="${escapeHtml(t.id)}">
      <div class="tcard-head">
        <span class="vbadge tc-badge">—</span>
        <span class="tcard-name">${escapeHtml(t.name)}</span>
        ${t.generatedBy === "ai" ? '<span class="tc-aitag">AI</span>' : ""}
        <span class="tcard-prev">in: ${escapeHtml(preview(t.input))} · out: ${escapeHtml(preview(t.expected))}</span>
        <span class="tcard-time"></span>
        <div class="tcard-btns">
          <button class="btn btn-ghost btn-sm" data-act="run">Run</button>
          <button class="btn btn-ghost btn-sm" data-act="viz" title="Vẽ input này thành hình">👁</button>
          <button class="btn btn-ghost btn-sm" data-act="toggle">Edit</button>
          <button class="btn btn-ghost btn-sm btn-danger-ghost" data-act="del">✕</button>
        </div>
      </div>
      <div class="tcard-body">
        <div class="tc-field"><label>Name</label><input class="tc-name" value="${escapeHtml(t.name)}" /></div>
        <div class="tc-field"><label>Input (stdin)</label><textarea class="tc-input" spellcheck="false">${escapeHtml(t.input)}</textarea></div>
        <div class="tc-field"><label>Expected output</label><textarea class="tc-expected" spellcheck="false">${escapeHtml(t.expected)}</textarea></div>
        ${t.reason ? `<div class="ai-reason">${escapeHtml(t.reason)}</div>` : ""}
        <pre class="tc-out"></pre>
      </div>
    </div>`).join("");

  for (const card of list.querySelectorAll(".tcard")) {
    paintCardResult(card, results[card.dataset.tid]);
  }
}

// ---- File import (.in/.out pairs) -------------------------------------------
// USACO/Codeforces test data comes as a folder of files: 1.in + 1.out (answer
// also seen as .ans/.expected). Pair files by stem, read them in the browser,
// and add them through one bulk request. Anything unpaired or non-test is
// reported, never fatal.

const IMPORT_MAX_BYTES = 4 * 1024 * 1024; // mirrors backend LIMITS.maxInputBytes

function pairTestFiles(files) {
  const inputs = new Map();   // stem -> File
  const answers = new Map();  // stem -> { ext, file } (best answer ext wins)
  const ANSWER_RANK = { out: 0, ans: 1, expected: 2 };
  let ignored = 0;
  for (const f of files) {
    const m = /^(.+)\.(in|out|ans|expected)$/i.exec(f.name);
    if (!m) { ignored += 1; continue; }
    const stem = m[1];
    const ext = m[2].toLowerCase();
    if (ext === "in") {
      inputs.set(stem, f);
    } else {
      const prev = answers.get(stem);
      if (!prev || ANSWER_RANK[ext] < ANSWER_RANK[prev.ext]) answers.set(stem, { ext, file: f });
    }
  }
  const stems = [...inputs.keys()]
    .filter((s) => answers.has(s))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const unpaired = inputs.size - stems.length;
  return { pairs: stems.map((s) => ({ stem: s, in: inputs.get(s), out: answers.get(s).file })), unpaired, ignored };
}

async function importTestFiles(app, fileList) {
  if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
  const { pairs, unpaired, ignored } = pairTestFiles([...fileList]);
  if (!pairs.length) {
    app.toast("Không tìm thấy cặp test nào — cần các file dạng 1.in + 1.out (hoặc .ans).", "err");
    return;
  }
  const tests = [];
  let oversized = 0;
  for (const p of pairs) {
    if (p.in.size > IMPORT_MAX_BYTES || p.out.size > IMPORT_MAX_BYTES) { oversized += 1; continue; }
    tests.push({ name: p.stem, input: await p.in.text(), expected: await p.out.text() });
  }
  if (!tests.length) { app.toast("Tất cả file đều quá 4MB — không import được.", "err"); return; }
  try {
    const { added, skipped } = await api.addTestsBulk(app.state.currentId, tests);
    await app.reloadTests();
    const parts = [`Đã import ${added.length} test`];
    const dropped = (skipped ? skipped.length : 0) + oversized;
    if (dropped) parts.push(`${dropped} bị bỏ qua (quá giới hạn)`);
    if (unpaired) parts.push(`${unpaired} file .in thiếu .out`);
    if (ignored) parts.push(`${ignored} file không phải test`);
    app.toast(parts.join(" · "), added.length ? "ok" : "err");
  } catch (err) { app.toast(err.message, "err"); }
}

// ---- Init ------------------------------------------------------------------

export function initTests(app) {
  const { el } = app;

  el.btnAddTest.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    try {
      const { test } = await api.addTest(app.state.currentId, { input: "", expected: "" });
      app.state.tests.push(test);
      app.state.openTests.add(test.id);
      renderTests(app);
    } catch (err) { app.toast(err.message, "err"); }
  });

  // 📂 Import .in/.out — file picker + drag-drop onto the Tests panel.
  const btnImport = document.getElementById("btn-import-tests");
  const importInput = document.getElementById("import-tests-files");
  if (btnImport && importInput) {
    btnImport.addEventListener("click", () => {
      if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
      importInput.click();
    });
    importInput.addEventListener("change", async () => {
      if (importInput.files && importInput.files.length) await importTestFiles(app, importInput.files);
      importInput.value = ""; // allow re-importing the same selection
    });
  }
  const panel = el.testsList ? el.testsList.closest('[data-panel="tests"]') : null;
  if (panel) {
    let dragDepth = 0;
    panel.addEventListener("dragenter", (e) => {
      if (![...(e.dataTransfer ? e.dataTransfer.types : [])].includes("Files")) return;
      e.preventDefault();
      dragDepth += 1;
      panel.classList.add("drop-target");
    });
    panel.addEventListener("dragover", (e) => { e.preventDefault(); });
    panel.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) panel.classList.remove("drop-target");
    });
    panel.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragDepth = 0;
      panel.classList.remove("drop-target");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        await importTestFiles(app, e.dataTransfer.files);
      }
    });
  }

  el.btnRunTests.addEventListener("click", () => app.judgeAll());

  // "Only failing" filter — hides AC and not-yet-run tests so you can focus on
  // what's broken (handy on USACO problems with 10-25 tests). Pure CSS toggle.
  const btnFilterFail = document.getElementById("btn-filter-failing");
  if (btnFilterFail) btnFilterFail.addEventListener("click", () => {
    const on = el.testsList.classList.toggle("only-failing");
    btnFilterFail.classList.toggle("active", on);
  });
  // "Generate with AI" jumps to the Problem view and runs the inline pipeline.
  el.btnAiGenTests.addEventListener("click", () => {
    if (app.runStatementPipeline) app.runStatementPipeline();
  });

  // Card interactions (delegated).
  el.testsList.addEventListener("click", async (e) => {
    const card = e.target.closest(".tcard");
    if (!card) return;
    const tid = card.dataset.tid;
    const actBtn = e.target.closest("[data-act]");
    if (!actBtn) return;
    const act = actBtn.dataset.act;

    if (act === "toggle") {
      card.classList.toggle("open");
      if (card.classList.contains("open")) app.state.openTests.add(tid);
      else app.state.openTests.delete(tid);
    } else if (act === "del") {
      if (!confirm("Delete this test case?")) return;
      try {
        await api.deleteTest(app.state.currentId, tid);
        app.state.tests = app.state.tests.filter((t) => t.id !== tid);
        app.state.openTests.delete(tid);
        renderTests(app);
      } catch (err) { app.toast(err.message, "err"); }
    } else if (act === "run") {
      await app.runSingleTest(tid);
    } else if (act === "viz") {
      const test = app.state.tests.find((t) => t.id === tid);
      if (test && app.openVisualizer) app.openVisualizer(test.input, `${test.name} · input`);
    }
  });

  // Save card edits on blur.
  el.testsList.addEventListener("blur", async (e) => {
    const card = e.target.closest(".tcard");
    if (!card) return;
    const tid = card.dataset.tid;
    const test = app.state.tests.find((t) => t.id === tid);
    if (!test) return;
    let patch = null;
    if (e.target.classList.contains("tc-name") && e.target.value !== test.name) patch = { name: e.target.value };
    else if (e.target.classList.contains("tc-input") && e.target.value !== test.input) patch = { input: e.target.value };
    else if (e.target.classList.contains("tc-expected") && e.target.value !== test.expected) patch = { expected: e.target.value };
    if (!patch) return;
    try {
      const { test: updated } = await api.updateTest(app.state.currentId, tid, patch);
      Object.assign(test, updated);
      if (patch.name) card.querySelector(".tcard-name").textContent = updated.name;
      if (patch.input != null || patch.expected != null) {
        card.querySelector(".tcard-prev").textContent = `in: ${preview(test.input)} · out: ${preview(test.expected)}`;
      }
    } catch (err) { app.toast(err.message, "err"); }
  }, true);
}
