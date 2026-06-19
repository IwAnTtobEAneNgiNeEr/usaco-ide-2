// welcome.js — first-run welcome / setup card. Shows ONCE (a localStorage flag),
// explains the app in one screen, and live-checks the two things a new user
// needs: a working g++ compiler and (optionally) an AI API key. Everything here
// is best-effort — a failed probe never blocks the app.

import { api } from "../api.js";

const FLAG = "usaco2.welcomed";

function setCheck(el, ico, title, msg, cls) {
  if (!el) return;
  const icoEl = el.querySelector(".welcome-check-ico");
  const msgEl = el.querySelector(".welcome-check-msg");
  if (icoEl) icoEl.textContent = ico;
  if (msgEl) { msgEl.textContent = msg; msgEl.className = "welcome-check-msg " + (cls || "muted"); }
  el.title = title || "";
}

export function initWelcome(app) {
  let seen = false;
  try { seen = localStorage.getItem(FLAG) === "1"; } catch { /* private mode → always show */ }
  if (seen) return;

  const modal = document.getElementById("welcome-modal");
  if (!modal) return;
  const dontShow = modal.querySelector("#welcome-dont-show");

  const dismiss = () => {
    modal.classList.add("hidden");
    if (!dontShow || dontShow.checked) {
      try { localStorage.setItem(FLAG, "1"); } catch { /* ignore */ }
    }
  };

  modal.querySelector("#welcome-start")?.addEventListener("click", dismiss);
  modal.querySelector("#welcome-settings")?.addEventListener("click", () => {
    dismiss();
    app.setTab("settings");
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) dismiss(); });

  modal.classList.remove("hidden");

  // --- live setup checks (don't block showing the modal) ---
  api.health()
    .then((h) => {
      const c = h && h.compiler;
      if (c && c.available) {
        setCheck(document.getElementById("welcome-gpp"), "✅", c.version || "",
          "Sẵn sàng — bạn có thể Run / Judge ngay.", "ok");
      } else {
        setCheck(document.getElementById("welcome-gpp"), "⚠️", "",
          "Chưa tìm thấy g++. Cài MinGW/GCC rồi đặt đường dẫn trong Settings → Compiler.", "warn");
      }
    })
    .catch(() => setCheck(document.getElementById("welcome-gpp"), "⚠️", "",
      "Không kiểm tra được compiler — mở Settings để cấu hình.", "warn"));

  api.getAiSettings()
    .then((r) => {
      const ai = (r && r.ai) || r || {};
      if (ai.hasKey) {
        setCheck(document.getElementById("welcome-ai"), "✅", "",
          "Đã có key — các tính năng AI (Coach, tạo test, OCR cleanup…) đã bật.", "ok");
      } else {
        setCheck(document.getElementById("welcome-ai"), "🔑", "",
          "Chưa có key (không bắt buộc). Thêm trong Settings → AI để bật trợ lý AI.", "muted");
      }
    })
    .catch(() => { /* leave the default optional-key message */ });
}
