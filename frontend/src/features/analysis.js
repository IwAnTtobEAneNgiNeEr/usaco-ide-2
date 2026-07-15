// analysis.js — "Phân tích code này" (Verified Artifact Loop, Phase 3).
// Reconciled 2026-07-15 against the real backend contract
// (docs/VERIFIED-ARTIFACT-API.md, shipped by Agent A commit a27c0ca).
//
// Every field rendered here comes from server evidence + the bfs-trace
// response — no assumed shape, no client-side simulation. `evidenceId` is
// read from the judge response's `.evidence.id` (never reconstructed), and
// the evidence document itself (input/expected/actual/code snapshot) is
// fetched via its own `.href` rather than a client-built path.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function firstDiffLine(expected, actual) {
  const norm = (s) => String(s == null ? "" : s).replace(/\r/g, "").replace(/\s+$/, "").split("\n");
  const e = norm(expected);
  const a = norm(actual);
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i += 1) {
    if ((e[i] ?? "").replace(/\s+$/, "") !== (a[i] ?? "").replace(/\s+$/, "")) {
      return { line: i + 1, expected: e[i] ?? "", actual: a[i] ?? "" };
    }
  }
  return null;
}

function cellStr(cell) {
  return cell ? `(${cell.r},${cell.c})` : "";
}

function cellListStr(cells) {
  return (Array.isArray(cells) ? cells : []).map(cellStr).join(" ");
}

function renderStepsTable(analysis) {
  const steps = analysis.steps || [];
  const rows = steps.map((s) => `
    <tr>
      <td>${s.index}</td>
      <td>${escapeHtml(cellStr(s.cell))}</td>
      <td>${s.distance}</td>
      <td>${escapeHtml(cellListStr(s.queueBefore))}</td>
      <td>${escapeHtml(cellListStr(s.discovered && s.discovered.map((d) => ({ r: d.r, c: d.c }))))}</td>
      <td>${escapeHtml(cellListStr(s.queueAfter))}</td>
    </tr>`).join("");
  return `
    <div class="an-trace">
      <table class="an-trace-table">
        <thead><tr><th>#</th><th>dequeue</th><th>dist</th><th>queue trước</th><th>khám phá mới</th><th>queue sau</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${analysis.truncated ? `<div class="an-note">…trace cắt bớt ở ${steps.length} bước (input lớn).</div>` : ""}
    </div>`;
}

function renderSourceLines(sourceLines) {
  const entries = Object.entries(sourceLines || {}).filter(([, line]) => line != null);
  if (!entries.length) return "";
  const labels = {
    queueDeclaration: "khai báo queue", loop: "vòng lặp while", front: "front()",
    pop: "pop()", enqueue: "push()", visit: "gán distance",
  };
  return `<div class="an-sourcelines">${entries.map(([k, line]) => `
    <button type="button" class="an-line-chip" data-jump-line="${Number(line)}">${escapeHtml(labels[k] || k)} · dòng ${Number(line)}</button>`).join("")}</div>`;
}

function renderWarnings(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) return "";
  return warnings.map((w) => `
    <div class="an-warning" ${w.line ? `data-jump-line="${Number(w.line)}"` : ""}>
      ⚠ ${escapeHtml(w.message)}${w.line ? ` <span class="an-line-tag">dòng ${Number(w.line)} · bấm để mở</span>` : ""}
    </div>`).join("");
}

function renderNextAction(nextAction) {
  if (!nextAction) return "";
  return `<div class="rail-chips an-actions">
    <button type="button" class="rail-chip an-next" data-an-action="${escapeHtml(nextAction.id || "")}" data-jump-line="${nextAction.line ? Number(nextAction.line) : ""}">
      <span class="rc-g">→</span><span>${escapeHtml(nextAction.label || "Tiếp tục")}</span>
    </button>
    <div class="an-dim">${escapeHtml(nextAction.reason || "")}</div>
  </div>`;
}

// Scratch input of the evidence being viewed — kept out of the DOM (large
// grids are unwieldy as HTML attributes) and read by the "load into Run" chip.
let currentTestInput = "";

async function render(app, body, evidenceRef) {
  const pid = app.state.currentId;
  const meta = app.state.meta || {};

  body.innerHTML = `<div class="an-note an-wait">Đang tải evidence…</div>`;

  let evidenceDoc;
  try {
    evidenceDoc = await api.evidenceByHref(evidenceRef.href);
  } catch (err) {
    body.innerHTML = `<div class="an-note">Không tải được evidence: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    return;
  }
  if (app.state.currentId !== pid) return;

  const ev = evidenceDoc.evidence || evidenceDoc;
  const run = ev.run || {};
  const test = ev.test || {};
  const diff = run.verdict === "WA" ? firstDiffLine(test.expected, test.actual) : null;

  const evidenceHtml = `
    <div class="an-evidence">
      <div class="an-ev-head">Bằng chứng: <b>${escapeHtml(String(test.name || test.testId || ""))}</b> · ${escapeHtml(String(run.verdict || ""))} · ${Math.round(run.timeMs || 0)}ms
        <span class="an-dim">(evidence ${escapeHtml(run.id || "")}, run ${escapeHtml(run.type || "")})</span></div>
      <div class="mo-evidence">
        <div class="mo-io"><div class="mo-io-label">Vào</div><pre class="mo-pre">${escapeHtml(clip(test.input, 400)) || "<i>(rỗng)</i>"}</pre></div>
        <div class="mo-io is-exp"><div class="mo-io-label">Chờ đợi</div><pre class="mo-pre">${escapeHtml(clip(test.expected, 300)) || "<i>(rỗng)</i>"}</pre></div>
        <div class="mo-io is-got"><div class="mo-io-label">Em in ra</div><pre class="mo-pre">${escapeHtml(clip(run.verdict === "RE" ? (test.stderr || test.actual) : test.actual, 300)) || "<i>(không có output)</i>"}</pre></div>
      </div>
      ${diff ? `<div class="mo-firstdiff">Lệch đầu tiên ở dòng output ${diff.line}: chờ <code class="fd-exp">${escapeHtml(clip(diff.expected, 40)) || "␀"}</code> — em in <code class="fd-got">${escapeHtml(clip(diff.actual, 40)) || "␀"}</code></div>` : ""}
    </div>`;

  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Phân tích code này</div>
      <h2 class="doc-title">${escapeHtml(meta.title || pid || "")}</h2>
      <div class="an-sub">
        <span class="an-dim">phân tích dựa trên chính code + input của evidence này — server chạy lại từ evidence, không nhận code/input client tự gửi</span>
      </div>
    </div>
    ${evidenceHtml}
    <div class="an-trace-zone" id="an-trace-zone"><div class="an-note an-wait">Đang lấy trace…</div></div>
    <div class="rail-chips an-actions">
      ${test.input ? `<button type="button" class="rail-chip" id="an-load-input"><span class="rc-g">▶</span><span>Nạp input này vào ô Run</span></button>` : ""}
      <button type="button" class="rail-chip" id="an-back-editor"><span class="rc-g">‹/›</span><span>Về editor</span></button>
    </div>`;
  currentTestInput = typeof test.input === "string" ? test.input : "";

  const zone = body.querySelector("#an-trace-zone");
  let analysis;
  try {
    const traceRes = await api.bfsTrace(pid, evidenceRef.id);
    analysis = traceRes.analysis;
  } catch (err) {
    if (app.state.currentId !== pid || !zone.isConnected) return;
    zone.innerHTML = `<div class="an-note">Không lấy được trace: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    return;
  }
  if (app.state.currentId !== pid || !zone.isConnected) return;

  if (!analysis.supported) {
    const fb = analysis.fallback || {};
    zone.innerHTML = `
      <div class="an-note">Trace từng bước <b>không hỗ trợ</b> cho slice này — ${escapeHtml(fb.reason || "input/code không khớp mẫu grid BFS nhận dạng được")}.
        Không mô phỏng thay thế; dùng Visualizer hoặc failing input thật bên dưới.</div>
      ${renderNextAction(analysis.nextAction)}
      ${fb.input ? `<div class="rail-chips an-actions"><button type="button" class="rail-chip" id="an-open-viz"><span class="rc-g">◉</span><span>Mở Visualizer với input này</span></button></div>` : ""}`;
    const vizBtn = zone.querySelector("#an-open-viz");
    if (vizBtn) vizBtn.addEventListener("click", () => {
      if (app.openVisualizer) app.openVisualizer(fb.input, "Input của evidence đang phân tích");
    });
    return;
  }

  zone.innerHTML = `
    <div class="an-result">Kết quả mô phỏng: ${analysis.result.reachable
      ? `tới được, khoảng cách <b>${analysis.result.distance}</b>, ${analysis.result.visitedCount} ô đã thăm`
      : `không tới được, ${analysis.result.visitedCount} ô đã thăm`}</div>
    <div class="an-dim">${escapeHtml(analysis.invariant || "")}</div>
    ${renderWarnings(analysis.warnings)}
    ${renderSourceLines(analysis.sourceLines)}
    ${renderStepsTable(analysis)}
    ${renderNextAction(analysis.nextAction)}`;
}

export function initAnalysis(app) {
  const modal = document.getElementById("analysis-modal");
  const body = document.getElementById("analysis-body");
  if (!modal || !body) return;

  const close = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  const closeBtn = document.getElementById("analysis-close");
  if (closeBtn) closeBtn.addEventListener("click", close);

  body.addEventListener("click", (e) => {
    const jumpEl = e.target.closest("[data-jump-line]");
    if (jumpEl && jumpEl.dataset.jumpLine && app.jumpToLine) { close(); app.jumpToLine(jumpEl.dataset.jumpLine); return; }
    if (e.target.closest("#an-back-editor")) { close(); if (app.el.codeEditor && app.el.codeEditor.focus) app.el.codeEditor.focus(); return; }
    if (e.target.closest("#an-load-input")) {
      if (app.el.ioInput) {
        app.el.ioInput.value = currentTestInput;
        app.el.ioInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (app.setTab) app.setTab("run");
        app.toast && app.toast("Đã nạp input của evidence vào ô Run — chạy để soi hành vi.", "ok");
      }
      close();
      return;
    }
  });

  // evidenceRef: the `.evidence` object from a run/judge response
  // ({ id, href, runType, verdict, ... }) — never a client-guessed shape.
  app.openCodeAnalysis = (evidenceRef) => {
    const ref = evidenceRef || (app.state.lastJudge && app.state.lastJudge.evidence);
    if (!app.state.currentId) return;
    if (!ref || !ref.id || !ref.href) {
      app.toast && app.toast("Chưa có evidence của lần chấm này — bấm Judge trước.", "err");
      return;
    }
    modal.classList.remove("hidden");
    render(app, body, ref);
  };
}
