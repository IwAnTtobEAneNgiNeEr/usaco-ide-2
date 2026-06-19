// command-palette.js — Ctrl+K launcher: fuzzy-search every problem and every
// app action (Vietnamese diacritic-insensitive), full keyboard navigation.
// Built as a .modal-overlay so the global Esc handler closes it for free.

import { escapeHtml } from "../md.js";

// Strip Vietnamese diacritics + lowercase, so "chm bai", "cham bai" and
// "chấm bài" all hit "Chấm bài".
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

// Subsequence fuzzy score: every char of `q` must appear in order in `hay`.
// Consecutive hits and word-start hits score higher; -1 = no match.
function fuzzyScore(q, hay) {
  if (!q) return 1;
  let score = 0, hi = 0, streak = 0;
  for (const ch of q) {
    let found = -1;
    for (let i = hi; i < hay.length; i++) {
      if (hay[i] === ch) { found = i; break; }
    }
    if (found < 0) return -1;
    streak = found === hi ? streak + 1 : 1;
    score += 2 + streak * 2 + (found === 0 || hay[found - 1] === " " || hay[found - 1] === "-" ? 6 : 0);
    hi = found + 1;
  }
  return score - Math.floor(hay.length / 8); // mild penalty for long targets
}

// Multi-token AND match across label+keywords.
function matchScore(query, target) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  let total = 0;
  for (const t of tokens) {
    const s = fuzzyScore(t, target);
    if (s < 0) return -1;
    total += s;
  }
  return total;
}

const VERDICT_ICON = { AC: "🟢", WA: "🔴", TLE: "🟡", RE: "🟠", CE: "🟣" };

function buildActions(app) {
  const click = (id) => () => document.getElementById(id)?.click();
  const has = () => Boolean(app.state.currentId);
  return [
    { icon: "🏠", label: "Về trang chủ Hành trình", kw: "home journey trang chu hanh trinh", kbd: "", run: () => app.goHome && app.goHome() },
    { icon: "＋", label: "Tạo bài mới", kw: "new problem tao bai moi them", kbd: "Ctrl·N", run: () => app.openMetaModal(null) },
    { icon: "▶", label: "Chạy code (Run)", kw: "run chay code thuc thi", kbd: "Ctrl·↵", when: has, run: () => app.runOne && app.runOne() },
    { icon: "⚖️", label: "Chấm bài (Judge all)", kw: "judge cham bai nop submit", kbd: "Ctrl·⇧·↵", when: has, run: () => app.judgeAll && app.judgeAll() },
    { icon: "💾", label: "Lưu code", kw: "save luu", kbd: "Ctrl·S", when: has, run: () => app.saveCodeNow && app.saveCodeNow() },
    { icon: "📝", label: "Xem đề bài (Problem view)", kw: "statement de bai problem view dan anh paste", kbd: "", when: has, run: () => app.setView("problem") },
    { icon: "‹/›", label: "Quay lại Code view", kw: "code editor viet", kbd: "", when: has, run: () => app.setView("code") },
    { icon: "🤖", label: "Hỏi AI Coach", kw: "coach chat ai hoi tro giup", kbd: "Ctrl·;", when: has, run: () => { app.setTab("coach"); app.focusCoachInput && app.focusCoachInput(); } },
    { icon: "🧪", label: "Mở Lab (Stress test + Big-O)", kw: "lab stress test complexity do phuc tap", kbd: "", when: has, run: click("btn-stress") },
    { icon: "🔍", label: "AI Review code", kw: "review soi code danh gia", kbd: "", when: has, run: click("btn-review") },
    { icon: "⚡", label: "Thư viện Snippets", kw: "snippets thu vien thuat toan mau template", kbd: "", when: has, run: click("btn-snippets") },
    { icon: "🧬", label: "Tạo test bằng AI", kw: "generate tests tao test ai sinh", kbd: "", when: has, run: () => { app.setTab("tests"); click("btn-ai-generate-tests")(); } },
    { icon: "🏆", label: "AI Contest Generator", kw: "contest cuoc thi giai dau", kbd: "", run: click("btn-contests") },
    { icon: "📊", label: "Thống kê & Ôn tập (Dashboard)", kw: "stats dashboard thong ke tien do on tap review queue", kbd: "", run: click("btn-dashboard") },
    { icon: "📕", label: "Sổ tay lỗi sai", kw: "mistakes so tay loi sai wa journal nhat ky", kbd: "", run: () => app.openMistakeBook && app.openMistakeBook() },
    { icon: "🎓", label: "Giải thích lời giải", kw: "defense giai thich loi giai van dap hieu bai explain", kbd: "", when: has, run: () => app.openDefense && app.openDefense() },
    { icon: "📂", label: "Mở thư mục trong VS Code", kw: "vscode folder thu muc mo", kbd: "", when: has, run: click("btn-open-folder") },
    { icon: "📋", label: "Copy toàn bộ code", kw: "copy sao chep", kbd: "", when: has, run: click("btn-copy") },
    { icon: "🧘", label: "Bật/tắt Zen Focus", kw: "zen focus tap trung", kbd: "Alt·Z", run: () => app.toggleZenMode() },
    { icon: "🕐", label: "Tab Run console", kw: "run console stdin tab", kbd: "", when: has, run: () => app.setTab("run") },
    { icon: "✅", label: "Tab Tests", kw: "tests tab kiem thu", kbd: "", when: has, run: () => app.setTab("tests") },
    { icon: "🗒️", label: "Tab Notes", kw: "notes ghi chu tab", kbd: "", when: has, run: () => app.setTab("notes") },
    { icon: "🕑", label: "Tab History", kw: "history lich su tab", kbd: "", when: has, run: () => app.setTab("history") },
    { icon: "⚙️", label: "Tab Settings", kw: "settings cai dat cau hinh api key tab", kbd: "", run: () => app.setTab("settings") },
    { icon: "📖", label: "Hướng dẫn sử dụng", kw: "guide huong dan help", kbd: "", run: click("btn-guide") },
    { icon: "⌨️", label: "Bảng phím tắt", kw: "shortcuts phim tat", kbd: "?", run: () => document.getElementById("shortcuts-modal")?.classList.remove("hidden") }
  ];
}

export function initCommandPalette(app) {
  const overlay = document.createElement("div");
  overlay.id = "cmdk-overlay";
  overlay.className = "modal-overlay cmdk-overlay hidden";
  overlay.innerHTML = `
    <div class="cmdk">
      <div class="cmdk-input-row">
        <span class="cmdk-glyph">⌘</span>
        <input id="cmdk-input" class="cmdk-input" type="text" spellcheck="false" autocomplete="off"
          placeholder="Gõ để tìm bài hoặc lệnh…  (vd: cham bai, dp, contest)" />
      </div>
      <div id="cmdk-list" class="cmdk-list"></div>
      <footer class="cmdk-foot">
        <span><kbd>↑↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Esc</kbd> đóng</span>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#cmdk-input");
  const list = overlay.querySelector("#cmdk-list");
  let items = [];   // current result objects {icon,label,sub,kbd,run}
  let active = 0;

  function close() { overlay.classList.add("hidden"); }
  function open() {
    overlay.classList.remove("hidden");
    input.value = "";
    compute("");
    setTimeout(() => input.focus(), 20);
  }

  function compute(query) {
    const actions = buildActions(app)
      .filter((a) => !a.when || a.when())
      .map((a) => ({ ...a, kind: "action", target: norm(a.label + " " + a.kw) }));
    const problems = (app.state.problems || []).map((p) => ({
      kind: "problem",
      icon: VERDICT_ICON[p.lastVerdict] || (p.status === "solved" ? "🟢" : "⚪"),
      label: p.title,
      sub: [p.topic, p.source, p.difficulty !== "unrated" ? p.difficulty : ""].filter(Boolean).join(" · "),
      kbd: "",
      target: norm([p.title, p.topic, p.source, (p.tags || []).join(" ")].join(" ")),
      run: () => app.selectProblem(p.id)
    }));

    if (!query.trim()) {
      // Default view: recent problems first (list is already updatedAt-desc),
      // then the context-relevant actions.
      items = [...problems.slice(0, 5), ...actions];
    } else {
      const scored = [];
      for (const it of [...actions, ...problems]) {
        const s = matchScore(query, it.target);
        if (s >= 0) scored.push([s + (it.kind === "problem" ? 1 : 0), it]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      items = scored.map(([, it]) => it);
    }
    items = items.slice(0, 14);
    active = 0;
    paint();
  }

  function paint() {
    if (!items.length) {
      list.innerHTML = `<div class="cmdk-empty">Không có kết quả — thử từ khóa khác?</div>`;
      return;
    }
    let lastKind = null;
    list.innerHTML = items.map((it, i) => {
      const head = it.kind !== lastKind
        ? `<div class="cmdk-section">${it.kind === "problem" ? "Bài tập" : "Lệnh"}</div>` : "";
      lastKind = it.kind;
      return head + `
        <button class="cmdk-item ${i === active ? "active" : ""}" data-i="${i}">
          <span class="cmdk-icon">${it.icon}</span>
          <span class="cmdk-label">${escapeHtml(it.label)}${it.sub ? `<span class="cmdk-sub">${escapeHtml(it.sub)}</span>` : ""}</span>
          ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ""}
        </button>`;
    }).join("");
    const el = list.querySelector(".cmdk-item.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function runActive() {
    const it = items[active];
    if (!it) return;
    close();
    try { it.run(); } catch (err) { app.toast(err.message, "err"); }
  }

  input.addEventListener("input", () => compute(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); runActive(); }
  });
  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".cmdk-item");
    if (!btn) return;
    active = Number(btn.dataset.i);
    runActive();
  });
  list.addEventListener("mousemove", (e) => {
    const btn = e.target.closest(".cmdk-item");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (i !== active) { active = i; paint(); }
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // Ctrl+K (and Ctrl+P) anywhere — including inside the editor.
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "k" || (k === "p" && !e.shiftKey)) {
      e.preventDefault();
      if (overlay.classList.contains("hidden")) open(); else close();
    }
  }, true);

  // Topbar trigger, placed next to the Journey chips.
  const chips = document.querySelector(".jh-chips");
  const btn = document.createElement("button");
  btn.id = "btn-cmdk";
  btn.className = "btn btn-ghost btn-sm";
  btn.title = "Bảng lệnh nhanh (Ctrl+K)";
  btn.innerHTML = `🔎 Lệnh <kbd>Ctrl·K</kbd>`;
  if (chips && chips.parentNode) chips.parentNode.insertBefore(btn, chips.nextSibling);
  btn.addEventListener("click", open);

  app.openCommandPalette = open;
}
