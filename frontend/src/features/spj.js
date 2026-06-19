// spj.js — Special Judge (checker.cpp) editor.
//
// Adds a "⚖️ Checker" button to the Tests toolbar. For problems with several
// valid answers, the judge compiles checker.cpp and calls it per test with
// argv = <input> <expected> <actual>; exit 0 = AC. This modal is where the
// checker is written; enabling SPJ on a problem scaffolds a working
// token-compare starter server-side.

import { api } from "../api.js";

function buildModal() {
  const overlay = document.createElement("div");
  overlay.id = "spj-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide">
      <h2 class="modal-title">⚖️ Special judge · checker.cpp</h2>
      <p class="panel-hint">
        Checker được biên dịch một lần mỗi lượt chấm và gọi với
        <code>argv = input, expected, actual</code> — <b>exit 0 = AC</b>, khác 0 = WA.
        Mọi thứ checker in ra sẽ hiển thị cạnh kết quả test.
      </p>
      <textarea id="spj-code" class="io-edit io-edit-tall" spellcheck="false"
        style="font-family: var(--mono); min-height: 320px;"></textarea>
      <div class="modal-actions">
        <button type="button" id="spj-cancel" class="btn btn-ghost">Đóng</button>
        <button type="button" id="spj-save" class="btn btn-primary">Save checker</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
  return overlay;
}

export function initSpj(app) {
  const toolbar = document.querySelector(".tests-toolbar");
  if (!toolbar) return;

  const btn = document.createElement("button");
  btn.id = "btn-spj";
  btn.className = "btn btn-ghost btn-sm";
  btn.type = "button";
  btn.title = "Special judge — chấm bằng checker.cpp (bài nhiều đáp án đúng)";
  btn.textContent = "⚖️ Checker";
  toolbar.appendChild(btn);

  let overlay = null;

  btn.addEventListener("click", async () => {
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const meta = app.state.meta || {};
    if (!meta.usesChecker) {
      if (!confirm("Bài này chưa bật Special Judge. Bật SPJ và tạo checker.cpp mẫu?")) return;
      try {
        const { problem } = await api.updateProblem(app.state.currentId, { usesChecker: true });
        app.state.meta = problem;
        await app.syncMeta();
      } catch (err) { app.toast(err.message, "err"); return; }
    }
    if (!overlay) overlay = buildModal();
    const ta = overlay.querySelector("#spj-code");
    ta.value = "// Đang tải checker.cpp…";
    overlay.classList.remove("hidden");
    try {
      const { checker } = await api.getChecker(app.state.currentId);
      ta.value = checker || "";
      ta.focus();
    } catch (err) {
      ta.value = "";
      app.toast(err.message, "err");
    }
  });

  document.addEventListener("click", async (e) => {
    if (!overlay) return;
    if (e.target && e.target.id === "spj-cancel") overlay.classList.add("hidden");
    if (e.target && e.target.id === "spj-save") {
      if (!app.state.currentId) return;
      const saveBtn = e.target;
      saveBtn.disabled = true;
      try {
        await api.saveChecker(app.state.currentId, overlay.querySelector("#spj-code").value);
        app.toast("Đã lưu checker.cpp", "ok");
        overlay.classList.add("hidden");
      } catch (err) {
        app.toast(err.message, "err");
      } finally {
        saveBtn.disabled = false;
      }
    }
  });
}
