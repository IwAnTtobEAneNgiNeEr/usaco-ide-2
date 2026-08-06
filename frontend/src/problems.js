// problems.js — left Problem Explorer: search, filter, list, create, duplicate, delete.
//
// Problem Explorer only contains competitive-practice problems. Text search
// goes through the real GET /api/problems/search and shows the server's own
// "Vì sao khớp"; when that route isn't shipped yet the list falls back to local
// filtering with locally computed (and locally worded) match reasons.

import { api } from "./api.js";
import { escapeHtml } from "./md.js";
import {
  normTopic, trackOf, matchesFilters, searchQueryString, applyLocalFilters,
  normalizeSearchResults, localReasons, displayTitle,
} from "./core/search-model.js";

// topic-filter.js imports these from here — keep the re-export stable.
export { normTopic, trackOf };

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

// ---- Artifact-contract compatibility reads (additive fields, old data OK) ----
// provider/collection/origin/activityKind/derivedFrom/derivedStatus come from
// the Verified Artifact contract. Old folders only have free-text `source`; we
// display what exists and never invent values for missing fields.
const ORIGIN_LABELS = {
  imported: "nhập ngoài", ocr: "OCR", "user-authored": "tự viết",
  "ai-generated": "AI tạo", derived: "dẫn xuất",
};
const DIFF_LABELS = { easy: "Dễ", medium: "Vừa", hard: "Khó" };

// derivedStatus is a projection from Judge history (docs/VERIFIED-ARTIFACT-API.md).
// "unverified" is the default state of every old folder — showing it on each
// row would be noise, so only the informative states get a chip.
const DERIVED_STATUS_LABELS = {
  verified: { text: "đã xác minh", cls: "ok" },
  "in-progress": { text: "đang làm", cls: "info" },
  "needs-work": { text: "cần sửa", cls: "warn" },
  "historically-accepted": { text: "AC cũ", cls: "info" },
  stale: { text: "code đổi sau AC", cls: "warn" },
};

// Rating thật (analysis/cfRating) → số; không có → nhãn độ khó; không cả hai
// → "Chưa xếp". Không bịa số từ chữ.
export function ratingLabel(p) {
  const r = Number(p.rating || p.cfRating || (p.analysis && p.analysis.cfRating));
  if (Number.isFinite(r) && r > 0) return { text: String(r), kind: "elo" };
  const d = DIFF_LABELS[p.difficulty];
  return d ? { text: d, kind: "diff" } : { text: "Chưa xếp", kind: "unrated" };
}

// ---- server search state (module-local; renderProblems stays synchronous) ----
// sig = the query-string of the last request; items = normalized results for
// that sig; unavailable = the route 404'd (backend not merged) → local-only
// for the rest of the session.
const serverSearch = { sig: null, items: null, pending: false, unavailable: false };
let searchDebounce = null;

function kickServerSearch(app) {
  const { filters } = app.state;
  if (serverSearch.unavailable || !filters.search) return;
  const sig = searchQueryString(filters);
  if (sig === serverSearch.sig || serverSearch.pending) return;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    serverSearch.pending = true;
    try {
      const raw = await api.searchProblems(sig);
      const items = normalizeSearchResults(raw);
      serverSearch.sig = sig;
      serverSearch.items = items; // null = malformed → local fallback for this sig
    } catch (err) {
      if (err && err.status === 404) serverSearch.unavailable = true;
      serverSearch.sig = sig;
      serverSearch.items = null;
    } finally {
      serverSearch.pending = false;
      // Only repaint if this answer is still for the query on screen.
      if (searchQueryString(app.state.filters) === serverSearch.sig) renderProblems(app);
    }
  }, 220);
}

// The rows to show + where their "Vì sao khớp" comes from.
function visibleRows(app) {
  const { problems, filters } = app.state;
  const sig = searchQueryString(filters);
  if (filters.search && !serverSearch.unavailable) kickServerSearch(app);

  if (filters.search && serverSearch.sig === sig && Array.isArray(serverSearch.items)) {
    // Server-ranked catalog results are merged over the local problem summary.
    // projection fields the search payload omits still render; hướng/nguồn/
    // độ khó/topics stay local filters on top (server track ≠ Library track).
    const byId = new Map(problems.map((p) => [p.id, p]));
    const merged = serverSearch.items
      .filter((r) => r.activityKind === "competitive-problem")
      .map((r) => ({ ...(byId.get(r.id) || {}), ...r, __reasons: r.reasons, __serverMatch: true }))
      .filter((r) => r.id);
    return applyLocalFilters(merged, filters);
  }
  return problems
    .filter((p) => matchesFilters(p, filters))
    .map((p) => ({ ...p, __reasons: localReasons(p, filters), __serverMatch: false }));
}

export function renderProblems(app) {
  const { problems, filters, currentId } = app.state;
  const list = app.el.problemList;
  const visible = visibleRows(app);

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
  const searchTag = filters.search
    ? (serverSearch.unavailable || !visible.some((v) => v.__serverMatch) ? " · tìm cục bộ" : " · tìm qua server")
    : "";
  app.el.problemCount.textContent = problems.length
    ? `${visible.length}/${problems.length} · ✓ ${solved} đã giải${searchTag}`
    : "0 problems";

  if (visible.length === 0) {
    const emptyMsg = problems.length === 0
      ? "Chưa có bài nào. Bấm <b>+ Bài mới</b>."
      : "Không có kết quả.";
    list.innerHTML = `<div style="padding:20px 12px;color:var(--text-dim);font-size:12px;text-align:center">${emptyMsg}</div>`;
    return;
  }

  list.innerHTML = visible.map((p) => {
    const v = p.lastVerdict ? `<span class="vbadge v-${escapeHtml(p.lastVerdict)}">${escapeHtml(p.lastVerdict)}</span>` : "";
    // `provider` / `collection` are internal catalog metadata. Only the
    // learner-facing source is allowed in the practice sidebar.
    const srcLabel = p.source || "";
    const originLabel = ORIGIN_LABELS[p.origin] || "";
    // p.derivedFrom is the only real "this artifact was derived" signal.
    const derived = p.derivedFrom || p.origin === "derived";
    const derivedStatus = DERIVED_STATUS_LABELS[p.derivedStatus] || null;
    const rating = ratingLabel(p);
    const parts = [
      srcLabel && `<span class="p-src">${escapeHtml(srcLabel)}</span>`,
      p.concept && `<span class="p-concept">${escapeHtml(p.concept)}</span>`,
      !p.concept && p.topic && `<span>${escapeHtml(p.topic)}</span>`,
      originLabel && `<span class="p-origin">${escapeHtml(originLabel)}</span>`,
      derived && `<span class="p-derived" title="Phát triển từ một artifact gốc">⑂ dẫn xuất</span>`,
      derivedStatus && `<span class="p-dstatus p-dstatus-${escapeHtml(derivedStatus.cls)}" title="Trạng thái xác minh (từ lịch sử Judge)">${escapeHtml(derivedStatus.text)}</span>`,
      `<span class="p-rating p-rating-${rating.kind}">${escapeHtml(rating.text)}</span>`,
      `<span>${relTime(p.updatedAt)}</span>`,
    ].filter(Boolean);
    const reasons = (p.__reasons || []).length
      ? `<div class="p-why" title="${p.__serverMatch ? "Lý do khớp từ server tìm kiếm" : "Khớp cục bộ trên máy"}">Vì sao khớp: ${p.__reasons.map((r) => escapeHtml(r)).join(" · ")}</div>`
      : "";
    return `
      <div class="p-item ${p.id === currentId ? "active" : ""}" data-id="${escapeHtml(p.id)}">
        <div class="p-row">
          <span class="p-title">${escapeHtml(displayTitle(p))}</span>
          ${v}
        </div>
        <div class="p-sub">${parts.join(' <span class="p-dot"></span> ') || "<span style='color:var(--text-dim)'>no source</span>"}</div>
        ${reasons}
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
      app.refreshJourney?.({ quiet: true });
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

  el.problemList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest("[data-id]");
    if (!item) return;
    e.preventDefault();
    item.click();
  });
}
