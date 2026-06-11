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
    return;
  }
  badge.className = `vbadge tc-badge v-${result.status}`;
  badge.textContent = result.status;
  time.textContent = `${Math.round(result.timeMs)}ms`;
  if (out) {
    let txt = `actual:\n${result.actual || ""}`;
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

  el.btnRunTests.addEventListener("click", () => app.judgeAll());
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
