// statement.js — Problem view controller (center column).
//
// Flow:  paste / upload image  ->  OCR  ->  statement.md  ->  AI analyze + tests
// (in parallel)  ->  populate the Analysis / Examples / Generated-tests cards.
// Pasting or editing the statement auto-triggers the pipeline (debounced).

import { api } from "./api.js";
import { renderMeta } from "./editor.js";
import { renderMarkdown, escapeHtml, renderMath } from "./md.js";
import { initNeonCanvas } from "./statement-neon-canvas.js";

let stopNeonCanvas = null;

// ---- Statement reading page (section-aware) --------------------------------
// A real competitive-programming problem page: the raw Markdown is split into
// recognized sections (Description / Input / Output / Constraints / Examples /
// Notes / Subtasks) by heading keywords — Vietnamese AND English — and each is
// rendered with a quiet section label. Falls back to one "Đề bài" block when a
// statement has no headings. The raw textarea stays the source of truth (Edit).

function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function normHead(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Order matters: "Sample Input" must classify as Examples, not Input — so the
// example/sample rules are tested before the bare input/output rules.
const SECTION_RULES = [
  { type: "examples",    label: "Ví dụ",              kw: ["example", "examples", "sample", "samples", "vi du", "vi du mau", "test vi du"] },
  { type: "subtasks",    label: "Subtasks & chấm điểm", kw: ["subtask", "subtasks", "scoring", "cham diem", "phan diem"] },
  { type: "constraints", label: "Ràng buộc",          kw: ["constraint", "constraints", "rang buoc", "gioi han", "limit", "limits"] },
  { type: "input",       label: "Dữ liệu vào",        kw: ["input", "dau vao", "du lieu vao", "du lieu", "input format", "standard input", "dinh dang vao"] },
  { type: "output",      label: "Kết quả ra",         kw: ["output", "dau ra", "ket qua", "ket qua ra", "output format", "standard output", "dinh dang ra"] },
  { type: "notes",       label: "Ghi chú",            kw: ["note", "notes", "ghi chu", "giai thich", "luu y", "explanation", "remark", "remarks"] },
  { type: "description", label: "Đề bài",             kw: ["de bai", "bai toan", "problem", "mo ta", "description", "statement", "noi dung", "tom tat de"] }
];

function classifyHeading(text) {
  const h = normHead(text);
  if (!h) return null;
  for (const r of SECTION_RULES) {
    for (const k of r.kw) {
      if (h === k || h.startsWith(k + " ") || h.includes(" " + k) || h.includes(k + " ") || h === k) return r;
    }
  }
  return null;
}

// Most real statements (pasted / OCR'd) have NO Markdown headings — section
// names are just a short plain line: "Đầu vào", "Giới hạn", "Đầu ra", "Ví dụ".
// Treat such a line as a section break, but ONLY when it's unmistakably a label
// (short, no sentence punctuation, and its normalized form is EXACTLY a known
// keyword) so a real sentence that merely starts with "Đầu vào…" is never split.
function classifyBareLabel(line) {
  const t = line.trim();
  if (!t || t.length > 28) return null;
  if (/[.!?…,:;]$/.test(t) && !/[:：]\s*$/.test(t)) return null; // sentences (but allow a trailing colon)
  const stripped = t.replace(/\s*[:：.\-–—]+\s*$/, "").trim();
  const h = normHead(stripped);
  if (!h) return null;
  for (const r of SECTION_RULES) {
    if (r.kw.includes(h)) return r;
  }
  return null;
}

// In example/sample sections the body is raw I/O, not prose. Turn "Input 01 …"
// style sub-labels + the data lines under them into bold labels + fenced code
// blocks so they render as proper monospace sample boxes instead of a ragged
// stack of one-line paragraphs.
// Example/sample renderer. Real sample sections are raw I/O under "Input 01 /
// Output 01" labels. Pair them and render Input ↔ Output SIDE BY SIDE (each its
// own monospace box with a copy button) — the layout a solver actually reads,
// instead of a vertical stack of ragged lines. Falls back to plain Markdown if
// no I/O structure is found.
const IO_IN_RE  = /^(sample\s+input|input|in|dữ\s*liệu\s*vào|vào)\s*#?\s*(\d*)\s*[:：]?$/i;
const IO_OUT_RE = /^(sample\s+output|output|out|kết\s*quả|ra)\s*#?\s*(\d*)\s*[:：]?$/i;
function trimData(arr) {
  return arr.join("\n")
    .replace(/^\n+/, "")
    // Judge pages often paste their Copy-button label as the first data line.
    // Strip only leading standalone chrome, never legitimate sample content.
    .replace(/^(?:(?:copy|copied)\s*\n)+/i, "")
    .replace(/\s+$/, "");
}
function renderExamplesGrid(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const preface = [];
  const blocks = [];
  let cur = null, started = false;
  for (const line of lines) {
    const t = line.trim();
    const isIn = IO_IN_RE.test(t), isOut = IO_OUT_RE.test(t);
    if (isIn || isOut) { if (cur) blocks.push(cur); cur = { kind: isIn ? "in" : "out", data: [] }; started = true; continue; }
    if (!started) preface.push(line);
    else if (cur) cur.data.push(line);
  }
  if (cur) blocks.push(cur);

  const pairs = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "in") {
      const o = blocks[i + 1] && blocks[i + 1].kind === "out" ? blocks[i + 1] : null;
      pairs.push({ inp: trimData(blocks[i].data), out: o ? trimData(o.data) : "" });
      if (o) i++;
    } else { pairs.push({ inp: "", out: trimData(blocks[i].data) }); }
  }
  if (!pairs.length) return renderMarkdown(text);

  const prefaceHtml = preface.join("\n").trim() ? renderMarkdown(preface.join("\n")) : "";
  const col = (label, body) =>
    `<div class="stmt-sample-col">` +
    `<div class="stmt-sample-label">${label}</div>` +
    `<div class="stmt-sample-box">` +
    `<button type="button" class="stmt-copy" title="Sao chép">Copy</button>` +
    `<pre class="stmt-sample-pre">${escapeHtml(body || "—")}</pre>` +
    `</div></div>`;
  const samples = pairs.map((p, i) => {
    const n = pairs.length > 1 ? " 0" + (i + 1) : " 01";
    return `<div class="stmt-sample">${col("Input" + n, p.inp)}${col("Output" + n, p.out)}</div>`;
  }).join("");
  return prefaceHtml + `<div class="stmt-samples">${samples}</div>`;
}

// Operation-spec detector. In the description, lines like "PUSHFRONT x : …" are
// the problem's command contract — the part a solver scans first. Render a run
// of them as a clean reference TABLE (mono command ↔ description) instead of a
// ragged stack of one-line paragraphs. A following continuation line (e.g.
// "Nếu dequeue rỗng, in ra NONE.") folds into the operation above it.
const OP_RE = /^([A-Z][A-Z0-9_]+(?:\s+[a-z][a-z0-9_]*)?)\s*[:：]\s*(\S.*)$/;
function renderDescription(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let prose = [];
  let ops = null;
  const flushProse = () => { const t = prose.join("\n").trim(); if (t) out.push(renderMarkdown(t)); prose = []; };
  const flushOps = () => {
    if (ops && ops.length) {
      out.push('<div class="stmt-ops">' + ops.map((o) =>
        `<div class="stmt-op"><code class="stmt-op-cmd">${escapeHtml(o.cmd)}</code>` +
        `<div class="stmt-op-desc">${renderMarkdown(o.desc)}</div></div>`).join("") + "</div>");
    }
    ops = null;
  };
  for (const line of lines) {
    const m = line.match(OP_RE);
    if (m) { flushProse(); (ops = ops || []).push({ cmd: m[1].trim().replace(/\s+/g, " "), desc: m[2].trim() }); continue; }
    if (!line.trim()) { if (!ops) prose.push(line); continue; }   // blanks don't break an ops run
    if (ops) { ops[ops.length - 1].desc += " " + line.trim(); continue; } // continuation note
    prose.push(line);
  }
  flushOps(); flushProse();
  return out.join("\n");
}

// Uppercase operation / constant tokens (PUSHFRONT, PRINTBACK, NONE, YES…) are
// the verbs of a CP statement; in plain prose they read as flat text. Wrap them
// in <code> so they scan as the commands they are — but only in real text nodes,
// never inside existing code / links / math (KaTeX) / headings.
const TOKEN_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
function highlightTokens(host) {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === "CODE" || tag === "PRE" || tag === "A" || tag === "H1" || tag === "H2" || tag === "H3") return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest(".katex, .stmt-section-label, pre, code")) return NodeFilter.FILTER_REJECT;
      TOKEN_RE.lastIndex = 0;
      return TOKEN_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  for (const node of targets) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0; TOKEN_RE.lastIndex = 0; let m;
    while ((m = TOKEN_RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const code = document.createElement("code");
      code.className = "stmt-cmd";
      code.textContent = m[0];
      frag.appendChild(code);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

function parseSections(raw) {
  const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let cur = { type: "description", label: "Đề bài", lines: [] };
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```+/.test(line)) inFence = !inFence;
    const hm = !inFence && line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const rule = classifyHeading(hm[2]);
      if (rule) {
        sections.push(cur);
        cur = { type: rule.type, label: rule.label, lines: [] };
        continue; // the heading becomes the section label chip, not body text
      }
    }
    // Plain-text label line (no Markdown heading) — the common real-world case.
    if (!inFence && !hm) {
      const bare = classifyBareLabel(line);
      if (bare) {
        sections.push(cur);
        cur = { type: bare.type, label: bare.label, lines: [] };
        continue;
      }
    }
    cur.lines.push(line);
  }
  sections.push(cur);
  return sections.filter((s) => s.lines.join("\n").trim().length > 0);
}

export 
function heroIllustration(app) {
  const hasScene = app.state.canvasScene;
  if (hasScene) {
    return `<figure class="stmt-neon-hero-figure">
      <div class="stmt-ai-canvas" id="stmt-neon-canvas-container"><canvas id="stmt-neon-canvas"></canvas></div>
    </figure>`;
  }
  if (app.state.meta && app.state.meta.imageUrl) {
    return `<figure class="stmt-neon-hero-figure"><img class="stmt-neon-hero-image" src="${escapeHtml(app.state.meta.imageUrl)}" /></figure>`;
  }
  return "";
}

function updateIllustrationButton(app) {
  const btn = document.getElementById("btn-ai-illustration");
  if (!btn) return;
  const hasScene = !!app.state.canvasScene;
  const showing = !!app.state.showIllustration;
  btn.textContent = hasScene ? (showing ? "⏸ Tắt animation" : "▶ Hiển thị animation") : "🎨 Tạo minh họa";
}

function renderStatement(app) {
  if (stopNeonCanvas) { stopNeonCanvas(); stopNeonCanvas = null; }
  const host = app.el.statementRendered;
  if (!host) return;
  const raw = app.el.ioStatement.value || "";
  if (!raw.trim()) {
    host.innerHTML = '<div class="stmt-empty">Chưa có đề bài. Bấm <b>Edit</b> để dán đề (Markdown được hỗ trợ), hoặc dùng <b>⤴ Image / PDF</b> · <b>📋 Paste</b> để nhập từ ảnh — AI sẽ tự phân tích &amp; tạo test.</div>';
    return;
  }
  
  const sections = parseSections(raw).map((s) => {
    const body = s.lines.join("\n");
    let html;
    if (s.type === "description") html = renderDescription(body);
    else if (s.type === "examples") html = renderExamplesGrid(body);
    else html = renderMarkdown(body);
    return { type: s.type, label: s.label, html };
  });

  // Extract meta
  const meta = app.state.meta || {};
  let usacoTier = meta.usacoTier || "";
  let cfRating = meta.cfRating || "";
  let diffText = usacoTier || (cfRating ? `CF ${cfRating}` : meta.difficulty || "Unrated");
  let topicName = (meta.topic || (meta.analysis && meta.analysis.tags && meta.analysis.tags[0]) || "").toLowerCase();
  if (topicName.length > 20) topicName = topicName.substring(0, 20) + "...";

  // Calculate Elo rating
  const dText = diffText.toLowerCase();
  let elo = (meta.analysis && meta.analysis.elo) ? parseInt(meta.analysis.elo) : 0;
  if (!elo) {
      if (/medium|vừa/i.test(dText)) elo = 1500;
      else if (/hard|khó/i.test(dText)) elo = 1900;
      else if (/extreme|chuyên|chuyên gia/i.test(dText)) elo = 2400;
      else elo = 1000;
  }
  
  let rankColor = "#a0a0a0"; let rankName = "Newbie";
  if (elo >= 1200) { rankColor = "#50ff96"; rankName = "Pupil"; }
  if (elo >= 1400) { rankColor = "#50c8ff"; rankName = "Specialist"; }
  if (elo >= 1600) { rankColor = "#a050ff"; rankName = "Expert"; }
  if (elo >= 1900) { rankColor = "#ff50a0"; rankName = "Candidate Master"; }
  if (elo >= 2100) { rankColor = "#ff9650"; rankName = "Master"; }
  if (elo >= 2300) { rankColor = "#ff5050"; rankName = "Grandmaster"; }
  if (elo >= 2400) { rankColor = "#ff0000"; rankName = "Legendary"; }

  const eloPercent = Math.min(100, Math.max(5, (elo / 3000) * 100));

  const descHtml = sections.find(s => s.type === "description")?.html || "";
  const heroVisualHtml = heroIllustration(app);
  const heroHtml = `
    <div class="stmt-neon-hero${heroVisualHtml ? " has-visual" : ""}">
      <div class="stmt-neon-hero-left">
        <div class="stmt-neon-hero-badges">
          <div class="stmt-neon-badge-problem"><span class="icon">📄</span> BÀI TOÁN</div>
          <div class="stmt-elo-chip" style="--rank-c: ${rankColor};">
            <span class="stmt-elo-dot"></span>
            <span class="stmt-elo-num">${elo}</span>
            <span class="stmt-elo-label">ELO</span>
            <span class="stmt-elo-sep"></span>
            <span class="stmt-elo-rank">${rankName}</span>
          </div>
        </div>
        <h1 class="stmt-neon-hero-title">${escapeHtml(meta.title || "Untitled")}</h1>
        <div class="stmt-neon-hero-desc">
          ${descHtml}
        </div>
      </div>
      ${heroVisualHtml ? `<div class="stmt-neon-hero-right">${heroVisualHtml}</div>` : ""}
    </div>
  `;

  // Description is already presented in the hero. Rendering it again below
  // creates a long duplicated block and breaks the intended reading order.
  const out = sections.filter((section) => section.type !== "description").map(sectionHtml).join("");
  host.innerHTML = `
    <div class="stmt-neon-shell">
      ${heroHtml}
      <div class="stmt-neon-secondary">
        ${out}
      </div>
    </div>
  `;
  highlightTokens(host);

  if (app.state.canvasScene) {
    const canvas = document.getElementById("stmt-neon-canvas");
    if (canvas) {
      if (typeof stopNeonCanvas === "function") stopNeonCanvas();
      stopNeonCanvas = initNeonCanvas(canvas, app.state.meta?.topic, app.state.meta, { animate: !!app.state.showIllustration });
    }
  }
  updateIllustrationButton(app);

}

function sectionHtml(s) {
  return `<section class="stmt-section stmt-${s.type}">
       <h2 class="stmt-section-label"><span class="stmt-section-icon" aria-hidden="true"></span><span>${escapeHtml(s.label)}</span></h2>
       <div class="stmt-section-body">${s.html}</div>
     </section>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Không đọc được tệp."));
    fr.readAsDataURL(file);
  });
}

function status(app, html) { app.el.statementStatus.innerHTML = html; }

// A spinning status line with an inline "✕ Hủy" button wired to `controller`.
// Aborting cancels only this pipeline/OCR request — sibling AI tasks (e.g. the
// Coach) keep running. (See aiCall's two-tier note in api.js.)
function busyStatus(app, label, controller) {
  status(app, `<span class="spinner"></span> ${label} <button type="button" class="stmt-cancel" title="Hủy tác vụ AI này">✕ Hủy</button>`);
  const btn = app.el.statementStatus.querySelector(".stmt-cancel");
  if (btn) btn.addEventListener("click", () => {
    try { controller.abort(); } catch { /* ignore */ }
    btn.disabled = true; btn.textContent = "Đang hủy…";
  });
}

function hashOf(s) {
  // Cheap stable hash for change-detection (not security).
  let h = 0;
  const str = String(s || "").trim();
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return h + ":" + str.length;
}

// Client-side sample extractor (mirror of backend) — used when re-opening a
// problem so the Examples card shows without re-calling the model.

function refreshExamples(app, text) {
  renderExamples(app, extractSamples(text));
}

function extractSamples(text) {
  text = String(text || "");
  if (!text.trim()) return [];
  const blocks = [];
  const re = /(^|\n)[^\n]*?\b(input|output)\b[^\n]*\n+```[a-zA-Z]*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push({ kind: m[2].toLowerCase(), body: m[3].replace(/\s+$/, "") });
  const samples = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "input") {
      const out = blocks[i + 1] && blocks[i + 1].kind === "output" ? blocks[i + 1] : null;
      samples.push({ input: blocks[i].body, output: out ? out.body : "" });
      if (out) i++;
    }
  }
  if (samples.length === 0) {
    const bare = [];
    const bre = /```[a-zA-Z]*\n([\s\S]*?)```/g;
    let b;
    while ((b = bre.exec(text)) !== null) bare.push(b[1].replace(/\s+$/, ""));
    for (let i = 0; i + 1 < bare.length; i += 2) samples.push({ input: bare[i], output: bare[i + 1] });
  }
  return samples.slice(0, 6);
}

// ---- Renderers -------------------------------------------------------------

// CF rating → a coarse colour band for the rating chip.
function ratingBand(r) {
  if (r >= 2100) return "r-hard";
  if (r >= 1600) return "r-gold";
  if (r >= 1200) return "r-silver";
  return "r-bronze";
}

export function renderAnalysis(app, a) {
  const card = document.getElementById("analysis-card");
  if (!card) return;
  if (!a || (!a.tomTat && !a.kyThuat?.length && !a.tags?.length && !a.doKho && !a.luuY && !a.doPhucTapYeuCauTime && !a.doPhucTapYeuCauSpace && !a.rangBuoc)) {
    card.classList.add("hidden");
    card.innerHTML = "";
    return;
  }
  card.classList.remove("hidden");
  
  // Premium Neon AI Analysis Layout
  const techChips = (a.kyThuat || []).map(t => `<span class="neon-ai-chip tech">${escapeHtml(t)}</span>`).join("");
  const tagChips = (a.tags || []).map(t => `<span class="neon-ai-chip tag">${escapeHtml(t)}</span>`).join("");
  
  let complexityHtml = "";
  if (a.doPhucTapYeuCauTime || a.doPhucTapYeuCauSpace) {
    complexityHtml = `<div class="neon-ai-complexity-row">`;
    if (a.doPhucTapYeuCauTime) complexityHtml += `<span class="neon-ai-chip time">⏱ ${escapeHtml(a.doPhucTapYeuCauTime)}</span>`;
    if (a.doPhucTapYeuCauSpace) complexityHtml += `<span class="neon-ai-chip space">💾 ${escapeHtml(a.doPhucTapYeuCauSpace)}</span>`;
    complexityHtml += `</div>`;
  }

  card.innerHTML = `
    <div class="neon-ai-analysis-container">
      <div class="neon-ai-header">
        <span class="icon">✨</span> Phân tích AI
      </div>
      
      <div class="neon-ai-grid">
        ${a.tomTat ? `
        <div class="neon-ai-panel summary-panel">
          <div class="neon-ai-panel-title">TÓM TẮT</div>
          <div class="neon-ai-panel-body">${escapeHtml(a.tomTat)}</div>
        </div>` : ''}
        
        ${(techChips || tagChips) ? `
        <div class="neon-ai-panel tags-panel">
          <div class="neon-ai-panel-title">KỸ THUẬT &amp; CHỦ ĐỀ</div>
          <div class="neon-ai-panel-body">
            ${techChips}
            ${tagChips}
          </div>
        </div>` : ''}
        
        ${(complexityHtml || a.rangBuoc) ? `
        <div class="neon-ai-panel constraints-panel">
          <div class="neon-ai-panel-title">ĐỘ PHỨC TẠP &amp; RÀNG BUỘC</div>
          <div class="neon-ai-panel-body">
            ${complexityHtml}
            ${a.rangBuoc ? `<div class="neon-ai-text-block">${escapeHtml(a.rangBuoc)}</div>` : ''}
          </div>
        </div>` : ''}
        
        ${a.luuY ? `
        <div class="neon-ai-panel warn-panel">
          <div class="neon-ai-panel-title">LƯU Ý / GÓC KHUẤT</div>
          <div class="neon-ai-panel-body highlight-warn">${escapeHtml(a.luuY)}</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

function renderExamples(app, samples) {
  const card = app.el.examplesCard;
  if (!samples || samples.length === 0) { card.classList.add("hidden"); card.innerHTML = ""; return; }
  card.classList.remove("hidden");
  card.innerHTML = `<div class="card-title">Ví dụ mẫu (${samples.length})</div>` +
    samples.map((s, i) => `
      <div class="ex-pair" data-ex-idx="${i}">
        <div class="ex-col">
          <div class="ex-head">Input ${i + 1}</div>
          <pre class="ex-pre">${escapeHtml(s.input || "")}</pre>
        </div>
        <div class="ex-col">
          <div class="ex-head">Output ${i + 1}</div>
          <pre class="ex-pre">${escapeHtml(s.output || "(—)")}</pre>
        </div>
        <div class="ex-explain-row">
          <button type="button" class="btn btn-ai btn-sm ex-explain-btn" data-ex="${i}">✨ Giải thích ví dụ này</button>
          <div class="ex-explain-body hidden" data-ex-body="${i}"></div>
        </div>
      </div>`).join("");

  // Per-example abort controllers so each explanation is independent.
  const aborts = new Array(samples.length).fill(null);

  card.querySelectorAll(".ex-explain-btn").forEach((btn) => {
    const idx = Number(btn.dataset.ex);
    const bodyEl = card.querySelector(`[data-ex-body="${idx}"]`);
    const label = btn.textContent;

    btn.addEventListener("click", async () => {
      // Mid-flight: abort this specific explanation.
      if (aborts[idx]) { aborts[idx].abort(); return; }
      if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }

      aborts[idx] = new AbortController();
      btn.textContent = "⏹ Dừng";
      btn.classList.add("btn-stop");
      bodyEl.classList.remove("hidden");
      bodyEl.innerHTML = `<span class="spinner"></span> AI đang phân tích ví dụ…`;

      try {
        const res = await api.aiExplainTestCase({
          problemId: app.state.currentId,
          input: samples[idx].input || "",
          output: samples[idx].output || ""
        }, { signal: aborts[idx].signal });

        bodyEl.innerHTML = renderMarkdown(res.explanation || "(không có phản hồi)");
        btn.textContent = "✓ Đã giải thích";
        btn.disabled = true;
      } catch (err) {
        if (err && err.aborted) {
          bodyEl.innerHTML = `<span class="muted">⏹ Đã dừng giải thích.</span>`;
        } else {
          bodyEl.innerHTML = `<span class="mk-bad">${escapeHtml(err.message)}</span>`;
          if (err.data && err.data.code === "NO_KEY") {
            app.setTab("settings");
            app.toast("Chưa có API key — mở Settings.", "err");
          }
        }
      } finally {
        aborts[idx] = null;
        if (!btn.disabled) {
          btn.textContent = label;
          btn.classList.remove("btn-stop");
        } else {
          btn.classList.remove("btn-stop");
        }
      }
    });
  });
}

function renderGenTests(app, tests, notes) {
  const card = app.el.genTestsCard;
  card.classList.remove("hidden");
  app.state.aiTests = tests || [];
  const note = (notes || []).length
    ? `<div class="gt-notes">${notes.map((n) => `<div>${escapeHtml(n)}</div>`).join("")}</div>` : "";
  if (!tests || tests.length === 0) {
    card.innerHTML = `<div class="card-title">Test do AI tạo</div>${note}
      <div class="muted" style="font-size:12px">AI chưa tạo được test nào. Thử bổ sung đề bài rõ hơn.</div>`;
    return;
  }
  card.innerHTML = `
    <div class="card-title gt-title">
      <span>Test do AI tạo · <b>${tests.length}</b></span>
      <label class="gt-selall"><input type="checkbox" id="gt-select-all" checked /> Chọn tất cả</label>
    </div>
    ${note}
    <div class="gt-list">
      ${tests.map((t, i) => `
        <div class="gt-card" data-i="${i}">
          <div class="gt-card-head">
            <input type="checkbox" class="gt-pick" checked />
            <input type="text" class="gt-name" value="${escapeHtml(t.name)}" />
            ${t.expectedKnown ? "" : '<span class="gt-warn" title="Chưa có đáp án kiểm chứng">NO EXPECTED</span>'}
          </div>
          ${t.reason ? `<div class="gt-reason">${escapeHtml(t.reason)}</div>` : ""}
          <div class="gt-io">
            <label>Input<textarea class="gt-input" spellcheck="false">${escapeHtml(t.input)}</textarea></label>
            <label>Expected<textarea class="gt-expected" spellcheck="false">${escapeHtml(t.expected)}</textarea></label>
          </div>
        </div>`).join("")}
    </div>
    <div class="gt-foot">
      <button id="gt-apply" class="btn btn-primary btn-sm" type="button">➕ Thêm test đã chọn vào bộ</button>
    </div>`;

  const selAll = card.querySelector("#gt-select-all");
  selAll.addEventListener("change", () => {
    card.querySelectorAll(".gt-pick").forEach((cb) => { cb.checked = selAll.checked; });
  });
  card.querySelector("#gt-apply").addEventListener("click", () => applyGenTests(app, card));
}

async function applyGenTests(app, card) {
  if (!app.state.currentId) return;
  const chosen = [...card.querySelectorAll(".gt-card")].filter((c) => c.querySelector(".gt-pick").checked);
  if (chosen.length === 0) { app.toast("Chọn ít nhất một test.", "err"); return; }
  const btn = card.querySelector("#gt-apply");
  btn.disabled = true; btn.textContent = "Đang thêm…";
  let added = 0;
  try {
    for (const c of chosen) {
      const src = app.state.aiTests[Number(c.dataset.i)] || {};
      await api.addTest(app.state.currentId, {
        name: c.querySelector(".gt-name").value.trim() || src.name,
        input: c.querySelector(".gt-input").value,
        expected: c.querySelector(".gt-expected").value,
        reason: src.reason || "",
        generatedBy: "ai"
      });
      added += 1;
    }
    app.toast(`Đã thêm ${added} test`, "ok");
    await app.reloadTests();
    card.classList.add("hidden"); card.innerHTML = "";
    app.setTab("tests");
  } catch (err) {
    app.toast(err.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "➕ Thêm test đã chọn vào bộ";
  }
}

// Ensure a problem is open before pasting/importing — auto-create an untitled
// one when none is selected, so "paste → ready" needs no manual New click.
async function ensureProblem(app) {
  if (app.state.currentId) return true;
  try {
    const stamp = new Date().toLocaleString();
    const { problem } = await api.createProblem({ title: `Untitled — ${stamp}` });
    await app.refreshProblems();
    await app.loadProblem(problem.id);
    return !!app.state.currentId;
  } catch (err) {
    app.toast(err.message, "err");
    return false;
  }
}

// ---- Pipeline --------------------------------------------------------------

async function runPipeline(app, { force = false, regen = false } = {}) {
  if (!app.state.currentId) return;
  const statement = app.el.ioStatement.value;
  if (!statement.trim()) {
    if (force) app.toast("Đề bài đang trống.", "err");
    return;
  }
  const h = hashOf(statement);
  if (!force && h === app.state._processedHash) return; // unchanged → skip
  if (app.state._pipelineBusy) { app.state._pipelinePending = true; return; }

  app.state._pipelineBusy = true;
  app.state._processedHash = h;
  const pipelineAbort = new AbortController();
  app.state._pipelineAbort = pipelineAbort;
  busyStatus(app, "Đang phân tích đề &amp; tạo test…", pipelineAbort);
  app.el.genTestsCard.classList.remove("hidden");
  app.el.genTestsCard.innerHTML = `<div class="card-title">Test do AI tạo</div><div class="muted" style="font-size:12px"><span class="spinner"></span> Đang tạo test…</div>`;

  try {
    await api.saveStatement(app.state.currentId, statement);
    app.state.savedStatement = statement;
    renderStatement(app);
    refreshExamples(app, statement);

    const res = await api.aiProcess({
      problemId: app.state.currentId,
      statement,
      code: app.getEditorValue(),
      regen // explicit "re-analyze / regenerate" bypasses the server-side disk cache
    }, { signal: pipelineAbort.signal });

    if (res.analysis) {
      renderAnalysis(app, res.analysis);
      if (app.state.meta) app.state.meta.analysis = res.analysis;
      if (app.bus) app.bus.emit("analysis:done");
      try { const { problem } = await api.getProblem(app.state.currentId); app.state.meta = problem; } catch { /* non-fatal */ }
      renderMeta(app);
      app.refreshProblems();
    } else if (res.analysisError) {
      status(app, `<span class="warn-text">Phân tích lỗi: ${escapeHtml(res.analysisError)}</span>`);
    }

    renderExamples(app, res.samples || extractSamples(statement));

    if (res.testsError) {
      app.el.genTestsCard.classList.remove("hidden");
      app.el.genTestsCard.innerHTML = `<div class="card-title">Test do AI tạo</div><div class="warn-text" style="font-size:12px">Không tạo được test: ${escapeHtml(res.testsError)}</div>`;
      status(app, `<span class="warn-text">Tạo test lỗi: ${escapeHtml(res.testsError)}</span>`);
    } else {
      const tests = res.tests || [];
      const autoAddable = tests.filter((t) => t.expectedKnown);
      const unverified = tests.filter((t) => !t.expectedKnown);
      // On a fresh problem (no tests yet), auto-add the execution-verified tests
      // silently and only surface the unverified ones for manual review.
      let added = 0;
      if (autoAddable.length && (app.state.tests || []).length === 0) {
        try {
          for (const t of autoAddable) {
            await api.addTest(app.state.currentId, { 
              name: t.name, 
              input: t.input, 
              expected: t.expected, 
              reason: t.reason || "", 
              generatedBy: "ai",
              provenance: t.provenance,
              statementHash: t.statementHash
            });
            added += 1;
          }
          await app.reloadTests();
        } catch (err) { app.toast(err.message, "err"); }
      }
      if (added > 0) {
        if (unverified.length) renderGenTests(app, unverified, res.notes);
        else { app.el.genTestsCard.classList.add("hidden"); app.el.genTestsCard.innerHTML = ""; }
        status(app, `✓ Phân tích xong · đã thêm <b>${added}</b> test đã kiểm chứng${unverified.length ? ` · <b>${unverified.length}</b> test cần xem lại bên dưới` : ""}.`);
      } else {
        renderGenTests(app, tests, res.notes);
        status(app, `✓ Đã phân tích &amp; tạo <b>${tests.length}</b> test.`);
      }
      if (app.playSound) app.playSound("complete");
      if (app.bus) app.bus.emit("tests:generated");
    }
  } catch (err) {
    app.state._processedHash = null; // allow retry
    app.el.genTestsCard.classList.add("hidden");
    app.el.genTestsCard.innerHTML = "";
    if (err && err.aborted) {
      status(app, `Đã hủy phân tích đề &amp; tạo test.`);
    } else {
      status(app, `<span class="warn-text">${escapeHtml(err.message)}</span>`);
      if (err.data && err.data.code === "NO_KEY") {
        app.state._aiAutoDisabled = true;
        app.toast("Chưa có API key — mở Settings để nhập.", "err");
        app.setTab("settings");
      }
    }
  } finally {
    app.state._pipelineBusy = false;
    app.state._pipelineAbort = null;
    if (app.state._pipelinePending) { app.state._pipelinePending = false; runPipeline(app, { force: true }); }
  }
}

// OCR an image/PDF data URL, append the markdown, then auto-run the pipeline.
async function runOcr(app, dataUrl, mimeType, fileName) {
  if (!(await ensureProblem(app))) return;
  app.showProblemView();
  const ocrAbort = new AbortController();
  busyStatus(app, `Đang OCR ${escapeHtml(fileName || mimeType || "ảnh")} …`, ocrAbort);
  try {
    const res = await api.aiOcr({ dataUrl, mimeType, fileName }, { signal: ocrAbort.signal });
    const md = (res.markdown || "").trim();
    if (!md) { status(app, `<span class="warn-text">OCR failed: không có nội dung.</span>`); return; }
    const cur = app.el.ioStatement.value.trim();
    app.el.ioStatement.value = cur ? cur + "\n\n---\n\n" + md : md;
    await api.saveStatement(app.state.currentId, app.el.ioStatement.value);
    app.state.savedStatement = app.el.ioStatement.value;
    app.state._aiAutoDisabled = false;
    if (app.setStatementMode) app.setStatementMode("read");
    const viaLabel = { tesseract: "Tesseract (local)", markitdown: "MarkItDown" }[res.via] || res.via || "OCR";
    const cleanLabel = res.cleaned ? " · đã làm sạch tiếng Việt" : "";
    status(app, `OCR xong (${viaLabel}${cleanLabel}). Đang phân tích…`);
    await runPipeline(app, { force: true });
  } catch (err) {
    if (err && err.aborted) { status(app, `Đã hủy OCR.`); return; }
    status(app, `<span class="warn-text">${escapeHtml(err.message)}</span>`);
    if (err.data && err.data.code === "NO_KEY") app.setTab("settings");
  }
}

// Pull an image out of a clipboard/drag DataTransfer or ClipboardItem list.
async function imageFromClipboardItems(items) {
  for (const it of items || []) {
    if (it && it.type && it.type.startsWith("image/")) {
      const blob = it.getAsFile ? it.getAsFile() : it;
      if (blob) return { blob, type: it.type };
    }
  }
  return null;
}

// ---- Public: render on problem load ---------------------------------------


export async function requestCanvasIllustration(app, opts = {}) {
  const manual = opts.manual || false;
  if (!manual && !(app.state.aiSettings && app.state.aiSettings.illustrationEnabled)) return null;
  if (app.state._illustrationBusy) return;
  const btn = document.getElementById("btn-ai-illustration");
  if (btn) { btn.disabled = true; btn.textContent = "Đang tạo minh hoạ…"; }
  app.state._illustrationBusy = true;
  try {
    const res = await api.aiCanvasIllustration(app.state.meta?.topic || app.state.meta?.title || "Data Structures");
    if (res && res.scene) {
      app.state.canvasScene = res.scene;
      app.state.showIllustration = true;
      renderStatement(app);
    }
  } catch (e) {
    console.error(e);
  } finally {
    app.state._illustrationBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = "✨ Tạo minh hoạ"; }
  }
}

export function loadProblemView(app) {
  app.state._processedHash = hashOf(app.el.ioStatement.value);
  app.state._pipelineBusy = false;
  app.state._pipelinePending = false;
  app.state.showIllustration = false;
  const a = app.state.meta && app.state.meta.analysis;
  renderAnalysis(app, a);
  renderExamples(app, extractSamples(app.el.ioStatement.value));
  app.el.genTestsCard.classList.add("hidden");
  app.el.genTestsCard.innerHTML = "";
  // Default to the rendered reading page when there's a statement, else Edit.
  const hasStmt = !!app.el.ioStatement.value.trim();
  if (app.setStatementMode) app.setStatementMode(hasStmt ? "read" : "edit");
  else renderStatement(app);
}

// ---- Init ------------------------------------------------------------------

export function initStatement(app) {
  const { el } = app;

  // Copy buttons on sample I/O boxes (event-delegated so it survives re-renders).
  if (el.statementRendered) {
    el.statementRendered.addEventListener("click", (e) => {
      const btn = e.target.closest(".stmt-copy");
      if (!btn) return;
      const col = btn.closest(".stmt-sample-col");
      const pre = col && col.querySelector(".stmt-sample-pre");
      if (!pre) return;
      navigator.clipboard.writeText(pre.textContent).then(() => {
        btn.textContent = "✓"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = "⧉"; btn.classList.remove("done"); }, 1200);
      }).catch(() => { if (app.toast) app.toast("Không copy được", "err"); });
    });
  }

  app.generateIllustration = () => {
    if (app.state.canvasScene) {
      app.state.showIllustration = !app.state.showIllustration;
      renderStatement(app);
      return;
    }
    return requestCanvasIllustration(app, { manual: true });
  };
  const btnAiIllustration = document.getElementById("btn-ai-illustration");
  if (btnAiIllustration) btnAiIllustration.addEventListener("click", app.generateIllustration);

  app.showProblemView = () => app.setView("problem");
  app.runStatementPipeline = () => { app.showProblemView(); runPipeline(app, { force: true }); };
  app.renderStatement = () => renderStatement(app);

  // Read = rendered problem page (default when a statement exists);
  // Edit = raw Markdown textarea (the source of truth).
  app.setStatementMode = (mode) => {
    const edit = mode === "edit";
    app.state.statementMode = edit ? "edit" : "read";
    el.ioStatement.classList.toggle("hidden", !edit);
    if (app.el.statementRendered) app.el.statementRendered.classList.toggle("hidden", edit);
    const tg = document.getElementById("stmt-mode-toggle");
    if (tg) tg.querySelectorAll(".stmt-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === app.state.statementMode));
    if (edit) setTimeout(() => el.ioStatement.focus(), 0);
    else renderStatement(app);
  };
  const modeToggle = document.getElementById("stmt-mode-toggle");
  if (modeToggle) {
    modeToggle.querySelectorAll(".stmt-mode-btn").forEach((b) => {
      b.addEventListener("click", () => app.setStatementMode(b.dataset.mode));
    });
  }

  // Debounced auto-pipeline as the statement changes.
  let debounceTimer = null;
  const scheduleAuto = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (app.state._aiAutoDisabled) return;
      const v = el.ioStatement.value;
      if (v.trim().length < 30) return;            // too short to be a real statement
      if (hashOf(v) === app.state._processedHash) return;
      runPipeline(app, { force: false });
    }, 1500);
  };
  let samplePreviewFrame = null;
  const scheduleSamplePreview = () => {
    if (samplePreviewFrame) cancelAnimationFrame(samplePreviewFrame);
    samplePreviewFrame = requestAnimationFrame(() => {
      samplePreviewFrame = null;
      refreshExamples(app, el.ioStatement.value);
    });
  };
  el.ioStatement.addEventListener("input", () => {
    scheduleSamplePreview();
    scheduleAuto();
  });

  el.btnSaveStatement.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    try {
      await api.saveStatement(app.state.currentId, el.ioStatement.value);
      app.state.savedStatement = el.ioStatement.value;
      renderStatement(app);
      app.toast("Đã lưu đề bài", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });

  el.btnClearStatement.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    if (el.ioStatement.value.trim() && !confirm("Xoá nội dung đề bài?")) return;
    el.ioStatement.value = "";
    app.state._processedHash = hashOf("");
    el.analysisCard.classList.add("hidden"); el.analysisCard.innerHTML = "";
    el.examplesCard.classList.add("hidden"); el.examplesCard.innerHTML = "";
    el.genTestsCard.classList.add("hidden"); el.genTestsCard.innerHTML = "";
    if (app.setStatementMode) app.setStatementMode("edit");
    status(app, "Dán ảnh (Ctrl+V), tải ảnh/PDF, hoặc gõ đề bài — AI sẽ tự phân tích &amp; tạo test.");
    try { await api.saveStatement(app.state.currentId, ""); app.state.savedStatement = ""; } catch (err) { app.toast(err.message, "err"); }
  });

  // Upload image / PDF.
  el.btnUploadImage.addEventListener("click", () => el.imageFile.click());
  el.imageFile.addEventListener("change", async () => {
    const file = el.imageFile.files[0];
    el.imageFile.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await runOcr(app, dataUrl, file.type, file.name);
    } catch (err) { app.toast(err.message, "err"); }
  });

  // Paste button — read image from the async clipboard API.
  el.btnPasteImage.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) { app.toast("Nhấn Ctrl+V để dán ảnh.", "err"); return; }
      const clipItems = await navigator.clipboard.read().catch((err) => {
        if (err.name === "NotAllowedError") {
          throw new Error("Trình duyệt không cho phép đọc clipboard. Hãy cấp quyền hoặc nhấn Ctrl+V trực tiếp.");
        }
        throw new Error("Clipboard trống hoặc không đọc được. Hãy chụp màn hình trước.");
      });
      let foundImg = false;
      for (const item of clipItems || []) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const dataUrl = await fileToDataUrl(blob);
          await runOcr(app, dataUrl, type, "pasted-image");
          foundImg = true;
          break;
        }
      }
      if (!foundImg) {
        app.toast("Clipboard không có ảnh. Hãy chụp màn hình trước.", "err");
      }
    } catch (err) {
      app.toast(err.message || "Clipboard bị chặn — bấm vào ô đề bài rồi nhấn Ctrl+V.", "err");
    }
  });

  // Ctrl+V directly into the statement box.
  el.ioStatement.addEventListener("paste", async (e) => {
    const found = await imageFromClipboardItems(e.clipboardData && e.clipboardData.items);
    if (found) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(found.blob);
      await runOcr(app, dataUrl, found.type, "pasted-image");
    }
  });

  // Global Ctrl+V — paste a screenshot from anywhere (Snipping Tool / Lightshot /
  // Windows clipboard) as long as a problem is open and no text field is focused.
  document.addEventListener("paste", async (e) => {
    const t = e.target;
    const typing = t && (t === el.codeEditor || (t.tagName === "INPUT") || (t.tagName === "TEXTAREA" && t !== el.ioStatement));
    if (typing) return;               // let real text fields handle their own paste
    if (t === el.ioStatement) return; // handled by the listener above
    const found = await imageFromClipboardItems(e.clipboardData && e.clipboardData.items);
    if (found) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(found.blob);
      await runOcr(app, dataUrl, found.type, "pasted-image"); // runOcr auto-creates a problem if none open
    }
  });

  // Drag & drop an image file onto the statement box.
  el.ioStatement.addEventListener("dragover", (e) => { e.preventDefault(); });
  el.ioStatement.addEventListener("drop", async (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && /^image\//.test(file.type)) {
      e.preventDefault();
      const dataUrl = await fileToDataUrl(file);
      await runOcr(app, dataUrl, file.type, file.name);
    }
  });

  el.btnAnalyze.addEventListener("click", () => { app.state._aiAutoDisabled = false; runPipeline(app, { force: true, regen: true }); });
  el.btnAiGenStatement.addEventListener("click", () => { app.state._aiAutoDisabled = false; runPipeline(app, { force: true, regen: true }); });

  let templateAbort = null;
  if (el.btnAiTemplate) {
    el.btnAiTemplate.addEventListener("click", async () => {
      if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
      if (templateAbort) { templateAbort.abort(); return; }

      const statement = el.ioStatement.value.trim();
      if (!statement) { app.toast("Đề bài đang trống — cần đề bài để sinh template.", "err"); return; }

      templateAbort = new AbortController();
      el.btnAiTemplate.textContent = "⏹ Dừng";
      el.btnAiTemplate.classList.add("btn-stop");
      status(app, `<span class="spinner"></span> AI đang sinh template code…`);

      try {
        const res = await api.aiTemplate({
          problemId: app.state.currentId,
          statement
        }, { signal: templateAbort.signal });

        if (res.code) {
          app.setEditorValue(res.code);
          app.setView("code");
          app.toast("Đã sinh & nạp template thành công!", "ok");
          if (app.playSound) app.playSound("complete");
          status(app, `✓ Đã sinh template thành công.`);
        } else {
          throw new Error(res.error || "Không nhận được code từ AI.");
        }
      } catch (err) {
        if (err && err.aborted) {
          status(app, `Đã hủy sinh template.`);
        } else {
          app.toast(err.message, "err");
          status(app, `<span class="warn-text">Sinh template lỗi: ${escapeHtml(err.message)}</span>`);
          if (err.data && err.data.code === "NO_KEY") {
            app.setTab("settings");
            app.toast("Chưa có API key — mở Settings.", "err");
          }
        }
      } finally {
        templateAbort = null;
        el.btnAiTemplate.textContent = "📝 Sinh Template";
        el.btnAiTemplate.classList.remove("btn-stop");
      }
    });
  }
}
