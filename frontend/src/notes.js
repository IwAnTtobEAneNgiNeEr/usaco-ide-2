// notes.js — markdown notes with a live preview toggle and a CP template.

import { api } from "./api.js";
import { escapeHtml } from "./md.js";

const TEMPLATE = [
  "# Problem Summary",
  "",
  "# Intended Solution",
  "",
  "# Complexity",
  "- Time: ",
  "- Space: ",
  "",
  "# Mistakes",
  "",
  "# Learnings",
  ""
].join("\n");


// Minimal, safe Markdown → HTML (headings, bold/italic, inline code, fenced code, lists, links).
function renderMarkdown(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inCode = false;
  let inList = false;
  const inline = (t) =>
    escapeHtml(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (!inCode) { if (inList) { html += "</ul>"; inList = false; } html += "<pre>"; inCode = true; }
      else { html += "</pre>"; inCode = false; }
      continue;
    }
    if (inCode) { html += escapeHtml(raw) + "\n"; continue; }
    const h = raw.match(/^(#{1,3})\s+(.*)$/);
    if (h) { if (inList) { html += "</ul>"; inList = false; } html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    const li = raw.match(/^\s*[-*]\s+(.*)$/);
    if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (raw.trim() === "") html += "";
    else html += `<p>${inline(raw)}</p>`;
  }
  if (inList) html += "</ul>";
  if (inCode) html += "</pre>";
  return html;
}

export function initNotes(app) {
  const { el } = app;
  let previewing = false;

  el.btnNotesTemplate.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    const cur = el.ioNotes.value.trim();
    if (cur && !confirm("Insert the notes template at the top?")) return;
    el.ioNotes.value = cur ? TEMPLATE + "\n" + cur : TEMPLATE;
    try { await api.saveNotes(app.state.currentId, el.ioNotes.value); app.state.savedNotes = el.ioNotes.value; } catch (e) { app.toast(e.message, "err"); }
    if (previewing) el.notesPreview.innerHTML = renderMarkdown(el.ioNotes.value);
  });

  el.btnNotesPreview.addEventListener("click", () => {
    previewing = !previewing;
    if (previewing) {
      el.notesPreview.innerHTML = renderMarkdown(el.ioNotes.value);
      el.notesPreview.classList.remove("hidden");
      el.ioNotes.classList.add("hidden");
      el.btnNotesPreview.textContent = "Edit";
    } else {
      el.notesPreview.classList.add("hidden");
      el.ioNotes.classList.remove("hidden");
      el.btnNotesPreview.textContent = "Preview";
    }
  });
}
