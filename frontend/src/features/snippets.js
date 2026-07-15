// snippets.js — Algorithm Snippet Library. A curated set of correct, concise
// C++ competitive-programming templates, searchable, inserted at the editor
// cursor (or copied). Builds its own tools workspace; triggered by #btn-snippets.

const SNIPPETS = [
  {
    name: "Fast I/O + template", tags: ["io", "template", "basic"],
    code: `#include <bits/stdc++.h>\nusing namespace std;\n#define ll long long\n#define all(x) (x).begin(), (x).end()\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int t = 1;\n    // cin >> t;\n    while (t--) {\n\n    }\n    return 0;\n}\n`
  },
  {
    name: "DSU (Union-Find)", tags: ["dsu", "graph", "union find"],
    code: `struct DSU {\n    vector<int> p, sz;\n    DSU(int n) : p(n), sz(n, 1) { iota(p.begin(), p.end(), 0); }\n    int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }\n    bool unite(int a, int b) {\n        a = find(a); b = find(b);\n        if (a == b) return false;\n        if (sz[a] < sz[b]) swap(a, b);\n        p[b] = a; sz[a] += sz[b];\n        return true;\n    }\n};\n`
  },
  {
    name: "Sieve of Eratosthenes", tags: ["math", "primes", "sieve"],
    code: `vector<int> sieve(int n) {\n    vector<bool> is(n + 1, true);\n    vector<int> primes;\n    is[0] = is[1] = false;\n    for (int i = 2; i <= n; i++) {\n        if (is[i]) {\n            primes.push_back(i);\n            for (long long j = (long long)i * i; j <= n; j += i) is[j] = false;\n        }\n    }\n    return primes;\n}\n`
  },
  {
    name: "Modular exponentiation", tags: ["math", "modpow", "number theory"],
    code: `long long power(long long a, long long b, long long mod) {\n    long long r = 1 % mod; a %= mod;\n    while (b > 0) {\n        if (b & 1) r = r * a % mod;\n        a = a * a % mod;\n        b >>= 1;\n    }\n    return r;\n}\n`
  },
  {
    name: "Binary search (lower_bound idiom)", tags: ["binary search", "search"],
    code: `// Smallest x in [lo, hi] with check(x) true; hi+1 if none.\nlong long lo = 0, hi = 1e9, ans = hi + 1;\nwhile (lo <= hi) {\n    long long mid = lo + (hi - lo) / 2;\n    if (check(mid)) { ans = mid; hi = mid - 1; }\n    else lo = mid + 1;\n}\n`
  },
  {
    name: "Fenwick tree (BIT)", tags: ["fenwick", "bit", "prefix", "data structure"],
    code: `struct Fenwick {\n    int n; vector<long long> t;\n    Fenwick(int n) : n(n), t(n + 1, 0) {}\n    void add(int i, long long v) { for (++i; i <= n; i += i & -i) t[i] += v; }\n    long long sum(int i) { long long s = 0; for (++i; i > 0; i -= i & -i) s += t[i]; return s; }\n    long long range(int l, int r) { return sum(r) - (l ? sum(l - 1) : 0); }\n};\n`
  },
  {
    name: "Segment tree (point update, range sum)", tags: ["segment tree", "data structure"],
    code: `struct SegTree {\n    int n; vector<long long> t;\n    SegTree(int n) : n(n), t(2 * n, 0) {}\n    void update(int i, long long v) { for (t[i += n] = v; i > 1; i >>= 1) t[i >> 1] = t[i] + t[i ^ 1]; }\n    long long query(int l, int r) { // [l, r)\n        long long s = 0;\n        for (l += n, r += n; l < r; l >>= 1, r >>= 1) {\n            if (l & 1) s += t[l++];\n            if (r & 1) s += t[--r];\n        }\n        return s;\n    }\n};\n`
  },
  {
    name: "Dijkstra (adjacency list)", tags: ["dijkstra", "graph", "shortest path"],
    code: `vector<long long> dijkstra(int src, vector<vector<pair<int,int>>>& adj) {\n    int n = adj.size();\n    vector<long long> dist(n, LLONG_MAX);\n    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<>> pq;\n    dist[src] = 0; pq.push({0, src});\n    while (!pq.empty()) {\n        auto [d, u] = pq.top(); pq.pop();\n        if (d > dist[u]) continue;\n        for (auto [v, w] : adj[u])\n            if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; pq.push({dist[v], v}); }\n    }\n    return dist;\n}\n`
  },
  {
    name: "BFS on grid", tags: ["bfs", "grid", "graph"],
    code: `int dx[] = {1, -1, 0, 0}, dy[] = {0, 0, 1, -1};\nqueue<pair<int,int>> q;\nq.push({sr, sc}); dist[sr][sc] = 0;\nwhile (!q.empty()) {\n    auto [r, c] = q.front(); q.pop();\n    for (int k = 0; k < 4; k++) {\n        int nr = r + dx[k], nc = c + dy[k];\n        if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;\n        if (grid[nr][nc] == '#' || dist[nr][nc] != -1) continue;\n        dist[nr][nc] = dist[r][c] + 1;\n        q.push({nr, nc});\n    }\n}\n`
  },
  {
    name: "GCD / LCM", tags: ["math", "gcd", "lcm"],
    code: `long long gcd(long long a, long long b) { return b ? gcd(b, a % b) : a; }\nlong long lcm(long long a, long long b) { return a / gcd(a, b) * b; }\n`
  },
  {
    name: "Coordinate compression", tags: ["compression", "sorting"],
    code: `vector<int> v(a.begin(), a.end());\nsort(v.begin(), v.end());\nv.erase(unique(v.begin(), v.end()), v.end());\nfor (auto& x : a) x = lower_bound(v.begin(), v.end(), x) - v.begin();\n`
  },
  {
    name: "USACO file I/O (freopen)", tags: ["usaco", "io", "freopen"],
    code: `freopen("problem.in", "r", stdin);\nfreopen("problem.out", "w", stdout);\n`
  }
];

import { escapeHtml } from "../md.js";
import { highlightCpp } from "../highlight.js";

const USER_SNIPPETS_KEY = "usaco2.userSnippets";

function loadUserSnippets() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_SNIPPETS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => s && s.name && s.code) : [];
  } catch {
    return [];
  }
}

function saveUserSnippets(items) {
  try {
    localStorage.setItem(USER_SNIPPETS_KEY, JSON.stringify(items.slice(0, 40)));
    return true;
  } catch {
    return false;
  }
}

function buildModal() {
  const existing = document.getElementById("snippets-workspace");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "snippets-workspace";
  overlay.className = "snip-workspace hidden";
  overlay.setAttribute("aria-label", "Thư viện thuật toán");
  overlay.innerHTML = `
    <div class="snip-panel">
      <div class="snip-head">
        <div class="snip-heading">
          <span class="snip-kicker">Công cụ code</span>
          <h2 class="modal-title">Thư viện thuật toán</h2>
          <p>Khung kỹ thuật chuẩn: tìm nhanh, xem trước có syntax, chèn đúng vị trí con trỏ.</p>
        </div>
        <button type="button" id="snip-close" class="aw-close" aria-label="Đóng">×</button>
      </div>
      <input id="snip-search" class="input" placeholder="Tìm: dsu, dijkstra, segment tree, sieve…" autocomplete="off" />
      <div class="snip-body">
        <div id="snip-list" class="snip-list"></div>
        <div class="snip-preview">
          <div class="snip-preview-bar">
            <span class="file-tab" id="snip-preview-name">snippet.cpp</span>
            <span class="toolbar-spacer"></span>
            <button type="button" id="snip-copy" class="btn btn-ghost btn-sm" disabled>⧉ Copy</button>
            <button type="button" id="snip-insert" class="btn btn-primary btn-sm" disabled>↳ Chèn tại con trỏ</button>
          </div>
          <pre id="snip-code" class="snip-code"><span class="muted">Chọn một mẫu để xem.</span></pre>
        </div>
      </div>
      <div class="snip-actions">
        <span class="snip-actions-hint">Bôi đen code trong editor rồi lưu để tự xây thư viện của riêng em.</span>
        <span class="toolbar-spacer"></span>
        <span id="snip-save-name-wrap" class="snip-save-wrap hidden">
          <input id="snip-save-name" class="input" maxlength="40" placeholder="Tên snippet…" />
          <button type="button" id="snip-save-confirm" class="btn btn-primary btn-sm">Lưu</button>
        </span>
        <button type="button" id="snip-save-selection" class="btn btn-ghost btn-sm">＋ Lưu đoạn đang chọn</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initSnippets(app) {
  const trigger = document.getElementById("btn-snippets");
  if (!trigger) return;
  const modal = buildModal();
  const listEl = modal.querySelector("#snip-list");
  const codeEl = modal.querySelector("#snip-code");
  const searchEl = modal.querySelector("#snip-search");
  const insertBtn = modal.querySelector("#snip-insert");
  const copyBtn = modal.querySelector("#snip-copy");
  const saveSelectionBtn = modal.querySelector("#snip-save-selection");
  let selected = null;
  let userSnippets = loadUserSnippets();

  const allSnippets = () => [
    ...SNIPPETS.map((s) => ({ ...s, source: "built-in" })),
    ...userSnippets.map((s) => ({ ...s, source: "user", tags: s.tags || ["custom"] }))
  ];

  const renderList = (q = "") => {
    const ql = q.trim().toLowerCase();
    const merged = allSnippets();
    const items = merged.filter((s) =>
      !ql || s.name.toLowerCase().includes(ql) || (s.tags || []).some((t) => String(t).includes(ql)));
    listEl.innerHTML = items.length
      ? items.map((s) => {
          const i = merged.indexOf(s);
          return `<button class="snip-item ${selected === i ? "on" : ""}" data-i="${i}">
            <span class="snip-index">${String(i + 1).padStart(2, "0")}</span>
            <span class="snip-main">
              <span class="snip-name">${escapeHtml(s.name)}</span>
              <span class="snip-tags">${(s.tags || []).slice(0, 3).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}${s.source === "user" ? `<span class="snip-tag-user">của em</span>` : ""}</span>
            </span>
          </button>`;
        }).join("")
      : `<div class="snip-empty muted">Không có mẫu khớp bộ lọc. Chọn một đoạn code trong editor rồi bấm <b>Lưu đoạn đang chọn</b> để tạo snippet riêng.</div>`;
  };

  const previewName = modal.querySelector("#snip-preview-name");
  const pick = (i) => {
    const item = allSnippets()[i];
    if (!item) return;
    selected = i;
    codeEl.innerHTML = highlightCpp(item.code);
    if (previewName) {
      previewName.textContent = item.name.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) + ".cpp";
    }
    insertBtn.disabled = false;
    copyBtn.disabled = false;
    listEl.querySelectorAll(".snip-item").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
  };

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".snip-item");
    if (btn) pick(Number(btn.dataset.i));
  });
  searchEl.addEventListener("input", () => renderList(searchEl.value));

  const close = () => modal.classList.add("hidden");
  modal.querySelector("#snip-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  copyBtn.addEventListener("click", async () => {
    const item = selected == null ? null : allSnippets()[selected];
    if (!item) return;
    try { await navigator.clipboard.writeText(item.code); app.toast("Đã copy mẫu", "ok"); }
    catch { app.toast("Không copy được — chọn và Ctrl+C thủ công.", "err"); }
  });

  insertBtn.addEventListener("click", () => {
    const item = selected == null ? null : allSnippets()[selected];
    if (!item || !app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    app.insertAtCursor(item.code);
    close();
    app.setView("code");
    app.toast("Đã chèn mẫu", "ok");
  });

  // window.prompt is unavailable in the Electron shell — the name is asked
  // through an inline input row instead (same fix as journey's rename).
  const saveWrap = modal.querySelector("#snip-save-name-wrap");
  const saveNameInput = modal.querySelector("#snip-save-name");
  const saveConfirmBtn = modal.querySelector("#snip-save-confirm");
  let pendingSelectionCode = "";

  const commitSave = () => {
    const name = (saveNameInput.value || "").trim();
    if (!name || !pendingSelectionCode.trim()) { saveWrap.classList.add("hidden"); return; }
    userSnippets = [{ name, tags: ["custom"], code: pendingSelectionCode }, ...userSnippets];
    if (!saveUserSnippets(userSnippets)) {
      app.toast("Không lưu được snippet cá nhân.", "err");
      return;
    }
    pendingSelectionCode = "";
    saveWrap.classList.add("hidden");
    selected = SNIPPETS.length;
    renderList(searchEl.value);
    pick(selected);
    app.toast("Đã lưu snippet cá nhân.", "ok");
  };
  saveConfirmBtn.addEventListener("click", commitSave);
  saveNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitSave(); }
    else if (e.key === "Escape") { e.stopPropagation(); saveWrap.classList.add("hidden"); }
  });

  saveSelectionBtn.addEventListener("click", () => {
    const ed = app.el.codeEditor;
    const code = ed && ed.selectionStart !== ed.selectionEnd
      ? ed.value.slice(ed.selectionStart, ed.selectionEnd)
      : "";
    if (!code.trim()) {
      app.toast("Chọn một đoạn code trong editor trước.", "err");
      return;
    }
    pendingSelectionCode = code;
    saveWrap.classList.remove("hidden");
    saveNameInput.value = "";
    saveNameInput.focus();
  });

  trigger.addEventListener("click", () => {
    renderList(searchEl.value);
    if (selected == null && allSnippets().length) pick(0);
    modal.classList.remove("hidden");
    setTimeout(() => searchEl.focus(), 30);
  });
}
