// snippets.js — Algorithm Snippet Library. A curated set of correct, concise
// C++ competitive-programming templates, searchable, inserted at the editor
// cursor (or copied). Builds its own modal; triggered by #btn-snippets.

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

function buildModal() {
  const existing = document.getElementById("snippets-modal");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "snippets-modal";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal modal-wide snip-modal">
      <h2 class="modal-title">⚡ Thư viện thuật toán</h2>
      <input id="snip-search" class="input" placeholder="Tìm: dsu, dijkstra, segment tree, sieve…" autocomplete="off" />
      <div class="snip-body">
        <div id="snip-list" class="snip-list"></div>
        <div class="snip-preview">
          <pre id="snip-code" class="snip-code"><span class="muted">Chọn một mẫu để xem.</span></pre>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" id="snip-close" class="btn btn-ghost">Đóng</button>
        <button type="button" id="snip-copy" class="btn btn-ghost" disabled>Copy</button>
        <button type="button" id="snip-insert" class="btn btn-primary" disabled>↳ Chèn tại con trỏ</button>
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
  let selected = null;

  const renderList = (q = "") => {
    const ql = q.trim().toLowerCase();
    const items = SNIPPETS.filter((s) =>
      !ql || s.name.toLowerCase().includes(ql) || s.tags.some((t) => t.includes(ql)));
    listEl.innerHTML = items.length
      ? items.map((s) => {
          const i = SNIPPETS.indexOf(s);
          return `<button class="snip-item ${selected === i ? "on" : ""}" data-i="${i}">
            <span class="snip-name">${escapeHtml(s.name)}</span>
            <span class="snip-tags">${s.tags.slice(0, 3).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</span>
          </button>`;
        }).join("")
      : `<div class="snip-empty muted">Không có mẫu nào khớp.</div>`;
  };

  const pick = (i) => {
    selected = i;
    codeEl.textContent = SNIPPETS[i].code;
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

  copyBtn.addEventListener("click", async () => {
    if (selected == null) return;
    try { await navigator.clipboard.writeText(SNIPPETS[selected].code); app.toast("Đã copy mẫu", "ok"); }
    catch { app.toast("Không copy được — chọn và Ctrl+C thủ công.", "err"); }
  });

  insertBtn.addEventListener("click", () => {
    if (selected == null || !app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const snippet = SNIPPETS[selected].code;
    app.insertAtCursor(snippet);
    close();
    app.setView("code");
    app.toast("Đã chèn mẫu", "ok");
  });

  trigger.addEventListener("click", () => {
    if (selected == null) { insertBtn.disabled = true; copyBtn.disabled = true; }
    renderList(searchEl.value);
    modal.classList.remove("hidden");
    setTimeout(() => searchEl.focus(), 30);
  });
}
