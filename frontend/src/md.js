// md.js — shared Markdown → sanitized HTML renderer.
//
// A small, dependency-free Markdown renderer (headings, paragraphs, bold/italic,
// inline code, fenced code blocks, ordered/unordered lists, blockquotes, simple
// pipe tables, hr, links). window.marked is used instead when present; either
// way the result is run through a strict allowlist DOM-walk before it ever
// reaches innerHTML, so a hostile/buggy model response can't inject live script.

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "LINK", "META", "BASE"]);

function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
  const doomed = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (DROP_TAGS.has(node.tagName)) { doomed.push(node); continue; }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) { node.removeAttribute(attr.name); continue; }
      if (name === "href" || name === "src" || name === "xlink:href") {
        const v = String(attr.value || "").trim().toLowerCase();
        if (v.startsWith("javascript:") || v.startsWith("data:") || v.startsWith("vbscript:")) {
          node.removeAttribute(attr.name);
        }
      }
    }
  }
  for (const node of doomed) node.remove();
  return tpl.innerHTML;
}

// ---- Inline spans ----------------------------------------------------------
// `text` is raw Markdown; it is HTML-escaped first, then inline markup applied.
// Underscore-based emphasis is intentionally NOT supported — competitive
// statements are full of subscripts (a_i, n_max) we must not mangle.
function renderInline(text) {
  let s = escapeHtml(text);
  // Protect inline code so its contents aren't re-formatted. The @@CODEn@@
  // sentinel survives the emphasis/link passes and never occurs in real text.
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "@@CODE" + (codes.length - 1) + "@@"; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/@@CODE(\d+)@@/g, (_, i) => "<code>" + codes[Number(i)] + "</code>");
  return s;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const isBlank = (l) => !l.trim();
const startsBlock = (l) =>
  /^\s*```+/.test(l) || /^(#{1,6})\s+/.test(l) || /^\s*([-*_])\1{2,}\s*$/.test(l) ||
  /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^\s*>\s?/.test(l);

// ---- Block renderer --------------------------------------------------------
function mdToHtml(src) {
  const lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // Fenced code block.
    if (/^\s*```+/.test(line)) {
      i++;
      const buf = [];
      while (i < n && !/^\s*```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      if (i < n) i++; // consume closing fence
      out.push('<pre class="md-pre"><code>' + escapeHtml(buf.join("\n")) + "</code></pre>");
      continue;
    }

    // Heading.
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lv = h[1].length; out.push("<h" + lv + ">" + renderInline(h[2].trim()) + "</h" + lv + ">"); i++; continue; }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < n && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push("<blockquote>" + mdToHtml(buf.join("\n")) + "</blockquote>");
      continue;
    }

    // Pipe table (needs a |---|---| separator on the next line).
    if (line.includes("|") && i + 1 < n &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      let t = '<table class="md-table"><thead><tr>' +
        header.map((c) => "<th>" + renderInline(c) + "</th>").join("") + "</tr></thead><tbody>";
      while (i < n && lines[i].includes("|") && !isBlank(lines[i])) {
        t += "<tr>" + splitRow(lines[i]).map((c) => "<td>" + renderInline(c) + "</td>").join("") + "</tr>";
        i++;
      }
      out.push(t + "</tbody></table>");
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf = [];
      while (i < n && /^\s*[-*+]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push("<ul>" + buf.map((b) => "<li>" + renderInline(b) + "</li>").join("") + "</ul>");
      continue;
    }

    // Ordered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf = [];
      while (i < n && /^\s*\d+[.)]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      out.push("<ol>" + buf.map((b) => "<li>" + renderInline(b) + "</li>").join("") + "</ol>");
      continue;
    }

    // Paragraph — gather consecutive lines until a blank line or a block starter.
    const buf = [line];
    i++;
    while (i < n && !isBlank(lines[i]) && !startsBlock(lines[i])) { buf.push(lines[i]); i++; }
    out.push("<p>" + renderInline(buf.join("\n")).replace(/\n/g, "<br>") + "</p>");
  }
  return out.join("\n");
}

// Render Markdown to safe HTML. Always safe to assign to innerHTML.
export function renderMarkdown(text) {
  const src = String(text == null ? "" : text);
  if (window.marked && typeof window.marked.parse === "function") {
    try { return sanitizeHtml(window.marked.parse(src)); } catch { /* fall through */ }
  }
  try { return sanitizeHtml(mdToHtml(src)); }
  catch { return '<pre class="md-fallback">' + escapeHtml(src) + "</pre>"; }
}

export function renderMath(el) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
          {left: '\\[', right: '\\]', display: true}
        ],
        throwOnError: false
      });
    } catch (err) {
      console.error("Math render failed:", err);
    }
  }
}

export { mdToHtml };
