// runner.js — Run / Judge orchestration + the judge console (verdict, badges,
// line-numbered output, Output/Compile/Diff sub-tabs) + history wiring.

import { api } from "./api.js";
import { applyTestResults } from "./testcases.js";
import { attachGutter, setGutter, lineCount } from "./linenums.js";
import { renderMarkdown, escapeHtml } from "./md.js";

function setVerdict(app, verdict, label) {
  const chip = app.el.outputVerdict;
  // MLE is intentionally absent: peak-memory sampling isn't wired into the run
  // loop, so the judge never produces it. Don't advertise a verdict we can't give.
  const known = ["AC", "WA", "RE", "CE", "TLE", "OK", "running"];
  const cls = known.includes(verdict) ? verdict : "idle";
  chip.className = `verdict-chip verdict-${cls}`;
  chip.textContent = label || verdict;
}

function setBusy(app, busy) {
  app.el.btnRun.disabled = busy || !app.state.currentId;
  app.el.btnJudge.disabled = busy || !app.state.currentId;
  if (app.el.btnRunCustom) app.el.btnRunCustom.disabled = busy || !app.state.currentId;
}

function setOutput(app, text) {
  app.el.outputStdout.textContent = text || "";
  setGutter(app.el.outGutter, lineCount(text || ""));
}

function setStderr(app, text, isCE = false) {
  app.el.outputStderr.textContent = text || "";
  const hasErr = !!(text && text.trim());
  if (app.el.stderrSection) app.el.stderrSection.classList.toggle("hidden", !hasErr);

  const btnExplain = document.getElementById("btn-ai-explain-ce");
  if (btnExplain) {
    btnExplain.classList.toggle("hidden", !hasErr || !isCE);
    btnExplain.disabled = false;
    btnExplain.textContent = "✨ Giải thích lỗi";
  }
  
  const box = document.getElementById("ai-ce-explanation");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

function setRuntime(app, ms) {
  app.el.rcRuntime.textContent = `${Math.round(ms || 0)} ms`;
}

// ---- Output rendering -----------------------------------------------------

function renderRunOutput(app, r) {
  if (r.compilerMissing) {
    setVerdict(app, "CE", "CE · no g++");
    if (app.playSound) app.playSound("error");
  } else if (r.verdict === "OK") {
    setVerdict(app, "OK", "RAN");
    if (app.playSound) app.playSound("success");
  } else {
    setVerdict(app, r.verdict, r.verdict);
    if (app.playSound) app.playSound(r.verdict === "CE" ? "error" : "success");
  }

  setRuntime(app, r.timeMs);
  app.el.rcSummary.innerHTML = r.hasExpected ? "" : `<span class="muted">thêm Expected để tự chấm</span>`;
  setOutput(app, r.stdout);
  setStderr(app, r.stderr, r.verdict === "CE");
  // Full side-by-side diff (expected box vs actual stdout) when wrong.
  app.state._diffTests = r.verdict === "WA"
    ? [{ name: "stdin run", expected: app.el.ioExpected.value, actual: r.stdout }]
    : [];
  renderSideDiff(app, 0);
}

function renderJudgeOutput(app, r) {
  if (r.compilerMissing) {
    setVerdict(app, "CE", "CE · no g++");
    if (app.playSound) app.playSound("error");
  } else {
    setVerdict(app, r.verdict, r.verdict === "—" ? "NO TESTS" : r.verdict);
    if (app.playSound) {
      if (r.verdict === "AC") app.playSound("ac");
      else if (r.verdict === "CE") app.playSound("error");
      else if (["WA", "RE", "TLE", "MLE"].includes(r.verdict)) app.playSound("wa");
      else app.playSound("success");
    }
  }

  const s = r.summary || { total: 0, passed: 0, timeMs: 0 };
  setRuntime(app, s.timeMs);
  app.el.rcSummary.innerHTML = r.results && r.results.length
    ? `<b>${s.passed}</b> / ${s.total} passed`
    : (r.message ? `<span class="muted">${escapeHtml(r.message)}</span>` : "");

  if (r.results && r.results.length) {
    setOutput(app, r.results.map((t) =>
      `${String(t.testId).padEnd(5)} ${String(t.name).slice(0, 20).padEnd(20)} ${t.status.padEnd(4)} ${Math.round(t.timeMs)}ms`
    ).join("\n"));
  } else {
    setOutput(app, r.message || "");
  }
  setStderr(app, (r.compile && r.compile.stderr) || "", r.verdict === "CE");
  // Full side-by-side diff for each failing test, with a switcher when >1 fails.
  app.state._diffTests = (r.results || [])
    .filter((t) => t.status === "WA")
    .map((t) => ({ name: t.name || t.testId, expected: t.expected, actual: t.actual }));
  renderSideDiff(app, 0);
}

// Make trailing whitespace + tabs visible so "looks identical" WAs are obvious.
function visWs(line) {
  return escapeHtml(line)
    .replace(/\t/g, '<span class="ws">→</span>')
    .replace(/( +)$/, (m) => `<span class="ws">${"·".repeat(m.length)}</span>`);
}

const DIFF_MAX_ROWS = 400;

// Build line-aligned (by index) side-by-side rows; mismatched lines are flagged,
// and a missing line on either side is shown as ∅.
function lineDiffRows(expected, actual) {
  const E = String(expected == null ? "" : expected).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const A = String(actual == null ? "" : actual).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const max = Math.max(E.length, A.length);
  const shown = Math.min(max, DIFF_MAX_ROWS);
  let rows = "";
  for (let i = 0; i < shown; i += 1) {
    const e = E[i];
    const a = A[i];
    const same = (e || "") === (a || "");
    const eCell = e == null ? '<span class="diff-missing">∅</span>' : visWs(e);
    const aCell = a == null ? '<span class="diff-missing">∅</span>' : visWs(a);
    rows += `<div class="sdiff-row${same ? "" : " sdiff-bad"}"><span class="sdiff-ln">${i + 1}</span>` +
      `<pre class="sdiff-cell sdiff-exp">${eCell}</pre><pre class="sdiff-cell sdiff-act">${aCell}</pre></div>`;
  }
  if (max > shown) rows += `<div class="sdiff-row"><span class="sdiff-ln">…</span><pre class="sdiff-cell" colspan="2">(${max - shown} dòng nữa bị cắt)</pre></div>`;
  return rows;
}

// Render the side-by-side diff for failing test `idx` (from app.state._diffTests),
// with clickable tabs to switch between failing tests.
function renderSideDiff(app, idx) {
  const section = app.el.diffSection;
  const box = app.el.outputDiff;
  const tests = app.state._diffTests || [];
  if (!tests.length) { if (section) section.classList.add("hidden"); box.innerHTML = ""; return; }
  if (section) section.classList.remove("hidden");
  const sel = Math.min(Math.max(idx, 0), tests.length - 1);
  const t = tests[sel];
  const tabs = tests.length > 1
    ? `<div class="sdiff-tabs">${tests.map((x, i) => `<button class="sdiff-tab${i === sel ? " active" : ""}" data-i="${i}">${escapeHtml(x.name || ("test " + (i + 1)))}</button>`).join("")}</div>`
    : "";
  box.innerHTML = tabs +
    `<div class="sdiff"><div class="sdiff-row sdiff-headrow"><span class="sdiff-ln"></span>` +
    `<span class="sdiff-cell sdiff-h">expected</span><span class="sdiff-cell sdiff-h">actual</span></div>` +
    lineDiffRows(t.expected, t.actual) + `</div>`;
  box.querySelectorAll(".sdiff-tab").forEach((b) =>
    b.addEventListener("click", () => renderSideDiff(app, Number(b.dataset.i))));
}

// ---- History --------------------------------------------------------------

export function renderHistory(app) {
  const history = (app.state.meta && app.state.meta.history) || [];
  const list = app.el.historyList;
  app.el.historyDetail.classList.add("hidden");
  if (history.length === 0) {
    list.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding:8px">No runs yet.</div>`;
    return;
  }
  list.innerHTML = history.map((h, i) => {
    const v = h.verdict ? `<span class="vbadge v-${escapeHtml(h.verdict)}">${escapeHtml(h.verdict)}</span>` : "";
    const counts = h.total != null && h.passed != null ? `${h.passed}/${h.total} · ` : "";
    const t = new Date(h.at);
    const time = isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `<div class="tl-item" data-at="${escapeHtml(h.at)}" data-i="${i}">
      <span class="tl-time">${time}</span>${v}
      <span class="tl-type">${escapeHtml(h.type)}</span>
      <span class="tl-meta">${counts}${Math.round(h.timeMs || 0)}ms</span>
    </div>`;
  }).join("");
}

async function showHistoryDetail(app, at, itemEl) {
  app.el.historyList.querySelectorAll(".tl-item").forEach((el) => el.classList.remove("active"));
  if (itemEl) itemEl.classList.add("active");
  const detail = app.el.historyDetail;
  detail.classList.remove("hidden");
  detail.innerHTML = `<div class="hd-section-title">Loading snapshot…</div>`;
  try {
    const { history } = await api.getHistory(app.state.currentId);
    const snap = history.find((h) => h.at === at);
    if (!snap) { detail.innerHTML = `<div class="hd-section-title">No snapshot stored for this run.</div>`; return; }
    const v = snap.verdict ? `<span class="vbadge v-${escapeHtml(snap.verdict)}">${escapeHtml(snap.verdict)}</span>` : "";
    detail.innerHTML = `
      <div class="hd-head">${v}<span class="tl-meta">${snap.type} · ${Math.round(snap.timeMs || 0)}ms ${snap.total != null ? "· " + snap.passed + "/" + snap.total : ""}</span>
        <button id="hd-restore" class="btn btn-ghost btn-sm" style="margin-left:auto">Restore code</button></div>
      ${snap.code ? `<div class="hd-section-title">code snapshot</div><pre class="hd-pre">${escapeHtml(snap.code)}</pre>` : ""}
      ${snap.stdout ? `<div class="hd-section-title">stdout</div><pre class="hd-pre">${escapeHtml(snap.stdout)}</pre>` : ""}
      ${snap.stderr ? `<div class="hd-section-title">stderr</div><pre class="hd-pre io-pre-err">${escapeHtml(snap.stderr)}</pre>` : ""}`;
    const restore = document.getElementById("hd-restore");
    if (restore) restore.addEventListener("click", () => {
      if (!snap.code) return;
      if (!confirm("Replace the current editor code with this snapshot?")) return;
      app.el.codeEditor.value = snap.code;
      app.refreshHighlight();
      app.el.codeEditor.dispatchEvent(new Event("input"));
      app.toast("Code restored from snapshot", "ok");
    });
  } catch (err) {
    detail.innerHTML = `<div class="hd-section-title">${escapeHtml(err.message)}</div>`;
  }
}

// ---- Actions --------------------------------------------------------------

export function initRunner(app) {
  // Line-number gutters for the console.
  attachGutter(app.el.ioInput, app.el.inGutter);
  attachGutter(app.el.ioExpected, app.el.expGutter);
  attachGutter(app.el.outputStdout, app.el.outGutter, { editable: false });

  app.el.btnRun.addEventListener("click", () => app.runOne());
  app.el.btnJudge.addEventListener("click", () => app.judgeAll());
  app.el.btnRunCustom.addEventListener("click", () => app.runOne());

  app.el.btnSaveAsTest.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    const input = app.el.ioInput.value;
    const expected = app.el.ioExpected.value;
    if (!input.trim() && !expected.trim()) { app.toast("Nothing to save — Input and Expected are empty.", "err"); return; }
    try {
      await api.addTest(app.state.currentId, { input, expected });
      app.toast("Saved as test case", "ok");
      await app.reloadTests();
    } catch (err) { app.toast(err.message, "err"); }
  });

  // History timeline click.
  app.el.historyList.addEventListener("click", (e) => {
    const item = e.target.closest(".tl-item");
    if (!item) return;
    showHistoryDetail(app, item.dataset.at, item);
  });

  const btnExplainCE = document.getElementById("btn-ai-explain-ce");
  const boxExplainCE = document.getElementById("ai-ce-explanation");
  let explainAbort = null;
  if (btnExplainCE && boxExplainCE) {
    btnExplainCE.addEventListener("click", async () => {
      // Mid-flight: abort the running explanation.
      if (explainAbort) { explainAbort.abort(); return; }
      if (!app.state.currentId) return;
      const pid = app.state.currentId;
      explainAbort = new AbortController();
      btnExplainCE.textContent = "⏹ Dừng";
      btnExplainCE.classList.add("btn-stop");
      boxExplainCE.classList.remove("hidden");
      boxExplainCE.innerHTML = "<i>AI đang đọc lỗi biên dịch...</i>";
      try {
        const res = await api.aiExplainError({
          code: app.getEditorValue(),
          stderr: app.el.outputStderr.textContent
        }, { signal: explainAbort.signal });
        if (app.state.currentId !== pid) { boxExplainCE.classList.add("hidden"); return; } // switched problems mid-flight
        boxExplainCE.innerHTML = renderMarkdown(res.explanation);
        btnExplainCE.textContent = "✓ Đã giải thích";
        btnExplainCE.disabled = true;
      } catch (err) {
        if (err && err.aborted) {
          boxExplainCE.innerHTML = `<span class="muted">⏹ Đã dừng giải thích.</span>`;
        } else {
          boxExplainCE.innerHTML = `<span style="color:var(--re)">Lỗi: ${escapeHtml(err.message)}</span>`;
          app.toast(err.message, "err");
        }
      } finally {
        if (!btnExplainCE.disabled) {
          btnExplainCE.textContent = "✨ Giải thích lỗi";
        }
        btnExplainCE.classList.remove("btn-stop");
        explainAbort = null;
      }
    });
  }

  app.runOne = async () => {
    if (!app.state.currentId) return;
    if (app.incrementRuns) app.incrementRuns();
    setBusy(app, true);
    setVerdict(app, "running", "RUNNING…");
    const banner = document.getElementById("contest-suggest-banner");
    if (banner) banner.classList.add("hidden");
    app.setTab("run");
    try {
      await app.saveCodeNow();
      await app.flushIo();
      const r = await api.run(app.state.currentId, app.getEditorValue());
      renderRunOutput(app, r);
      await app.syncMeta();
    } catch (err) {
      setVerdict(app, "idle", "ERROR");
      setStderr(app, err.message);
      app.toast(err.message, "err");
    } finally {
      setBusy(app, false);
    }
  };

  app.judgeAll = async () => {
    if (!app.state.currentId) return;
    if (app.incrementRuns) app.incrementRuns();
    setBusy(app, true);
    setVerdict(app, "running", "JUDGING…");
    app.setTab("run");
    try {
      await app.saveCodeNow();
      const r = await api.judge(app.state.currentId, app.getEditorValue());
      renderJudgeOutput(app, r);
      applyTestResults(app, r.results);
      await app.syncMeta();
      
      const banner = document.getElementById("contest-suggest-banner");
      if (banner) banner.classList.add("hidden");
      
      if (r.verdict === "AC") {
        try {
          const stats = await api.stats();
          if (stats && stats.solved > 0 && stats.solved % 5 === 0) {
            const cnt = document.getElementById("cs-count");
            if (banner && cnt) {
               cnt.textContent = stats.solved;
               banner.classList.remove("hidden");
               const btn = document.getElementById("btn-suggest-contest");
               if (btn) btn.onclick = () => {
                 document.getElementById("btn-contests")?.click();
                 setTimeout(() => document.getElementById("contest-new-btn")?.click(), 300);
                 banner.classList.add("hidden");
               };
            }
          }
        } catch(e) { /* ignore network errors for stats */ }
      }

      return r;
    } catch (err) {
      setVerdict(app, "idle", "ERROR");
      setStderr(app, err.message);
      app.toast(err.message, "err");
    } finally {
      setBusy(app, false);
    }
  };

  app.runSingleTest = async (testId) => {
    if (!app.state.currentId) return;
    try {
      await app.saveCodeNow();
      const r = await api.judge(app.state.currentId, app.getEditorValue(), testId);
      applyTestResults(app, r.results);
      if (r.compilerMissing) app.toast("g++ not found — see Settings", "err");
    } catch (err) { app.toast(err.message, "err"); }
  };
}

export { renderRunOutput, renderJudgeOutput };
