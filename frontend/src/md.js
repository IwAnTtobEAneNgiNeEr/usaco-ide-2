// md.js — shared Markdown → sanitized HTML renderer for AI output.
//
// window.marked (if loaded) parses the Markdown; the result is then sanitized
// with a small allowlist-style DOM walk before it ever reaches innerHTML, so a
// hostile/buggy model response can't inject live script. No dependency needed.
// Falls back to escaped plain text when marked is unavailable.

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

// Render AI Markdown to safe HTML. Always safe to assign to innerHTML.
export function renderMarkdown(text) {
  const src = String(text == null ? "" : text);
  if (window.marked && typeof window.marked.parse === "function") {
    try { return sanitizeHtml(window.marked.parse(src)); } catch { /* fall through */ }
  }
  return `<pre class="md-fallback">${escapeHtml(src)}</pre>`;
}
