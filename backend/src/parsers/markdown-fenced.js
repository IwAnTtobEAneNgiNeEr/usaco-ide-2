"use strict";

// parsers/markdown-fenced.js — Default parser for Markdown statements with
// fenced code blocks labeled "input" / "output". Covers USACO, Codeforces,
// and most competitive programming problem formats.

const id = "markdown-fenced";
const name = "Markdown (fenced code blocks)";

function detect(text) {
  if (!text || !text.trim()) return 0;
  const hasFenced = /```/.test(text);
  const hasIO = /\b(input|output)\b/i.test(text);
  if (hasFenced && hasIO) return 0.8;
  if (hasFenced) return 0.4;
  return 0.1;
}

// Strip stray "Copy" button text from sample bodies (pasted from OJ copy buttons).
function cleanSampleBody(s) {
  return String(s || "").replace(/^Copy\s*\n/i, "").replace(/\s+$/, "");
}

function extractSamples(text) {
  const s = String(text || "");
  if (!s.trim()) return [];

  const blocks = [];
  const re = /(^|\n)[^\n]*?\b(input|output)\b[^\n]*\n+```[a-zA-Z]*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    blocks.push({ kind: m[2].toLowerCase(), body: cleanSampleBody(m[3]) });
  }

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
    while ((b = bre.exec(s)) !== null) bare.push(cleanSampleBody(b[1]));
    for (let i = 0; i + 1 < bare.length; i += 2) {
      samples.push({ input: bare[i], output: bare[i + 1] });
    }
  }
  return samples.slice(0, 6);
}

module.exports = { id, name, detect, extractSamples };
