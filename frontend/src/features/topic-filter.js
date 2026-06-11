// features/topic-filter.js — multi-select topic filter for the Problem Explorer.
// Matches a problem's `topic` + `tags` (normalized) against the selected topics.
// Selection persists in localStorage. Pairs with the `topics` filter handled in
// problems.js (normTopic + matchesFilters).

import { renderProblems, normTopic } from "../problems.js";
import { escapeHtml } from "../md.js";

const KEY = "usaco.filters.topics";

const PRESET = [
  "Arrays", "Sorting", "Greedy", "DP", "Graph", "Tree", "Math",
  "Binary Search", "Two Pointers", "Prefix Sum", "Strings", "Hashing",
  "Number Theory", "Geometry", "Bitmask", "DSU", "Stack", "Queue",
  "Recursion", "Backtracking", "Sliding Window", "Simulation"
];

export function initTopicFilter(app) {
  const host = document.querySelector(".explorer-filters");
  if (!host) return;

  // Restore persisted selection into shared filter state.
  let selected = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(saved)) selected = new Set(saved.map(normTopic).filter(Boolean));
  } catch { /* ignore */ }
  app.state.filters.topics = [...selected];

  const wrap = document.createElement("div");
  wrap.className = "topic-filter";
  wrap.innerHTML = `
    <button type="button" class="tf-toggle" id="tf-toggle">
      <span>Topics</span><span class="tf-count" id="tf-count"></span><span class="tf-caret">▾</span>
    </button>
    <div class="tf-panel hidden" id="tf-panel">
      <input type="search" class="input tf-search" id="tf-search" placeholder="Tìm topic…" autocomplete="off" />
      <div class="tf-chips" id="tf-chips"></div>
      <div class="tf-foot"><button type="button" class="tf-clear" id="tf-clear">Bỏ chọn tất cả</button></div>
    </div>`;
  host.appendChild(wrap);

  const $ = (id) => wrap.querySelector("#" + id);
  const panel = $("tf-panel"), chipsBox = $("tf-chips"), search = $("tf-search"), countEl = $("tf-count");

  // Union of preset topics and whatever already exists on problems (topic + tags).
  const dynamicTopics = () => {
    const map = new Map();
    PRESET.forEach((t) => map.set(normTopic(t), t));
    (app.state.problems || []).forEach((p) => {
      [p.topic, ...(p.tags || [])].filter(Boolean).forEach((t) => {
        const k = normTopic(t);
        if (k && !map.has(k)) map.set(k, String(t));
      });
    });
    return [...map.entries()]; // [normKey, label]
  };

  const sync = () => {
    app.state.filters.topics = [...selected];
    try { localStorage.setItem(KEY, JSON.stringify([...selected])); } catch { /* ignore */ }
    countEl.textContent = selected.size ? String(selected.size) : "";
    countEl.classList.toggle("on", selected.size > 0);
    renderProblems(app);
  };

  const renderChips = () => {
    const q = normTopic(search.value);
    const items = dynamicTopics().filter(([k]) => !q || k.includes(q));
    chipsBox.innerHTML = items.map(([k, label]) =>
      `<button type="button" class="tf-chip ${selected.has(k) ? "on" : ""}" data-k="${escapeHtml(k)}">${escapeHtml(label)}</button>`
    ).join("") || `<span class="tf-empty">Không có topic</span>`;
  };

  $("tf-toggle").addEventListener("click", () => {
    const open = panel.classList.toggle("hidden") === false;
    if (open) { renderChips(); search.focus(); }
  });
  search.addEventListener("input", renderChips);
  chipsBox.addEventListener("click", (e) => {
    const chip = e.target.closest(".tf-chip");
    if (!chip) return;
    const k = chip.dataset.k;
    if (selected.has(k)) selected.delete(k); else selected.add(k);
    chip.classList.toggle("on");
    sync();
  });
  $("tf-clear").addEventListener("click", () => { selected.clear(); renderChips(); sync(); });

  // Close panel on outside click.
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target) && !panel.classList.contains("hidden")) panel.classList.add("hidden");
  });

  countEl.textContent = selected.size ? String(selected.size) : "";
  countEl.classList.toggle("on", selected.size > 0);
}
