// problems.js — left Problem Explorer: search, filter, list, create, duplicate, delete.

import { api } from "./api.js";
import { escapeHtml } from "./md.js";
function relTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
// Normalize a topic/tag for tolerant matching: "Binary Search" / "binary_search" -> "binarysearch".
export function normTopic(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchesFilters(p, f) {
  if (f.source && p.source !== f.source) return false;
  if (f.status && p.status !== f.status) return false;
  if (f.difficulty && p.difficulty !== f.difficulty) return false;
  if (f.topics && f.topics.length) {
    const hay = new Set([p.topic, ...(p.tags || [])].filter(Boolean).map(normTopic));
    if (!f.topics.some((t) => hay.has(t))) return false;
  }
  if (f.search) {
    const hay = `${p.title} ${p.topic} ${p.source} ${(p.tags || []).join(" ")}`.toLowerCase();
    if (!hay.includes(f.search.toLowerCase())) return false;
  }
  return true;
}

export function renderProblems(app) {
  const { problems, filters, currentId } = app.state;
  const list = app.el.problemList;
  const visible = problems.filter((p) => matchesFilters(p, filters));

  // Populate source filter + datalist from existing problems.
  const sources = [...new Set(problems.map((p) => p.source).filter(Boolean))].sort();
  const sourceSel = app.el.filterSource;
  if (sourceSel.dataset.sig !== sources.join("|")) {
    sourceSel.dataset.sig = sources.join("|");
    const cur = sourceSel.value;
    sourceSel.innerHTML = `<option value="">Tất cả nguồn</option>` +
      sources.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    sourceSel.value = cur;
    app.el.sourceSuggest.innerHTML = sources.map((s) => `<option value="${escapeHtml(s)}">`).join("");
  }

  const solved = problems.filter((p) => p.status === "solved" || p.lastVerdict === "AC").length;
  app.el.problemCount.textContent = problems.length
    ? `${visible.length}/${problems.length} · ✓ ${solved} đã giải`
    : "0 problems";

  if (visible.length === 0) {
    list.innerHTML = `<div style="padding:20px 12px;color:var(--text-2);font-size:12px;text-align:center">${
      problems.length === 0 ? "Chưa có bài nào. Bấm <b>+ Bài mới</b>." : "Không có kết quả."
    }</div>`;
    return;
  }

  list.innerHTML = visible.map((p) => {
    const v = p.lastVerdict ? `<span class="vbadge v-${escapeHtml(p.lastVerdict)}">${escapeHtml(p.lastVerdict)}</span>` : "";
    const sub = [p.source, p.topic].filter(Boolean).map(escapeHtml).join(' <span class="p-dot"></span> ');
    return `
      <div class="p-item ${p.id === currentId ? "active" : ""}" data-id="${escapeHtml(p.id)}">
        <div class="p-row">
          <span class="p-title">${escapeHtml(p.title)}</span>
          ${v}
        </div>
        <div class="p-sub">${sub || "<span style='color:var(--text-2)'>no source</span>"}
          <span class="p-dot"></span><span>${relTime(p.updatedAt)}</span>
        </div>
        <div class="p-actions">
          <button class="icon-btn dup" data-act="dup" title="Duplicate">⧉</button>
          <button class="icon-btn" data-act="del" title="Delete">✕</button>
        </div>
      </div>`;
  }).join("");
}

export function initProblems(app) {
  const { el } = app;

  // Search + filters
  el.search.addEventListener("input", () => {
    app.state.filters.search = el.search.value.trim();
    renderProblems(app);
  });
  el.filterSource.addEventListener("change", () => { app.state.filters.source = el.filterSource.value; renderProblems(app); });
  el.filterStatus.addEventListener("change", () => { app.state.filters.status = el.filterStatus.value; renderProblems(app); });
  el.filterDifficulty.addEventListener("change", () => { app.state.filters.difficulty = el.filterDifficulty.value; renderProblems(app); });

  // New problem (two entry points)
  el.btnNew.addEventListener("click", () => app.openMetaModal(null));
  el.btnNew2.addEventListener("click", () => app.openMetaModal(null));

  // Random-problem picker for grind sessions: prefer something not yet solved
  // (and not the current problem); fall back to any other problem for re-practice.
  app.openRandomProblem = () => {
    const all = app.state.problems || [];
    if (!all.length) { app.toast("Chưa có bài nào — bấm + New.", "err"); return; }
    const notCurrent = (p) => p.id !== app.state.currentId;
    const unsolved = all.filter((p) => notCurrent(p) && p.status !== "solved" && p.lastVerdict !== "AC");
    const pool = unsolved.length ? unsolved : all.filter(notCurrent);
    const final = pool.length ? pool : all;
    const pick = final[Math.floor(Math.random() * final.length)];
    if (pick) {
      app.selectProblem(pick.id);
      app.toast(unsolved.length ? "🎲 Bài chưa giải" : "🎲 Luyện lại", "ok");
    }
  };
  const btnRandom = document.getElementById("btn-random");
  if (btnRandom) btnRandom.addEventListener("click", () => app.openRandomProblem());

  // List interactions (delegated)
  el.problemList.addEventListener("click", async (e) => {
    const item = e.target.closest(".p-item");
    if (!item) return;
    const id = item.dataset.id;
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
      e.stopPropagation();
      const act = actBtn.dataset.act;
      if (act === "dup") {
        try {
          const { problem } = await api.duplicateProblem(id);
          app.toast(`Duplicated → ${problem.title}`, "ok");
          await app.refreshProblems();
          app.selectProblem(problem.id);
        } catch (err) { app.toast(err.message, "err"); }
      } else if (act === "del") {
        const p = app.state.problems.find((x) => x.id === id);
        if (!confirm(`Delete "${p ? p.title : id}"? This removes its folder and all files.`)) return;
        try {
          await api.deleteProblem(id);
          app.toast("Deleted", "ok");
          if (app.state.currentId === id) app.state.currentId = null;
          await app.refreshProblems();
          if (app.state.currentId === null) {
            const next = app.state.problems[0];
            if (next) app.selectProblem(next.id); else app.clearEditor();
          }
        } catch (err) { app.toast(err.message, "err"); }
      }
      return;
    }
    app.selectProblem(id);
  });
}
