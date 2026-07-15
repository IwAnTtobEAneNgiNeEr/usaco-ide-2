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

// ---- Artifact-contract compatibility reads (additive fields, old data OK) ----
// provider/collection/origin/activityKind/derivedFrom come from the Verified
// Artifact contract. Old folders only have free-text `source`; we display what
// exists and never invent values for missing fields.
const ORIGIN_LABELS = {
  imported: "nhập ngoài", ocr: "OCR", "user-authored": "tự viết",
  "ai-generated": "AI tạo", derived: "dẫn xuất",
};
const DIFF_LABELS = { easy: "Dễ", medium: "Vừa", hard: "Khó" };

// Hai hướng công việc: mọi bài cũ là competitive-problem (đúng bản chất data),
// chỉ algorithm-module thuộc hướng "Thuật toán & ứng dụng".
export function trackOf(p) {
  return p && p.activityKind === "algorithm-module" ? "build" : "compete";
}

// Rating thật (analysis/cfRating) → số; không có → nhãn độ khó; không cả hai
// → "Chưa xếp". Không bịa số từ chữ.
export function ratingLabel(p) {
  const r = Number(p.rating || p.cfRating || (p.analysis && p.analysis.cfRating));
  if (Number.isFinite(r) && r > 0) return { text: String(r), kind: "elo" };
  const d = DIFF_LABELS[p.difficulty];
  return d ? { text: d, kind: "diff" } : { text: "Chưa xếp", kind: "unrated" };
}

function matchesFilters(p, f) {
  if (f.track && trackOf(p) !== f.track) return false;
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
    const emptyMsg = problems.length === 0
      ? "Chưa có bài nào. Bấm <b>+ Bài mới</b>."
      : (filters.track === "build"
        ? "Chưa có module nào. Module thuật toán được phát triển từ một bài đã AC (nút <b>Phát triển thành module</b> sau khi AC)."
        : "Không có kết quả.");
    list.innerHTML = `<div style="padding:20px 12px;color:var(--text-dim);font-size:12px;text-align:center">${emptyMsg}</div>`;
    return;
  }

  list.innerHTML = visible.map((p) => {
    const v = p.lastVerdict ? `<span class="vbadge v-${escapeHtml(p.lastVerdict)}">${escapeHtml(p.lastVerdict)}</span>` : "";
    // Nguồn: field mới provider·collection nếu có, fallback source cũ.
    const srcLabel = [p.provider, p.collection].filter(Boolean).join(" · ") || p.source || "";
    const originLabel = ORIGIN_LABELS[p.origin] || "";
    const isModule = trackOf(p) === "build";
    // p.derivedFrom is the only real "this artifact was derived" signal
    // (docs/VERIFIED-ARTIFACT-API.md §Derived GridPathfinder). Whether a
    // *derived module exists for* this problem is a per-problem GET
    // (/:id/derived) — too expensive to fan out across a 163-row list, so
    // it's surfaced inside the problem itself (AC card), not here.
    const derived = p.derivedFrom || p.origin === "derived";
    const rating = ratingLabel(p);
    const parts = [
      srcLabel && `<span class="p-src">${escapeHtml(srcLabel)}</span>`,
      p.topic && `<span>${escapeHtml(p.topic)}</span>`,
      originLabel && `<span class="p-origin">${escapeHtml(originLabel)}</span>`,
      derived && `<span class="p-derived" title="Phát triển từ một artifact gốc">⑂ dẫn xuất</span>`,
      `<span class="p-rating p-rating-${rating.kind}">${escapeHtml(rating.text)}</span>`,
      `<span>${relTime(p.updatedAt)}</span>`,
    ].filter(Boolean);
    return `
      <div class="p-item ${p.id === currentId ? "active" : ""}" data-id="${escapeHtml(p.id)}">
        <div class="p-row">
          <span class="p-title">${escapeHtml(p.title)}</span>
          ${isModule ? '<span class="p-kind" title="Module thuật toán & ứng dụng">Module</span>' : ""}
          ${v}
        </div>
        <div class="p-sub">${parts.join(' <span class="p-dot"></span> ') || "<span style='color:var(--text-dim)'>no source</span>"}</div>
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

  // Hai hướng công việc (Luyện thi / Thuật toán & ứng dụng) — một list, một
  // filter; không phải library thứ hai. Search/filter khác vẫn chạy độc lập.
  const trackRow = document.getElementById("track-row");
  if (trackRow) {
    trackRow.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-track]");
      if (!btn) return;
      app.state.filters.track = btn.dataset.track || "";
      trackRow.querySelectorAll(".track-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderProblems(app);
    });
  }

  // New problem (two entry points)
  el.btnNew.addEventListener("click", () => app.openMetaModal(null));
  el.btnNew2.addEventListener("click", () => app.openMetaModal(null));

  // "Bài phù hợp" creates a fresh problem from the 5–10 most recent topics
  // and the current Arena Elo. It never falls back to an unreasoned random pick.
  let personalizedAbort = null;
  app.openRandomProblem = async () => {
    if (personalizedAbort) { personalizedAbort.abort(); return; }
    if (!(app.state.problems || []).length) {
      app.toast("Cần làm ít nhất một bài trước khi tạo bài phù hợp.", "err");
      return;
    }
    const button = document.getElementById("btn-random");
    const previous = button ? button.textContent : "";
    personalizedAbort = new AbortController();
    if (button) { button.textContent = "Dừng tạo bài"; button.classList.add("btn-stop"); }
    document.dispatchEvent(new CustomEvent("personalized:state", { detail: { state: "loading" } }));
    try {
      const result = await api.personalizedProblem(8, { signal: personalizedAbort.signal });
      await app.refreshProblems();
      await app.selectProblem(result.problem.id);
      const why = result.rationale || {};
      app.toast(`Bài mới · ${why.topic || "chủ đề gần đây"} · ~${why.generatedRating || why.targetRating || "?"} Elo`, "ok");
      document.dispatchEvent(new CustomEvent("personalized:state", { detail: { state: "done", rationale: why } }));
    } catch (error) {
      if (error && error.aborted) {
        app.toast("Đã dừng tạo bài phù hợp.", "ok");
      } else {
        app.toast(error.message || "Không tạo được bài phù hợp.", "err");
        document.dispatchEvent(new CustomEvent("personalized:state", { detail: { state: "error", message: error.message } }));
        if (error.data && error.data.code === "NO_KEY") app.setTab("settings");
      }
    } finally {
      personalizedAbort = null;
      if (button) { button.textContent = previous || "Bài phù hợp"; button.classList.remove("btn-stop"); }
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
