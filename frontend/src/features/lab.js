// lab.js — the "Lab": three CP power-tools sharing one modal.
//   🧪 Stress Test  — generator + brute vs your solution, finds the smallest
//                     failing case. Optional: let AI write the generator/brute.
//   📈 Complexity   — run your solution on growing N, plot runtime, estimate O().
//   🔬 AI Dry-Run   — AI simulates executing your C++ code step by step,
//                     tracking chosen variables in a readable table.
// A generator's first argv is a number controlling input size: small seeds make
// small inputs (good for stress vs brute); large N makes big inputs (profiling).
// Generator/brute code is persisted per-problem in localStorage.

import { api } from "../api.js";
import { renderMarkdown, escapeHtml } from "../md.js";

const GEN_PLACEHOLDER =
`// argv[1] = số điều khiển kích thước (seed/N)
#include <bits/stdc++.h>
using namespace std;
int main(int argc, char** argv) {
    mt19937 rng(atoi(argv[1]));
    int n = atoi(argv[1]) % 8 + 1;       // nhỏ cho stress
    printf("%d\\n", n);
    for (int i = 0; i < n; i++) printf("%d ", (int)(rng() % 100));
    printf("\\n");
}`;

const BRUTE_PLACEHOLDER =
`// Lời giải đơn giản, chắc đúng (có thể chậm). stdin -> stdout.
#include <bits/stdc++.h>
using namespace std;
int main() {

}`;

function lsKey(app, what) { return `usaco.lab.${app.state.currentId}.${what}`; }

function buildModal() {
  const existing = document.getElementById("lab-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "lab-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide lab-modal">
      <h2 class="modal-title">🧪 Lab — Stress &amp; Complexity &amp; Dry-Run</h2>
      <div class="lab-tabs">
        <button class="lab-tab active" data-lt="stress" type="button">🧪 Stress Test</button>
        <button class="lab-tab" data-lt="profile" type="button">📈 Complexity</button>
        <button class="lab-tab" data-lt="dryrun" type="button">🔬 AI Dry-Run</button>
      </div>

      <div class="lab-scroll">
        <div class="lab-field" data-only="stress profile">
          <div class="lab-field-head"><span>Generator <span class="muted">(argv[1] = seed/N)</span></span>
            <button id="lab-ai-gen" class="btn btn-ai btn-sm" type="button">✨ AI viết</button></div>
          <textarea id="lab-gen" class="lab-code" spellcheck="false" placeholder="${escapeHtml(GEN_PLACEHOLDER)}"></textarea>
        </div>

        <div class="lab-field" data-only="stress">
          <div class="lab-field-head"><span>Brute / reference <span class="muted">(stdin → stdout)</span></span>
            <button id="lab-ai-brute" class="btn btn-ai btn-sm" type="button">✨ AI viết</button></div>
          <textarea id="lab-brute" class="lab-code" spellcheck="false" placeholder="${escapeHtml(BRUTE_PLACEHOLDER)}"></textarea>
        </div>

        <div class="lab-controls" data-only="stress">
          <label>Số test<input id="lab-iters" class="input" type="number" min="1" max="1000" value="100" /></label>
          <label>Time/test (ms)<input id="lab-time-s" class="input" type="number" min="100" max="10000" step="100" value="2000" /></label>
          <button id="lab-run-stress" class="btn btn-primary" type="button">▶ Chạy stress</button>
        </div>

        <div class="lab-controls" data-only="profile" hidden>
          <label>Các kích thước N<input id="lab-sizes" class="input" value="1000,2000,4000,8000,16000,32000,64000,128000" /></label>
          <label>Time/run (ms)<input id="lab-time-p" class="input" type="number" min="100" max="10000" step="100" value="4000" /></label>
          <button id="lab-run-profile" class="btn btn-primary" type="button">▶ Đo độ phức tạp</button>
        </div>

        <!-- AI Dry-Run Debugger -->
        <div class="lab-field" data-only="dryrun" hidden>
          <div class="lab-field-head"><span>✨ AI Dry-Run Debugger</span></div>
          <p class="muted" style="font-size:12px;margin:0">AI sẽ "chạy tay" code C++ hiện tại của bạn với Input bên dưới, theo dõi giá trị biến qua từng bước.</p>
        </div>
        <div class="lab-field" data-only="dryrun" hidden>
          <div class="lab-field-head"><span>Input mẫu</span></div>
          <textarea id="lab-dr-input" class="lab-code" style="min-height:80px" spellcheck="false" placeholder="Nhập input mẫu để mô phỏng chạy tay…"></textarea>
        </div>
        <div class="lab-controls" data-only="dryrun" hidden>
          <label style="flex:1;min-width:200px">Biến cần theo dõi <span class="muted">(cách nhau bởi dấu phẩy)</span>
            <input id="lab-dr-vars" class="input" placeholder="VD: i, j, dp[i][j], ans" style="width:100%" /></label>
          <button id="lab-run-dryrun" class="btn btn-ai" type="button">🔬 Chạy Mô Phỏng</button>
        </div>

        <div id="lab-result" class="lab-result"></div>
      </div>

      <div class="modal-actions">
        <button type="button" id="lab-close" class="btn btn-ghost">Đóng</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initLab(app) {
  const trigger = document.getElementById("btn-stress");
  if (!trigger) return;
  const modal = buildModal();
  const $ = (id) => modal.querySelector(id);
  const genEl = $("#lab-gen"), bruteEl = $("#lab-brute"), resultEl = $("#lab-result");
  let mode = "stress";
  let aiWriteAbort = null;
  let dryRunAbort = null;

  const setMode = (m) => {
    mode = m;
    modal.querySelectorAll(".lab-tab").forEach((t) => t.classList.toggle("active", t.dataset.lt === m));
    modal.querySelectorAll("[data-only]").forEach((el) => {
      const allowed = el.dataset.only.split(/\s+/);
      el.hidden = !allowed.includes(m);
    });
  };
  modal.querySelectorAll(".lab-tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.lt)));

  const close = () => modal.classList.add("hidden");
  $("#lab-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // Persist gen/brute per problem.
  const save = () => {
    if (!app.state.currentId) return;
    try {
      localStorage.setItem(lsKey(app, "gen"), genEl.value);
      localStorage.setItem(lsKey(app, "brute"), bruteEl.value);
    } catch (err) {
      if (err.name === "QuotaExceededError" || err.code === 22) {
        app.toast("Trình duyệt hết dung lượng lưu trữ (LocalStorage quota exceeded). Không thể tự động lưu mã nguồn Lab.", "err");
      } else {
        console.error("LocalStorage save failed:", err);
      }
    }
  };
  genEl.addEventListener("input", save);
  bruteEl.addEventListener("input", save);

  // --- AI helper writers ---
  const aiWrite = async (kind, target, btn) => {
    // Mid-flight: abort the running AI write.
    if (aiWriteAbort) { aiWriteAbort.abort(); return; }
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const prev = btn.textContent;
    aiWriteAbort = new AbortController();
    btn.textContent = "⏹ Dừng";
    btn.classList.add("btn-stop");
    try {
      const res = await api.aiGenHelper({ problemId: app.state.currentId, kind, mainCode: app.getEditorValue() }, { signal: aiWriteAbort.signal });
      target.value = res.code;
      save();
      app.toast(`AI đã viết ${kind === "generator" ? "generator" : "brute"}`, "ok");
    } catch (err) {
      if (err && err.aborted) {
        app.toast("Đã dừng AI viết.", "ok");
      } else {
        app.toast(err.message, "err");
        if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); }
      }
    } finally {
      aiWriteAbort = null;
      btn.textContent = prev;
      btn.classList.remove("btn-stop");
    }
  };
  $("#lab-ai-gen").addEventListener("click", (e) => aiWrite("generator", genEl, e.currentTarget));
  $("#lab-ai-brute").addEventListener("click", (e) => aiWrite("brute", bruteEl, e.currentTarget));

  // --- Stress run ---
  $("#lab-run-stress").addEventListener("click", async () => {
    if (!app.state.currentId) return;
    resultEl.innerHTML = `<div class="lab-running"><span class="spinner"></span> Đang biên dịch &amp; dò lỗi…</div>`;
    try {
      const res = await api.stress(app.state.currentId, {
        genCode: genEl.value, bruteCode: bruteEl.value, mainCode: app.getEditorValue(),
        iterations: Number($("#lab-iters").value), timeMs: Number($("#lab-time-s").value)
      });
      renderStress(res);
    } catch (err) { resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(err.message)}</div>`; }
  });

  function renderStress(res) {
    if (res.compilerMissing) { resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(res.error)}</div>`; return; }
    if (!res.ok) {
      resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(res.error || "Lỗi")}</div>` +
        (res.stderr ? `<pre class="lab-stderr">${escapeHtml(res.stderr.slice(0, 1500))}</pre>` : "");
      return;
    }
    if (!res.found) {
      resultEl.innerHTML = `<div class="lab-good">✅ Không tìm thấy phản ví dụ sau <b>${res.ran}</b> test${res.budgetHit ? " (hết thời gian)" : ""}. Code có vẻ ổn với generator này.</div>`;
      return;
    }
    const kindLabel = res.kind === "WA" ? "Sai đáp án (WA)" : res.kind;
    resultEl.innerHTML = `
      <div class="lab-bad">❌ Tìm thấy lỗi ở seed <b>${res.seed}</b> — ${escapeHtml(kindLabel)}</div>
      <div class="lab-cmp">
        <div><div class="lab-cmp-h">Input</div><pre class="lab-pre">${escapeHtml(res.input)}</pre></div>
        <div><div class="lab-cmp-h">Expected (brute)</div><pre class="lab-pre ok">${escapeHtml(res.expected || "(—)")}</pre></div>
        <div><div class="lab-cmp-h">Your output</div><pre class="lab-pre bad">${escapeHtml(res.got || "(—)")}</pre></div>
      </div>
      ${res.mainStderr ? `<pre class="lab-stderr">${escapeHtml(res.mainStderr.slice(0, 800))}</pre>` : ""}
      <button id="lab-save-fail" class="btn btn-primary btn-sm" type="button">💾 Lưu thành test case</button>`;
    const saveBtn = $("#lab-save-fail");
    if (saveBtn) saveBtn.addEventListener("click", async () => {
      try {
        await api.addTest(app.state.currentId, { name: `stress-fail-${res.seed}`, input: res.input, expected: res.expected || "", reason: "Phản ví dụ từ Stress Test", generatedBy: "ai" });
        app.toast("Đã lưu test", "ok");
        await app.reloadTests();
        saveBtn.disabled = true; saveBtn.textContent = "✓ Đã lưu";
      } catch (err) { app.toast(err.message, "err"); }
    });
  }

  // --- Profile run ---
  $("#lab-run-profile").addEventListener("click", async () => {
    if (!app.state.currentId) return;
    resultEl.innerHTML = `<div class="lab-running"><span class="spinner"></span> Đang đo runtime theo N…</div>`;
    const sizes = $("#lab-sizes").value.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
    try {
      const res = await api.profile(app.state.currentId, { genCode: genEl.value, mainCode: app.getEditorValue(), sizes, timeMs: Number($("#lab-time-p").value) });
      renderProfile(res);
    } catch (err) { resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(err.message)}</div>`; }
  });

  function renderProfile(res) {
    if (res.compilerMissing) { resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(res.error)}</div>`; return; }
    if (!res.ok) {
      resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(res.error || "Lỗi")}</div>` +
        (res.stderr ? `<pre class="lab-stderr">${escapeHtml(res.stderr.slice(0, 1500))}</pre>` : "");
      return;
    }
    const pts = res.points || [];
    const maxT = Math.max(1, ...pts.map((p) => p.timeMs));
    const bars = pts.map((p) => {
      const h = Math.max(3, Math.round((p.timeMs / maxT) * 120));
      const bad = p.status !== "OK";
      return `<div class="lab-bar-col">
        <div class="lab-bar-val">${bad ? p.status.replace("GEN_", "g:") : p.timeMs + "ms"}</div>
        <div class="lab-bar ${bad ? "bad" : ""}" style="height:${h}px"></div>
        <div class="lab-bar-n">${p.n >= 1000 ? (p.n / 1000) + "k" : p.n}</div>
      </div>`;
    }).join("");
    const est = res.estimate || {};
    resultEl.innerHTML = `
      <div class="lab-est">Ước lượng: <b>${escapeHtml(est.label || "?")}</b>${est.slope != null ? ` <span class="muted">(độ dốc ${est.slope})</span>` : ""}</div>
      <div class="lab-chart">${bars || '<span class="muted">Không có dữ liệu.</span>'}</div>
      <div class="lab-note muted">${escapeHtml(est.note || "")}</div>`;
  }

  // --- AI Dry-Run Debugger ---
  const drBtn = $("#lab-run-dryrun");
  const drBtnLabel = drBtn.textContent;
  drBtn.addEventListener("click", async () => {
    // Mid-flight: abort the running dry-run.
    if (dryRunAbort) { dryRunAbort.abort(); return; }

    const code = app.getEditorValue();
    if (!code || !code.trim()) { app.toast("Chưa có code để mô phỏng.", "err"); return; }
    const input = $("#lab-dr-input").value;
    if (!input || !input.trim()) { app.toast("Nhập Input mẫu trước.", "err"); return; }
    const vars = $("#lab-dr-vars").value;

    dryRunAbort = new AbortController();
    drBtn.textContent = "⏹ Dừng";
    drBtn.classList.add("btn-stop");
    resultEl.innerHTML = `<div class="lab-running"><span class="spinner"></span> AI đang mô phỏng chạy tay code…</div>`;

    try {
      const res = await api.aiDryRun({
        code,
        input,
        targetVariables: vars
      }, { signal: dryRunAbort.signal });

      const trace = res.trace || "(không có phản hồi)";
      resultEl.innerHTML = `<div class="dr-trace">${renderMarkdown(trace)}</div>`;
    } catch (err) {
      if (err && err.aborted) {
        resultEl.innerHTML = `<div class="muted" style="font-size:12px">⏹ Đã dừng mô phỏng.</div>`;
      } else {
        resultEl.innerHTML = `<div class="lab-bad">${escapeHtml(err.message)}</div>`;
        if (err.data && err.data.code === "NO_KEY") { close(); app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      dryRunAbort = null;
      drBtn.textContent = drBtnLabel;
      drBtn.classList.remove("btn-stop");
    }
  });

  trigger.addEventListener("click", () => {
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    try {
      genEl.value = localStorage.getItem(lsKey(app, "gen")) || "";
      bruteEl.value = localStorage.getItem(lsKey(app, "brute")) || "";
    } catch { /* ignore */ }
    resultEl.innerHTML = `<div class="muted" style="font-size:12px">Main = code hiện tại của bạn. Viết (hoặc để AI viết) generator${mode === "stress" ? " + brute" : ""}, rồi bấm chạy.</div>`;
    setMode(mode);
    modal.classList.remove("hidden");
  });
}
