// sample-extract.js — pure helpers for the Statement / Tests UI patch.
//
// Pure (no DOM, no imports) so it is unit-tested with `node --test`. Three
// concerns live here, all data-in/data-out:
//   • provenanceLabel()    — map a backend trust-layer provenance string to a
//                            compact chip { short, full, tone } for the Tests panel.
//   • cleanStatementNoise()— strip accidental webpage chrome (Copy / copied /
//                            Trang X / Bình luận …) from pasted/copied text.
//   • extractSamples()     — pull clean { input, output } example pairs out of a
//                            statement (fenced ```code``` blocks AND the plain
//                            "Input / Output" label format real pages paste as).
//
// Nothing here mutates input or removes real problem content.

// ---- Task 2: compact provenance labels ------------------------------------
// The backend trust layer tags every test with a verbose provenance string.
// Showing that raw inside a compact row is noisy; map it to a short chip and
// keep the full string for the tooltip/detail view.
const PROVENANCE_MAP = {
  "official-sample": { short: "Official", tone: "official" },
  "user-provided": { short: "User", tone: "user" },
  "generated-unverified": { short: "AI ?", tone: "unverified" },
  "generated-self-consistency-check": { short: "AI ✓", tone: "checked" },
  "verified-by-reference-solution": { short: "Verified", tone: "verified" },
  "cross-checked-independent-oracle": { short: "Oracle", tone: "oracle" },
  "stale-after-statement-change": { short: "Stale", tone: "stale" },
  "invalid-or-duplicate": { short: "Duplicate", tone: "invalid" }
};

// Returns { short, full, tone } for the chip, or null when there is no
// provenance to show. Unknown strings fall back to a trimmed compact form so a
// future backend label never dumps a long technical string into the row.
export function provenanceLabel(provenance) {
  const full = String(provenance == null ? "" : provenance).trim();
  if (!full) return null;
  const known = PROVENANCE_MAP[full];
  if (known) return { short: known.short, full, tone: known.tone };
  // Graceful fallback: first token, capped, so it stays compact.
  let short = full.split(/[-_\s]+/)[0] || full;
  if (short.length > 14) short = short.slice(0, 13) + "…";
  return { short, full, tone: "unknown" };
}

// ---- Task 1: clean accidental webpage chrome ------------------------------
// Copying a statement off a judge page drags along UI text — "Copy" buttons,
// pager labels, comment/report actions, the language selector. These appear as
// their OWN short lines, so we drop a line ONLY when its whole trimmed content
// is a known chrome token. A sentence that merely *contains* "copy" or "output"
// is never touched, so real problem content is preserved.
const NOISE_LINE = [
  /^copy$/i, /^copied!?$/i,
  /^sao\s*chép$/i, /^đã\s*sao\s*chép!?$/i, /^da\s*sao\s*chep!?$/i,
  /^trang\s+\d+\s*(?:\/\s*\d+)?$/i, /^page\s+\d+\s*(?:\/\s*\d+)?$/i,
  /^\d+\s*\/\s*\d+\s*trang$/i,
  /^bình\s*luận(?:\s*\(\d+\))?$/i, /^binh\s*luan(?:\s*\(\d+\))?$/i, /^comments?$/i,
  /^gửi\s*bài\s*giải$/i, /^gui\s*bai\s*giai$/i, /^nộp\s*bài$/i, /^submit$/i,
  /^báo\s*cáo\s*vấn\s*đề$/i, /^bao\s*cao\s*van\s*de$/i, /^report(?:\s*issue)?$/i,
  /^chia\s*sẻ$/i, /^share$/i
];

// Known programming languages, used to drop a stray language-selector line
// (e.g. "C++ Java Python") without eating real numeric/data lines.
const LANGS = new Set([
  "c", "c++", "cpp", "java", "python", "py", "pascal", "c#", "csharp",
  "kotlin", "javascript", "js", "typescript", "ts", "go", "golang", "rust",
  "ruby", "php", "scala", "swift", "perl", "haskell", "dart"
]);
function isLanguageListLine(t) {
  const toks = t.split(/[\s,|/]+/).filter(Boolean);
  if (toks.length < 2) return false; // a single token is too risky to drop
  return toks.every((tok) => {
    const n = tok.toLowerCase().replace(/(\+\+|#)?\d+$/, "$1"); // c++17 → c++, java8 → java
    return LANGS.has(n);
  });
}
function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (isLanguageListLine(t)) return true;
  return NOISE_LINE.some((re) => re.test(t));
}

// Remove chrome lines. Does NOT mutate the caller's text — returns a cleaned
// copy used only for example extraction/preview, never to overwrite the saved
// statement (the raw statement stays the source of truth).
export function cleanStatementNoise(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !isNoiseLine(line))
    .join("\n");
}

export function normalizeStatementStructure(text) {
  let s = String(text || "").replace(/\r\n?/g, "\n");
  if (!s.trim()) return s;
  s = s.replace(/([^\n(])\s*((?:\d+\s*[.)]\s*)?(?:Dữ\s*liệu\s*vào|Đầu\s*vào|Kết\s*quả\s*ra|Đầu\s*ra|Ràng\s*buộc|Giới\s*hạn|Constraints?|Ví\s*dụ\s*mẫu|Ví\s*dụ|Examples?|Notes?|Ghi\s*chú))/giu, "$1\n$2");
  s = s.replace(/([^\n])\s*((?:Sample\s+Input|Sample\s+Output|VÍ\s*DỤ|Ví\s*dụ|Example)\s*\d+\s*:?\s*)/gu, "$1\n$2");
  s = s.replace(/([^\n])\s*((?:INPUT|Input|OUTPUT|Output)\s*\d*\s*:)/g, "$1\n$2");
  s = s.replace(/\b((?:INPUT|Input|OUTPUT|Output)\s*\d*)\s*:\s*plain\s*text(?=\d|\s|$)/gi, "$1:");
  s = s.replace(/\b((?:INPUT|Input|OUTPUT|Output)\s*\d*)\s*:\s*plaintext(?=\d|\s|$)/gi, "$1:");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

// ---- Task 1: sample extraction --------------------------------------------

const MAX_SAMPLES = 6;
const trimTrailing = (s) => String(s || "").replace(/\s+$/, "");

function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function normHead(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const EXAMPLE_SECTION_KEYS = new Set(["example", "examples", "sample", "samples", "vi du", "vi du mau", "test vi du"]);
const SECTION_KEYS = new Set([
  ...EXAMPLE_SECTION_KEYS,
  "input", "dau vao", "du lieu vao", "du lieu", "input format", "standard input", "dinh dang vao",
  "output", "dau ra", "ket qua", "ket qua ra", "output format", "standard output", "dinh dang ra",
  "constraint", "constraints", "rang buoc", "gioi han", "limit", "limits",
  "subtask", "subtasks", "scoring", "cham diem", "phan diem",
  "note", "notes", "ghi chu", "giai thich", "luu y", "explanation", "remark", "remarks",
  "de bai", "bai toan", "problem", "mo ta", "description", "statement", "noi dung", "tom tat de"
]);

function classifySectionLabel(line) {
  const heading = String(line || "").match(/^\s*#{1,6}\s+(.*)$/);
  const raw = heading ? heading[1] : String(line || "");
  const t = raw.trim();
  if (!t || t.length > 56) return null;
  if (!heading && /[.!?…;,]$/.test(t) && !/[:：]\s*$/.test(t)) return null;
  const stripped = t.replace(/\s*[:：.\-–—]+\s*$/, "").trim();
  const h = normHead(
    stripped
      .replace(/^\d+\s*[.)]\s*/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
  );
  if (!h) return null;
  if (/^(?:sample\s+)?(?:input|output)\s*#?\s*\d+\b/.test(h)) return null;
  for (const key of SECTION_KEYS) {
    if (h === key || h.startsWith(key + " ") || h.endsWith(" " + key)) {
      return EXAMPLE_SECTION_KEYS.has(key) ? "examples" : "other";
    }
  }
  return null;
}

function exampleSectionBodies(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const bodies = [];
  let curType = "other";
  let curLines = [];
  let inFence = false;
  const flush = () => {
    if (curType === "examples") {
      const body = curLines.join("\n").trim();
      if (body) bodies.push(body);
    }
    curLines = [];
  };
  for (const line of lines) {
    if (/^\s*```+/.test(line)) inFence = !inFence;
    if (!inFence) {
      const kind = classifySectionLabel(line);
      if (kind) {
        flush();
        curType = kind;
        continue;
      }
    }
    curLines.push(line);
  }
  flush();
  return bodies;
}

// Fenced-code-block extraction: pair a ```block``` that follows an
// Input/Output label, then fall back to pairing bare consecutive fences. This
// preserves the original Markdown/OCR behaviour exactly.
function fromFencedBlocks(text) {
  const blocks = [];
  const re = /(^|\n)[^\n]*?\b(input|output)\b[^\n]*\n+```[a-zA-Z]*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push({ kind: m[2].toLowerCase(), body: trimTrailing(m[3]) });
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
    while ((b = bre.exec(text)) !== null) bare.push(trimTrailing(b[1]));
    for (let i = 0; i + 1 < bare.length; i += 2) samples.push({ input: bare[i], output: bare[i + 1] });
  }
  return samples;
}

// Plain-label extraction — the format real judge pages (28Tech / CSES / CF /
// LeetCode) paste as: an "Input" / "Output" header line, then the raw data on
// the lines beneath. Vietnamese ("Dữ liệu vào" / "Kết quả ra") and numbered
// ("Sample Input 2") headers are recognised; a label may also carry inline data
// after a colon ("Input: 5"). Anything before the first label (the prose) is
// dropped — only the I/O survives.
const IN_WORDS = String.raw`sample\s*input|input|d[ữu]\s*li[ệe]u\s*v[àa]o|đầu\s*v[àa]o|dau\s*v[àa]o|v[àa]o`;
const OUT_WORDS = String.raw`sample\s*output|output|k[ếe]t\s*qu[ảa](?:\s*ra)?|đầu\s*ra|dau\s*ra|đáp\s*án|dap\s*an|ra`;
const SUFFIX = String.raw`\s*#?\s*\d*`; // optional " #1" / " 1" trailing the header word
const IN_ONLY = new RegExp(`^(?:${IN_WORDS})${SUFFIX}\\s*[:：]?\\s*$`, "i");
const OUT_ONLY = new RegExp(`^(?:${OUT_WORDS})${SUFFIX}\\s*[:：]?\\s*$`, "i");
const IN_INLINE = new RegExp(`^(?:${IN_WORDS})${SUFFIX}\\s*[:：]\\s*(\\S.*)$`, "i");
const OUT_INLINE = new RegExp(`^(?:${OUT_WORDS})${SUFFIX}\\s*[:：]\\s*(\\S.*)$`, "i");

// Other statement sections that may sit between / after the I/O labels. They
// TERMINATE the current data block, so a "Notes" or "Giới hạn" section never
// bleeds into a sample's text, and a statement whose "Input/Output" are merely
// format-description headers doesn't fabricate a junk example.
const OTHER_SECTION = new RegExp(
  "^(?:constraints?|r[àa]ng\\s*bu[ộo]c|gi[ớo]i\\s*h[ạa]n|limits?|subtasks?|scoring|" +
  "ch[ấa]m\\s*đi[ểe]m|ph[âa]n\\s*đi[ểe]m|notes?|ghi\\s*ch[úu]|l[ưu]u\\s*[ýy]|" +
  "explanation|gi[ảa]i\\s*th[íi]ch)\\s*[:：]?\\s*$", "i"
);
const isOtherSectionHeader = (t) => OTHER_SECTION.test(t);

// A block with ≥5 alphabetic word-tokens on a single line reads as a descriptive
// sentence, not sample I/O. Used to reject a pair where BOTH sides are prose
// (i.e. the "Input/Output" were format headers, not sample labels).
function isProseBlock(s) {
  return String(s || "").split("\n").some((line) =>
    (line.match(/[A-Za-zÀ-Ỹà-ỹ]{2,}/g) || []).length >= 5
  );
}

function trimBlock(arr) {
  return arr.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

// Classify a single line as an Input/Output header. Returns { kind, inline } or
// null. A bare header word must be the WHOLE line (so a sentence merely starting
// with "Vào…" is never mistaken for a label); inline data is only taken after a
// colon.
function matchLabel(t) {
  if (IN_ONLY.test(t)) return { kind: "in", inline: null };
  if (OUT_ONLY.test(t)) return { kind: "out", inline: null };
  const mi = t.match(IN_INLINE);
  if (mi) return { kind: "in", inline: mi[1] };
  const mo = t.match(OUT_INLINE);
  if (mo) return { kind: "out", inline: mo[1] };
  return null;
}

function fromLabelledText(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let cur = null, started = false;
  for (const line of lines) {
    const t = line.trim();
    const lab = matchLabel(t);
    if (lab) {
      if (cur) blocks.push(cur);
      cur = { kind: lab.kind, data: lab.inline ? [lab.inline] : [] };
      started = true;
      continue;
    }
    // A non-I/O section header closes the current block (its text is not part of
    // the sample) and pauses collection until the next Input/Output label.
    if (started && isOtherSectionHeader(t)) {
      if (cur) { blocks.push(cur); cur = null; }
      continue;
    }
    if (cur) cur.data.push(line);
  }
  if (cur) blocks.push(cur);

  const samples = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "in") {
      const out = blocks[i + 1] && blocks[i + 1].kind === "out" ? blocks[i + 1] : null;
      const input = trimBlock(blocks[i].data);
      const output = out ? trimBlock(out.data) : "";
      // Skip a pair whose BOTH sides are descriptive prose — those "Input/Output"
      // were format-section headers, not real sample labels.
      if (isProseBlock(input) && isProseBlock(output)) { if (out) i++; continue; }
      samples.push({ input, output });
      if (out) i++;
    }
  }
  return samples;
}

// Public: return up to MAX_SAMPLES clean { input, output } pairs. Fenced blocks
// win when present (the most explicit signal); otherwise fall back to the plain
// label format.
export function extractSamples(text) {
  const src = normalizeStatementStructure(cleanStatementNoise(text));
  if (!src.trim()) return [];
  const exampleBodies = exampleSectionBodies(src);
  let samples = [];
  if (exampleBodies.length) {
    for (const body of exampleBodies) {
      let part = fromFencedBlocks(body);
      if (part.length === 0) part = fromLabelledText(body);
      samples.push(...part);
      if (samples.length >= MAX_SAMPLES) break;
    }
  } else {
    samples = fromFencedBlocks(src);
    if (samples.length === 0) samples = fromLabelledText(src);
  }
  return samples.slice(0, MAX_SAMPLES);
}
