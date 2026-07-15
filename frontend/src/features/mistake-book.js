// mistake-book.js - S3 "Ho so" workspace for recorded WA analysis.
// Collects mistakes.md entries, then filters by topic/verdict/reoffense count
// and groups them by likely error type for review.

import { api } from "../api.js";
import { escapeHtml, renderMarkdown } from "../md.js";

const REVIEW_INTERVALS = [3, 7, 21, 60];

function buildWorkspace() {
  const existing = document.getElementById("mbook-workspace");
  if (existing) return existing;
  const root = document.createElement("section");
  root.id = "mbook-workspace";
  root.className = "mbook-workspace hidden";
  root.setAttribute("aria-label", "Ho so loi lap");
  root.innerHTML = `
    <header class="mbook-topbar">
      <div>
        <div class="mbook-kicker">Ho so</div>
        <h2 class="mbook-title">So tay loi</h2>
      </div>
      <span id="mbook-count" class="mbook-count"></span>
      <button type="button" id="mbook-close" class="btn btn-ghost btn-sm">Dong</button>
    </header>
    <div class="mbook-layout">
      <aside class="mbook-rail">
        <div class="mbook-filter-block">
          <label class="mbook-filter-label" for="mbook-search">Tim trong ghi chep</label>
          <input id="mbook-search" class="input" type="search" autocomplete="off" placeholder="binary search, overflow..." />
        </div>
        <div class="mbook-filter-grid">
          <label class="mbook-filter-block" for="mbook-topic">
            <span class="mbook-filter-label">Chu de</span>
            <select id="mbook-topic" class="select"></select>
          </label>
          <label class="mbook-filter-block" for="mbook-verdict">
            <span class="mbook-filter-label">Verdict gan nhat</span>
            <select id="mbook-verdict" class="select">
              <option value="">Tat ca</option>
              <option value="WA">WA</option>
              <option value="TLE">TLE</option>
              <option value="RE">RE</option>
              <option value="CE">CE</option>
              <option value="AC">AC</option>
            </select>
          </label>
          <label class="mbook-filter-block" for="mbook-repeat">
            <span class="mbook-filter-label">Tai pham</span>
            <select id="mbook-repeat" class="select">
              <option value="1">1+ lan</option>
              <option value="2">2+ lan</option>
              <option value="3">3+ lan</option>
              <option value="5">5+ lan</option>
            </select>
          </label>
        </div>
        <section class="mbook-review">
          <div class="mbook-section-head">
            <span>Hang cho on</span>
            <span id="mbook-review-count" class="muted"></span>
          </div>
          <div id="mbook-review-list" class="mbook-review-list"></div>
        </section>
      </aside>
      <main class="mbook-main">
        <div id="mbook-body" class="mbook-body"></div>
      </main>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function problemMeta(app, id) {
  return (app.state.problems || []).find((p) => p.id === id) || {};
}

function reoffenseCount(app, item) {
  const meta = problemMeta(app, item.id);
  const history = Array.isArray(meta.history) ? meta.history : [];
  const wrongRuns = history.filter((h) => ["WA", "TLE", "RE", "CE"].includes(String(h.verdict || "").toUpperCase())).length;
  const sections = (String(item.content || "").match(/^##\s+/gm) || []).length;
  return Math.max(1, wrongRuns, sections);
}

function classify(item) {
  const text = `${item.title || ""}\n${item.topic || ""}\n${item.content || ""}`.toLowerCase();
  const rules = [
    [/overflow|long long|integer|int64|tran so|kieu so/, "Kieu so / tran so"],
    [/off.?by.?one|bien|boundary|gioi han|index|1-index|0-index/, "Bien va chi so"],
    [/sort|ordering|thu tu|compare|comparator/, "Sap xep / thu tu"],
    [/dp|dynamic programming|state|transition|trang thai/, "Quy hoach dong"],
    [/graph|tree|dfs|bfs|dijkstra|shortest|cycle/, "Do thi / cay"],
    [/binary search|lower_bound|upper_bound|monotonic/, "Tim kiem nhi phan"],
    [/greedy|tham lam|invariant|exchange/, "Lap luan greedy"],
    [/input|stdin|parse|format|xuong dong|newline/, "Doc input / format"],
    [/logic|case|counterexample|edge|phan vi du/, "Logic / edge case"]
  ];
  const hit = rules.find(([re]) => re.test(text));
  return hit ? hit[1] : "Can doc lai";
}

function normalize(app, items) {
  return (items || []).map((item) => {
    const meta = problemMeta(app, item.id);
    return {
      ...item,
      topic: item.topic || meta.topic || "",
      lastVerdict: item.lastVerdict || meta.lastVerdict || "",
      repeat: reoffenseCount(app, item),
      kind: classify(item),
      reviewStep: REVIEW_INTERVALS[Math.min(Number(meta.reviewCount || 0), REVIEW_INTERVALS.length - 1)]
    };
  });
}

function fillTopics(select, items) {
  const prev = select.value;
  const topics = [...new Set(items.map((x) => x.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">Tat ca</option>` + topics.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  if (topics.includes(prev)) select.value = prev;
}

function emptyState() {
  return `
    <div class="mbook-empty">
      <div class="mbook-empty-title">Chua co ghi chep loi nao.</div>
      <p>Khi mot bai WA nhieu lan, bam <b>Phan tich loi cua toi</b> trong tab Run. Phan tich se duoc luu vao day de em on lai truoc buoi luyen tiep theo.</p>
    </div>`;
}

function renderEntries(items) {
  if (!items.length) return emptyState();
  const groups = new Map();
  items.forEach((item) => {
    if (!groups.has(item.kind)) groups.set(item.kind, []);
    groups.get(item.kind).push(item);
  });
  return [...groups.entries()].map(([kind, entries]) => `
    <section class="mbook-group">
      <div class="mbook-group-head">
        <h3>${escapeHtml(kind)}</h3>
        <span>${entries.length} ghi chep</span>
      </div>
      <div class="mbook-entries">
        ${entries.map((it, idx) => `
          <article class="mbook-entry">
            <div class="mbook-entry-head">
              <div>
                <h4>${escapeHtml(it.title)}</h4>
                <div class="mbook-meta">
                  ${it.topic ? `<span>${escapeHtml(it.topic)}</span>` : ""}
                  ${it.lastVerdict ? `<span>${escapeHtml(it.lastVerdict)}</span>` : ""}
                  <span>${it.repeat} lan tai pham</span>
                  <span>on lai sau ${it.reviewStep} ngay</span>
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm mbook-open" data-id="${escapeHtml(it.id)}">Mo bai</button>
            </div>
            <details ${idx === 0 ? "open" : ""}>
              <summary>Doc ghi chep</summary>
              <div class="md-preview mbook-md">${renderMarkdown(it.content)}</div>
            </details>
          </article>`).join("")}
      </div>
    </section>`).join("");
}

function renderReviewQueue(items) {
  if (!items || !items.length) {
    return `<div class="mbook-review-empty">Chua co bai den han. Hang cho dung lich 3-7-21-60 ngay sau moi lan on.</div>`;
  }
  return items.map((it) => `
    <div class="mbook-rq-item">
      <div>
        <b>${escapeHtml(it.title)}</b>
        <span>${it.waBeforeAc > 0 ? `${it.waBeforeAc} WA truoc AC` : "AC ngay"}${it.topic ? ` &middot; ${escapeHtml(it.topic)}` : ""}</span>
      </div>
      <div class="mbook-rq-actions">
        <button type="button" class="btn btn-ghost btn-sm mbook-open" data-id="${escapeHtml(it.id)}">Mo</button>
        <button type="button" class="btn btn-ghost btn-sm mbook-review-done" data-id="${escapeHtml(it.id)}">Da on</button>
      </div>
    </div>`).join("");
}

export function initMistakeBook(app) {
  const root = buildWorkspace();
  const body = root.querySelector("#mbook-body");
  const countEl = root.querySelector("#mbook-count");
  const reviewCountEl = root.querySelector("#mbook-review-count");
  const reviewList = root.querySelector("#mbook-review-list");
  const searchEl = root.querySelector("#mbook-search");
  const topicEl = root.querySelector("#mbook-topic");
  const verdictEl = root.querySelector("#mbook-verdict");
  const repeatEl = root.querySelector("#mbook-repeat");
  let allItems = [];
  let reviewItems = [];

  const close = () => root.classList.add("hidden");
  root.querySelector("#mbook-close").addEventListener("click", close);

  function filteredItems() {
    const q = searchEl.value.trim().toLowerCase();
    const topic = topicEl.value;
    const verdict = verdictEl.value;
    const minRepeat = Number(repeatEl.value) || 1;
    return allItems.filter((it) => {
      const haystack = `${it.title} ${it.topic} ${it.lastVerdict} ${it.kind} ${it.content}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (!topic || it.topic === topic)
        && (!verdict || it.lastVerdict === verdict)
        && it.repeat >= minRepeat;
    });
  }

  function repaint() {
    const items = filteredItems();
    countEl.textContent = `${items.length}/${allItems.length} ghi chep`;
    body.innerHTML = renderEntries(items);
  }

  async function markReviewed(id, btn) {
    btn.disabled = true;
    try {
      const cur = await api.getProblem(id);
      const c = (cur && cur.problem && Number(cur.problem.reviewCount)) || 0;
      await api.updateProblem(id, { reviewCount: c + 1, lastReviewedAt: new Date().toISOString() });
      reviewItems = reviewItems.filter((it) => it.id !== id);
      reviewCountEl.textContent = reviewItems.length ? `${reviewItems.length}` : "";
      reviewList.innerHTML = renderReviewQueue(reviewItems);
      app.toast("Da danh dau on xong.", "ok");
    } catch (err) {
      btn.disabled = false;
      app.toast(err.message, "err");
    }
  }

  root.addEventListener("click", (e) => {
    const openBtn = e.target.closest(".mbook-open");
    if (openBtn) {
      close();
      if (app.selectProblem) app.selectProblem(openBtn.dataset.id);
      return;
    }
    const doneBtn = e.target.closest(".mbook-review-done");
    if (doneBtn) markReviewed(doneBtn.dataset.id, doneBtn);
  });

  [searchEl, topicEl, verdictEl, repeatEl].forEach((el) => el.addEventListener("input", repaint));
  [topicEl, verdictEl, repeatEl].forEach((el) => el.addEventListener("change", repaint));

  app.openMistakeBook = async () => {
    root.classList.remove("hidden");
    body.innerHTML = `<div class="mbook-loading"><span class="spinner"></span> Dang gom so tay...</div>`;
    reviewList.innerHTML = `<div class="mbook-review-empty"><span class="spinner"></span> Dang tai hang cho...</div>`;
    try {
      const [book, rq] = await Promise.all([
        api.mistakeBook(),
        api.reviewQueue().catch(() => ({ items: [] }))
      ]);
      allItems = normalize(app, book.items || []);
      reviewItems = (rq && rq.items) || [];
      fillTopics(topicEl, allItems);
      reviewCountEl.textContent = reviewItems.length ? `${reviewItems.length}` : "";
      reviewList.innerHTML = renderReviewQueue(reviewItems);
      repaint();
      setTimeout(() => searchEl.focus(), 30);
    } catch (err) {
      body.innerHTML = `<div class="mbook-empty mbook-error">${escapeHtml(err.message)}</div>`;
    }
  };
}
