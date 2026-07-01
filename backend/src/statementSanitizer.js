"use strict";

const PRESERVED_HEADINGS = /^(Äá» bÃ i|Dá»¯ liá»‡u vÃ o|Dá»¯ liá»‡u ra|Äáº§u vÃ o|Äáº§u ra|Giá»›i háº¡n|RÃ ng buá»™c|VÃ­ dá»¥|Input|Output|Explanation|Ghi chÃº)\s*:?​?$/iu;
const NOISE = [
  /^(copy|copied)\s*$/iu,
  /^trang\s+\d+(?:\s*\/\s*\d+)?\s*$/iu,
  /^(BÃ¬nh luáº­n|Gá»­i bÃ i giáº£i|BÃ¡o cÃ¡o váº¥n Ä‘á»)\s*$/iu,
  /^(ngÃ´n ngá»¯|languages?)\s*:?​?$/iu,
  /^(c\+\+|java|python|pascal|javascript|rust|go)\s*$/iu
];

function sanitizeStatement(text) {
  const removedNoiseLines = [];
  const kept = [];
  let previousBlank = false;
  const chromeCounts = new Map();
  for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (PRESERVED_HEADINGS.test(line)) {
      kept.push(raw.trimEnd()); previousBlank = false; continue;
    }
    if (NOISE.some((pattern) => pattern.test(line))) {
      removedNoiseLines.push(raw); continue;
    }
    if (!line) {
      if (previousBlank) removedNoiseLines.push(raw);
      else kept.push("");
      previousBlank = true; continue;
    }
    previousBlank = false;
    const key = line.toLocaleLowerCase("vi");
    const count = (chromeCounts.get(key) || 0) + 1;
    chromeCounts.set(key, count);
    if (count > 2 && line.length < 100) { removedNoiseLines.push(raw); continue; }
    kept.push(raw.trimEnd());
  }
  return { text: kept.join("\n").trim(), removedNoiseLines };
}

module.exports = { sanitizeStatement };
