// visualizer.js — 🔬 Test Case Visualizer.
//
// Pastes of "5 4 / 1 2 / 2 3 …" are unreadable; this turns any test input into
// a picture. It auto-detects the structure (graph / tree / char grid / numeric
// matrix / array) with competitive-programming heuristics and renders it as
// SVG — no AI, no network, instant. The text fallback is a whitespace
// inspector (visible spaces, trailing-space highlighting), which is exactly
// what you need when a WA turns out to be formatting.
//
// Entry points: the 🔬 button in the Run console, the 👁 button on every test
// card, and app.openVisualizer(text, label) for anything else.

import { escapeHtml } from "../md.js";

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const isInt = (s) => /^[+-]?\d+$/.test(s);
const isNum = (s) => /^[+-]?\d+(\.\d+)?$/.test(s);

function splitLines(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

const toks = (line) => line.trim().split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------
// Detectors — each returns { type, ...payload } or null
// ---------------------------------------------------------------------------

// Maze-style char grid: ≥2 rows, equal width ≥2, no spaces inside rows, and at
// least one non-numeric character somewhere (so number columns don't match).
// Tolerates a leading "n" / "n m" header line.
function detectCharGrid(lines) {
  let rows = lines.map((l) => l.replace(/\s+$/, ""));
  let header = null;
  if (rows.length >= 3) {
    const h = toks(rows[0]);
    if (h.length <= 2 && h.every(isInt)) {
      const body = rows.slice(1);
      if (body.length >= 2 && body.every((r) => !/\s/.test(r)) && new Set(body.map((r) => r.length)).size === 1 && body[0].length >= 2) {
        header = rows[0].trim();
        rows = body;
      }
    }
  }
  if (rows.length < 2) return null;
  if (!rows.every((r) => r.length >= 2 && !/\s/.test(r))) return null;
  if (new Set(rows.map((r) => r.length)).size !== 1) return null;
  if (rows.every((r) => /^[\d]+$/.test(r)) && rows[0].length > 4) {
    // all-digit wide rows are usually binary mazes — allow those
  } else if (rows.every((r) => isNum(r))) {
    return null; // a column of plain numbers is an array, not a grid
  }
  return { type: "grid-char", rows, header };
}

// Edge list: header "n m" (or "n" → m = n-1 tree convention), then m lines of
// 2–3 ints whose endpoints fit in [0..n]. Extra trailing lines (queries) are
// fine — they're reported, not fatal.
function detectGraph(lines) {
  if (lines.length < 2) return null;
  const h = toks(lines[0]);
  if (!(h.length >= 1 && h.length <= 2 && h.every(isInt))) return null;
  const n = parseInt(h[0], 10);
  const m = h.length === 2 ? parseInt(h[1], 10) : n - 1;
  if (!(n >= 1 && n <= 5000 && m >= 1 && m <= 20000)) return null;
  if (lines.length - 1 < m) return null;

  const edges = [];
  let weighted = false;
  for (let i = 1; i <= m; i++) {
    const t = toks(lines[i]);
    if (t.length < 2 || t.length > 3 || !t.slice(0, 2).every(isInt)) return null;
    const u = parseInt(t[0], 10), v = parseInt(t[1], 10);
    if (u < 0 || v < 0 || u > n || v > n) return null;
    let w = null;
    if (t.length === 3) { if (!isNum(t[2])) return null; w = t[2]; weighted = true; }
    edges.push({ u, v, w });
  }
  // 0-indexed if any endpoint is 0
  const zero = edges.some((e) => e.u === 0 || e.v === 0);
  if (!zero && edges.some((e) => e.u > n || e.v > n)) return null;
  const extra = lines.length - 1 - m;
  const tree = isTree(n, edges, zero);
  return { type: tree ? "tree" : "graph", n, edges, weighted, zero, extra };
}

function isTree(n, edges, zero) {
  if (edges.length !== n - 1 || n < 2) return false;
  const adj = Array.from({ length: n + 1 }, () => []);
  for (const e of edges) {
    const u = zero ? e.u + 1 : e.u, v = zero ? e.v + 1 : e.v;
    if (u < 1 || v < 1 || u > n || v > n) return false;
    adj[u].push(v); adj[v].push(u);
  }
  const seen = new Array(n + 1).fill(false);
  const stack = [1]; seen[1] = true; let count = 1;
  while (stack.length) {
    const u = stack.pop();
    for (const v of adj[u]) if (!seen[v]) { seen[v] = true; count++; stack.push(v); }
  }
  return count === n;
}

// Numeric matrix: optional "n"/"n m" header then ≥2 equal-width numeric rows.
function detectMatrix(lines) {
  let rows = lines.map(toks);
  let header = null;
  if (rows.length >= 3) {
    const h = rows[0];
    if (h.length <= 2 && h.every(isInt)) {
      const n = parseInt(h[0], 10);
      const body = rows.slice(1);
      if (body.length >= Math.min(n, 2) && body.length >= 2 && body.every((r) => r.length === body[0].length && r.length >= 2 && r.every(isNum))) {
        header = lines[0].trim();
        rows = body.slice(0, h.length === 2 || n <= body.length ? (h.length >= 1 ? Math.min(n, body.length) : body.length) : body.length);
      } else return null;
    }
  }
  if (!header) {
    if (rows.length < 2) return null;
    if (!rows.every((r) => r.length === rows[0].length && r.length >= 2 && r.every(isNum))) return null;
  }
  if (rows.length * rows[0].length > 4000) return null;
  return { type: "grid-num", rows: rows.map((r) => r.map(Number)), header };
}

// Array: "n" header + n values, a single value line, or a column of numbers.
function detectArray(lines) {
  if (!lines.length) return null;
  const first = toks(lines[0]);
  // header + flattened values
  if (first.length === 1 && isInt(first[0]) && lines.length >= 2) {
    const n = parseInt(first[0], 10);
    const rest = lines.slice(1).flatMap(toks);
    if (n >= 1 && n <= 5000 && rest.length >= n && rest.slice(0, n).every(isNum)) {
      return { type: "array", values: rest.slice(0, n).map(Number), header: lines[0].trim(), extra: rest.length - n };
    }
  }
  // one line of values
  if (lines.length === 1 && first.length >= 2 && first.every(isNum)) {
    return { type: "array", values: first.map(Number), header: null, extra: 0 };
  }
  // column of single numbers
  if (lines.length >= 2 && lines.every((l) => { const t = toks(l); return t.length === 1 && isNum(t[0]); })) {
    return { type: "array", values: lines.map((l) => Number(toks(l)[0])), header: null, extra: 0 };
  }
  return null;
}

export function detect(text, forced = "auto") {
  const lines = splitLines(text);
  if (!lines.length) return { type: "empty" };
  if (forced !== "auto") {
    const by = {
      graph: () => detectGraph(lines) || { type: "invalid", want: "đồ thị (n m + danh sách cạnh)" },
      tree: () => { const g = detectGraph(lines); return g ? { ...g, type: isTree(g.n, g.edges, g.zero) ? "tree" : "graph" } : { type: "invalid", want: "cây (n + n-1 cạnh)" }; },
      grid: () => detectCharGrid(lines) || detectMatrix(lines) || { type: "invalid", want: "lưới ký tự hoặc ma trận số" },
      array: () => detectArray(lines) || { type: "invalid", want: "dãy số" },
      text: () => ({ type: "text", lines })
    };
    return (by[forced] ? by[forced]() : { type: "text", lines });
  }
  return detectCharGrid(lines)
    || detectGraph(lines)
    || detectMatrix(lines)
    || detectArray(lines)
    || { type: "text", lines };
}

// ---------------------------------------------------------------------------
// SVG renderers
// ---------------------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";

function svgOpen(w, h) {
  return `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="viz-svg">`;
}

function nodeLabel(i, zero) { return zero ? i : i; }

function renderGraph(d, opts) {
  const n = d.n;
  const ids = [];
  for (let i = zeroLo(d); i <= zeroHi(d); i++) ids.push(i);
  const count = ids.length;
  const nodeR = count > 80 ? 7 : count > 30 ? 11 : 15;
  const ringR = Math.max(130, (count * (nodeR * 2 + 16)) / (2 * Math.PI));
  const size = Math.ceil(ringR * 2 + nodeR * 2 + 70);
  const cx = size / 2, cy = size / 2;
  const pos = {};
  ids.forEach((id, k) => {
    const a = (k / count) * Math.PI * 2 - Math.PI / 2;
    pos[id] = { x: cx + ringR * Math.cos(a), y: cy + ringR * Math.sin(a) };
  });

  let edges = "", labels = "";
  const seen = {};
  for (const e of d.edges) {
    const a = pos[e.u], b = pos[e.v];
    if (!a || !b) continue;
    if (e.u === e.v) {
      edges += `<circle cx="${a.x}" cy="${a.y - nodeR - 7}" r="8" class="viz-edge" fill="none"/>`;
      continue;
    }
    const key = e.u < e.v ? `${e.u}-${e.v}` : `${e.v}-${e.u}`;
    const dup = (seen[key] = (seen[key] || 0) + 1);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // parallel edges bow outward a little
    const bow = dup > 1 ? (dup - 1) * 14 * (e.u < e.v ? 1 : -1) : 0;
    const nxv = -(b.y - a.y), nyv = (b.x - a.x);
    const nl = Math.hypot(nxv, nyv) || 1;
    const qx = mx + (nxv / nl) * bow, qy = my + (nyv / nl) * bow;
    edges += `<path d="M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}" class="viz-edge" fill="none"${opts.directed ? ` marker-end="url(#viz-arrow)"` : ""}><title>${e.u} → ${e.v}${e.w != null ? ` (w=${e.w})` : ""}</title></path>`;
    if (e.w != null) {
      labels += `<text x="${(mx + qx) / 2}" y="${(my + qy) / 2 - 3}" class="viz-wlabel">${escapeHtml(String(e.w))}</text>`;
    }
  }

  let nodes = "";
  for (const id of ids) {
    const p = pos[id];
    nodes += `<g class="viz-node"><circle cx="${p.x}" cy="${p.y}" r="${nodeR}"/><text x="${p.x}" y="${p.y}" dy="0.35em">${nodeLabel(id, d.zero)}</text><title>đỉnh ${id}</title></g>`;
  }

  const defs = `<defs><marker id="viz-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="viz-arrowhead"/></marker></defs>`;
  return {
    svg: svgOpen(size, size) + defs + edges + labels + nodes + "</svg>",
    foot: `${count} đỉnh · ${d.edges.length} cạnh${d.weighted ? " · có trọng số" : ""}${d.zero ? " · đánh số từ 0" : ""}${d.extra > 0 ? ` · +${d.extra} dòng sau danh sách cạnh (truy vấn?)` : ""}`
  };
}

function zeroLo(d) { return d.zero ? 0 : 1; }
function zeroHi(d) { return d.zero ? d.n - 1 : d.n; }

function renderTree(d) {
  const n = d.n;
  const adj = Array.from({ length: n + 1 }, () => []);
  for (const e of d.edges) {
    const u = d.zero ? e.u + 1 : e.u, v = d.zero ? e.v + 1 : e.v;
    adj[u].push({ v, w: e.w }); adj[v].push({ v: u, w: e.w });
  }
  // tidy layout: leaves take successive x slots, parents center over children
  const xs = new Array(n + 1).fill(0), depth = new Array(n + 1).fill(0);
  let cursor = 0, maxDepth = 0;
  const visited = new Array(n + 1).fill(false);
  (function dfs(u, dep) {
    visited[u] = true;
    depth[u] = dep; maxDepth = Math.max(maxDepth, dep);
    const kids = adj[u].filter((k) => !visited[k.v]);
    if (!kids.length) { xs[u] = cursor++; return; }
    for (const k of kids) dfs(k.v, dep + 1);
    const childXs = adj[u].filter((k) => depth[k.v] === dep + 1).map((k) => xs[k.v]);
    xs[u] = childXs.length ? (Math.min(...childXs) + Math.max(...childXs)) / 2 : cursor++;
  })(1, 0);

  const nodeR = n > 60 ? 9 : 15;
  const gapX = nodeR * 2 + 22, gapY = nodeR * 2 + 44;
  const w = Math.max(2, cursor) * gapX + 60, h = (maxDepth + 1) * gapY + 50;
  const px = (u) => 30 + nodeR + xs[u] * gapX;
  const py = (u) => 28 + nodeR + depth[u] * gapY;

  let edges = "", labels = "", nodes = "";
  const drawn = new Set();
  for (let u = 1; u <= n; u++) {
    for (const k of adj[u]) {
      const key = u < k.v ? `${u}-${k.v}` : `${k.v}-${u}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const [a, b] = depth[u] < depth[k.v] ? [u, k.v] : [k.v, u];
      edges += `<path d="M ${px(a)} ${py(a)} C ${px(a)} ${py(a) + gapY / 2}, ${px(b)} ${py(b) - gapY / 2}, ${px(b)} ${py(b)}" class="viz-edge" fill="none"/>`;
      if (k.w != null) labels += `<text x="${(px(a) + px(b)) / 2}" y="${(py(a) + py(b)) / 2}" class="viz-wlabel">${escapeHtml(String(k.w))}</text>`;
    }
  }
  for (let u = 1; u <= n; u++) {
    const shown = d.zero ? u - 1 : u;
    nodes += `<g class="viz-node ${u === 1 ? "viz-root" : ""}"><circle cx="${px(u)}" cy="${py(u)}" r="${nodeR}"/><text x="${px(u)}" y="${py(u)}" dy="0.35em">${shown}</text><title>đỉnh ${shown}${u === 1 ? " (gốc)" : ""}</title></g>`;
  }
  return {
    svg: svgOpen(w, h) + edges + labels + nodes + "</svg>",
    foot: `cây ${n} đỉnh · gốc ${d.zero ? 0 : 1} · cao ${maxDepth + 1} tầng${d.weighted ? " · có trọng số" : ""}${d.zero ? " · đánh số từ 0" : ""}`
  };
}

const CELL_COLORS = {
  "#": "var(--viz-wall)", ".": "var(--viz-floor)",
  "S": "var(--ac)", "s": "var(--ac)",
  "E": "var(--wa)", "G": "var(--wa)", "T": "var(--wa)", "F": "var(--wa)",
  "*": "var(--tle)", "o": "var(--accent)", "O": "var(--accent)",
  "x": "var(--purple)", "X": "var(--purple)", "@": "var(--accent)"
};

function renderCharGrid(d) {
  const rows = d.rows, R = rows.length, C = rows[0].length;
  const cell = Math.max(10, Math.min(34, Math.floor(680 / Math.max(C, R / 1.6))));
  const showIdx = cell >= 16;
  const off = showIdx ? 26 : 6;
  const w = off + C * cell + 8, h = off + R * cell + 8;
  let out = "";
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const ch = rows[r][c];
      const fill = CELL_COLORS[ch] || (/[0-9]/.test(ch) ? "var(--viz-digit)" : "var(--viz-other)");
      out += `<rect x="${off + c * cell}" y="${off + r * cell}" width="${cell - 1}" height="${cell - 1}" rx="2" fill="${fill}" class="viz-cell ${ch === "#" ? "viz-cell-wall" : ""}"><title>(${r},${c}) = ${escapeHtml(ch)}</title></rect>`;
      if (ch !== "#" && ch !== "." && cell >= 13) {
        out += `<text x="${off + c * cell + cell / 2}" y="${off + r * cell + cell / 2}" dy="0.35em" class="viz-cell-ch" font-size="${Math.floor(cell * 0.55)}">${escapeHtml(ch)}</text>`;
      }
    }
  }
  if (showIdx) {
    for (let c = 0; c < C; c += Math.ceil(C / 30)) out += `<text x="${off + c * cell + cell / 2}" y="${off - 8}" class="viz-idx">${c}</text>`;
    for (let r = 0; r < R; r += Math.ceil(R / 40)) out += `<text x="${off - 8}" y="${off + r * cell + cell / 2}" dy="0.35em" class="viz-idx" text-anchor="end">${r}</text>`;
  }
  return {
    svg: svgOpen(w, h) + out + "</svg>",
    foot: `lưới ${R}×${C}${d.header ? ` · dòng đầu: “${escapeHtml(d.header)}”` : ""} · # tường, . trống, S/E xuất phát/đích`
  };
}

function renderMatrix(d) {
  const rows = d.rows, R = rows.length, C = rows[0].length;
  let mn = Infinity, mx = -Infinity, maxLen = 1;
  for (const r of rows) for (const v of r) { mn = Math.min(mn, v); mx = Math.max(mx, v); maxLen = Math.max(maxLen, String(v).length); }
  const cell = Math.max(26, Math.min(54, maxLen * 9 + 14));
  const off = 26;
  const w = off + C * cell + 8, h = off + R * cell + 8;
  const span = mx - mn || 1;
  let out = "";
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const v = rows[r][c];
      const t = (v - mn) / span; // 0..1 heat
      out += `<rect x="${off + c * cell}" y="${off + r * cell}" width="${cell - 2}" height="${cell - 2}" rx="4" fill="var(--accent)" fill-opacity="${(0.06 + t * 0.38).toFixed(2)}" class="viz-cell"><title>(${r},${c}) = ${v}</title></rect>`;
      out += `<text x="${off + c * cell + cell / 2 - 1}" y="${off + r * cell + cell / 2 - 1}" dy="0.35em" class="viz-cell-num" font-size="${cell >= 40 ? 12 : 10.5}">${v}</text>`;
    }
  }
  for (let c = 0; c < C; c++) out += `<text x="${off + c * cell + cell / 2}" y="${off - 8}" class="viz-idx">${c}</text>`;
  for (let r = 0; r < R; r++) out += `<text x="${off - 8}" y="${off + r * cell + cell / 2}" dy="0.35em" class="viz-idx" text-anchor="end">${r}</text>`;
  return {
    svg: svgOpen(w, h) + out + "</svg>",
    foot: `ma trận ${R}×${C} · min ${mn} · max ${mx}${d.header ? ` · dòng đầu: “${escapeHtml(d.header)}”` : ""} · màu đậm = giá trị lớn`
  };
}

function renderArray(d) {
  const CAP = 150;
  const values = d.values.slice(0, CAP);
  const n = values.length;
  const mn = Math.min(...values), mx = Math.max(...values);
  const lo = Math.min(0, mn), hi = Math.max(0, mx);
  const span = hi - lo || 1;
  const bw = Math.max(8, Math.min(42, Math.floor(760 / n) - 3));
  const showVal = bw >= 18, showIdx = bw >= 13;
  const H = 220, plotH = H - 50;
  const w = 30 + n * (bw + 3) + 12, h = H + (showIdx ? 18 : 6);
  const y0 = 14 + plotH * (hi / span); // y of zero line
  let out = `<line x1="24" y1="${y0}" x2="${w - 6}" y2="${y0}" class="viz-axis"/>`;
  values.forEach((v, i) => {
    const x = 30 + i * (bw + 3);
    const bh = Math.max(1.5, Math.abs(v) / span * plotH);
    const y = v >= 0 ? y0 - bh : y0;
    const cls = v === mx ? "viz-bar-max" : v === mn && mn < 0 ? "viz-bar-min" : v === mn ? "viz-bar-min" : "";
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2.5" class="viz-bar ${cls}"><title>a[${i}] = ${v}</title></rect>`;
    if (showVal) out += `<text x="${x + bw / 2}" y="${v >= 0 ? y - 4 : y + bh + 11}" class="viz-val">${v}</text>`;
    if (showIdx) out += `<text x="${x + bw / 2}" y="${H + 10}" class="viz-idx">${i}</text>`;
  });
  return {
    svg: svgOpen(w, h) + out + "</svg>",
    foot: `${d.values.length} phần tử${d.values.length > CAP ? ` (vẽ ${CAP} đầu tiên)` : ""} · min ${mn} · max ${mx}${d.header ? ` · dòng đầu: “${escapeHtml(d.header)}”` : ""}${d.extra > 0 ? ` · +${d.extra} giá trị thừa sau n phần tử` : ""}`
  };
}

// Whitespace inspector — HTML, not SVG. Trailing spaces are the classic
// invisible-WA, so they get a loud highlight.
function renderText(d) {
  const rows = d.lines.slice(0, 400).map((line, i) => {
    const m = line.match(/^(.*?)([ \t]+)$/);
    const body = m ? m[1] : line;
    const trail = m ? m[2] : "";
    const shown = escapeHtml(body).replace(/ /g, `<span class="viz-sp">·</span>`).replace(/\t/g, `<span class="viz-sp">→&nbsp;</span>`);
    const trailHtml = trail ? `<span class="viz-trail" title="khoảng trắng thừa cuối dòng!">${"·".repeat(trail.length)}</span>` : "";
    return `<div class="viz-line"><span class="viz-ln">${i + 1}</span><span class="viz-line-body">${shown}${trailHtml}<span class="viz-eol">⏎</span></span></div>`;
  }).join("");
  const trailing = d.lines.filter((l) => /[ \t]+$/.test(l)).length;
  return {
    html: `<div class="viz-textwrap">${rows || '<div class="viz-line"><span class="viz-ln">—</span>(trống)</div>'}</div>`,
    foot: `${d.lines.length} dòng · chế độ soi khoảng trắng — · là dấu cách, ⏎ cuối dòng${trailing ? ` · ⚠ ${trailing} dòng có khoảng trắng thừa cuối dòng` : " · không có khoảng trắng thừa"}`
  };
}

const TYPE_LABEL = {
  graph: "🕸️ Đồ thị", tree: "🌳 Cây", "grid-char": "🧱 Lưới ký tự",
  "grid-num": "🔢 Ma trận", array: "📊 Dãy số", text: "📄 Văn bản",
  empty: "∅ Trống", invalid: "⚠ Không khớp"
};

// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

export function initVisualizer(app) {
  let modal = null;
  let state = { sources: [], srcIdx: 0, forced: "auto", directed: false, zoom: 1 };

  function buildModal() {
    modal = document.createElement("div");
    modal.id = "viz-modal";
    modal.className = "modal-overlay hidden";
    modal.innerHTML = `
      <div class="modal modal-wide viz-modal">
        <div class="viz-head">
          <h2 class="modal-title">🔬 Trực quan hóa test</h2>
          <span id="viz-chip" class="viz-chip"></span>
          <span class="toolbar-spacer"></span>
          <button id="viz-close" class="btn btn-ghost btn-sm" type="button">✕ Đóng</button>
        </div>
        <div class="viz-toolbar">
          <select id="viz-source" class="select viz-source"></select>
          <div class="viz-types" id="viz-types">
            ${["auto", "graph", "tree", "grid", "array", "text"].map((t) =>
              `<button class="viz-type ${t === "auto" ? "active" : ""}" data-type="${t}" type="button">${{ auto: "Auto", graph: "Đồ thị", tree: "Cây", grid: "Lưới", array: "Dãy", text: "Văn bản" }[t]}</button>`).join("")}
          </div>
          <label class="viz-opt" id="viz-directed-wrap"><input type="checkbox" id="viz-directed" /> Có hướng</label>
          <div class="viz-zoom">
            <button id="viz-zoom-out" class="btn btn-ghost btn-sm" type="button" title="Thu nhỏ">−</button>
            <button id="viz-zoom-in" class="btn btn-ghost btn-sm" type="button" title="Phóng to">＋</button>
          </div>
        </div>
        <div id="viz-canvas" class="viz-canvas"><div id="viz-stage" class="viz-stage"></div></div>
        <div id="viz-foot" class="viz-foot"></div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("#viz-close").addEventListener("click", close);
    modal.querySelector("#viz-source").addEventListener("change", (e) => {
      state.srcIdx = Number(e.target.value) || 0;
      render();
    });
    modal.querySelector("#viz-types").addEventListener("click", (e) => {
      const btn = e.target.closest(".viz-type");
      if (!btn) return;
      state.forced = btn.dataset.type;
      modal.querySelectorAll(".viz-type").forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
    modal.querySelector("#viz-directed").addEventListener("change", (e) => {
      state.directed = e.target.checked;
      render();
    });
    modal.querySelector("#viz-zoom-in").addEventListener("click", () => { state.zoom = Math.min(3, state.zoom * 1.25); applyZoom(); });
    modal.querySelector("#viz-zoom-out").addEventListener("click", () => { state.zoom = Math.max(0.3, state.zoom / 1.25); applyZoom(); });
  }

  function applyZoom() {
    const stage = modal.querySelector("#viz-stage");
    stage.style.transform = `scale(${state.zoom})`;
  }

  function close() { modal.classList.add("hidden"); }

  function collectSources(initialText, label) {
    const sources = [];
    if (typeof initialText === "string" && initialText.trim()) {
      sources.push({ label: label || "Văn bản được chọn", text: initialText });
    }
    const stdin = app.el.ioInput ? app.el.ioInput.value : "";
    if (stdin.trim()) sources.push({ label: "stdin hiện tại", text: stdin });
    const expected = app.el.ioExpected ? app.el.ioExpected.value : "";
    if (expected.trim()) sources.push({ label: "expected hiện tại", text: expected });
    for (const t of app.state.tests || []) {
      if (String(t.input || "").trim()) sources.push({ label: `${t.name} · input`, text: t.input });
      if (String(t.expected || "").trim()) sources.push({ label: `${t.name} · expected`, text: t.expected });
    }
    if (!sources.length) sources.push({ label: "(chưa có dữ liệu)", text: "" });
    return sources;
  }

  function render() {
    const src = state.sources[state.srcIdx] || { text: "" };
    const d = detect(src.text, state.forced);
    const chip = modal.querySelector("#viz-chip");
    chip.textContent = TYPE_LABEL[d.type] || d.type;
    chip.dataset.type = d.type;
    modal.querySelector("#viz-directed-wrap").style.display = (d.type === "graph" || d.type === "tree") ? "" : "none";

    const stage = modal.querySelector("#viz-stage");
    const foot = modal.querySelector("#viz-foot");
    let r;
    if (d.type === "empty") r = { html: `<div class="viz-empty">Chưa có dữ liệu — gõ input vào tab Run hoặc thêm test trước.</div>`, foot: "" };
    else if (d.type === "invalid") r = { html: `<div class="viz-empty">⚠ Dữ liệu không khớp định dạng ${escapeHtml(d.want)}.<br/>Thử nút <b>Auto</b> hoặc <b>Văn bản</b>.</div>`, foot: "" };
    else if (d.type === "graph") r = renderGraph(d, { directed: state.directed });
    else if (d.type === "tree") r = state.directed ? renderGraph(d, { directed: true }) : renderTree(d);
    else if (d.type === "grid-char") r = renderCharGrid(d);
    else if (d.type === "grid-num") r = renderMatrix(d);
    else if (d.type === "array") r = renderArray(d);
    else r = renderText(d);

    stage.innerHTML = r.svg || r.html || "";
    foot.textContent = r.foot || "";
    state.zoom = 1;
    applyZoom();
  }

  app.openVisualizer = (initialText, label) => {
    if (!modal) buildModal();
    state.sources = collectSources(initialText, label);
    state.srcIdx = 0;
    state.forced = "auto";
    state.directed = false;
    const sel = modal.querySelector("#viz-source");
    sel.innerHTML = state.sources.map((s, i) => `<option value="${i}">${escapeHtml(s.label)}</option>`).join("");
    modal.querySelectorAll(".viz-type").forEach((b) => b.classList.toggle("active", b.dataset.type === "auto"));
    modal.querySelector("#viz-directed").checked = false;
    modal.classList.remove("hidden");
    render();
  };

  // Run-console button (declared in index.html so it sits with Run ▶).
  const btn = document.getElementById("btn-visualize");
  if (btn) btn.addEventListener("click", () => app.openVisualizer());
}
