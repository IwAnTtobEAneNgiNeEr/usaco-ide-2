"use strict";

// statementSamples.js — CJS port of frontend/src/core/sample-extract.js's
// extractSamples(), byte-faithful in logic (same regexes, same section/label
// classification). Kept as ONE source of truth for "what counts as a sample"
// — see the note below for why this file exists at all.
//
// Root-cause fix (2026-07-06, Nâng Kèo v1): ai.js's OWN extractSamples only
// recognized fenced ```code``` blocks. Real statements in this workspace use
// the plain "Input 01" / "Output 01" label format with NO fences (28Tech/CSES/
// CF-style pasted text) — so ai.extractSamples silently returned [] on most of
// them. That single miss cascades everywhere sample-presence gates a decision:
// turn.js's computeEligibility (§1.2 rated-gate #1 of 3), gauntlet.js/
// verifyTests.js's reference trust check, and arena/upgrade.js's promote
// eligibility all read `samples.length > 0` — so the ENTIRE Đấu Trường system
// was silently friendly-only on this real workspace until this file existed.
//
// Pure: no fs, no DOM — safe for `node --test` exactly like its frontend twin.

const MAX_SAMPLES = 6;
const trimTrailing = (s) => String(s || "").replace(/\s+$/, "");

function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function normHead(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// ---- noise cleaning (accidental webpage chrome) ----------------------------

const NOISE_LINE = [
  /^copy$/i, /^copied!?$/i,
  /^sao\s*chép$/i, /^đã\s*sao\s*chép!?$/i, /^da\s*sao\s*chep!?$/i,
  /^trang\s+\d+\s*(?:\/\s*\d+)?$/i, /^page\s+\d+\s*(?:\/\s*\d+)?$/i,
  /^\d+\s*\/\s*\d+\s*trang$/i,
  /^bình\s*luận(?:\s*\(\d+\))?$/i, /^binh\s*luan(?:\s*\(\d+\))?$/i, /^comments?$/i,
  /^gửi\s*bài\s*giải$/i, /^gui\s*bai\s*giai$/i, /^nộp\s*bài$/i, /^submit$/i,
  /^báo\s*cáo\s*vấn\s*đề$/i, /^bao\s*cao\s*van\s*de$/i, /^report(?:\s*issue)?$/i,
  /^chia\s*sẻ$/i, /^share$/i,
  // A stray fence-language hint left behind as its OWN line by a naive
  // ```lang → plain-text converter that stripped the backticks but not the
  // language word (real statement found 2026-07-07: "Input 01:\n\ntext\n6 7\n...").
  /^(?:plain\s*text|plaintext|text)$/i,
];

const LANGS = new Set([
  "c", "c++", "cpp", "java", "python", "py", "pascal", "c#", "csharp",
  "kotlin", "javascript", "js", "typescript", "ts", "go", "golang", "rust",
  "ruby", "php", "scala", "swift", "perl", "haskell", "dart",
]);
function isLanguageListLine(t) {
  const toks = t.split(/[\s,|/]+/).filter(Boolean);
  if (toks.length < 2) return false;
  return toks.every((tok) => {
    const n = tok.toLowerCase().replace(/(\+\+|#)?\d+$/, "$1");
    return LANGS.has(n);
  });
}
function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (isLanguageListLine(t)) return true;
  return NOISE_LINE.some((re) => re.test(t));
}

function cleanStatementNoise(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !isNoiseLine(line))
    .join("\n");
}

function normalizeStatementStructure(text) {
  let s = String(text || "").replace(/\r\n?/g, "\n");
  if (!s.trim()) return s;
  // Codeforces-paste artifact: the "Copy" button's text sits glued directly
  // onto "Input"/"Output" with no separating whitespace ("InputCopy",
  // "OutputCopy") because the page's DOM has no space between them. Split it
  // off BEFORE anything else runs, or the label is unrecognizable to every
  // matcher below (real bug found 2026-07-07 on an actual CF-pasted problem).
  s = s.replace(/\b((?:Sample\s+)?(?:Input|Output))Copy\b/gi, "$1");
  s = s.replace(/([^\n(])\s*((?:\d+\s*[.)]\s*)?(?:Dữ\s*liệu\s*vào|Đầu\s*vào|Kết\s*quả\s*ra|Đầu\s*ra|Ràng\s*buộc|Giới\s*hạn|Constraints?|Ví\s*dụ\s*mẫu|Ví\s*dụ|Examples?|Notes?|Ghi\s*chú))/giu, "$1\n$2");
  s = s.replace(/([^\n])\s*((?:Sample\s+Input|Sample\s+Output|VÍ\s*DỤ|Ví\s*dụ|Example)\s*\d+\s*:?\s*)/gu, "$1\n$2");
  s = s.replace(/([^\n])\s*((?:INPUT|Input|OUTPUT|Output)\s*\d*\s*:)/g, "$1\n$2");
  s = s.replace(/\b((?:INPUT|Input|OUTPUT|Output)\s*\d*)\s*:\s*plain\s*text(?=\d|\s|$)/gi, "$1:");
  s = s.replace(/\b((?:INPUT|Input|OUTPUT|Output)\s*\d*)\s*:\s*plaintext(?=\d|\s|$)/gi, "$1:");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

// ---- example-section isolation ---------------------------------------------

const EXAMPLE_SECTION_KEYS = new Set(["example", "examples", "sample", "samples", "vi du", "vi du mau", "test vi du"]);
// Input/Output-shaped keys are AMBIGUOUS: they show up both as a top-level
// "how the format works" header AND as the per-example label right before
// the actual sample data ("Ví dụ\n```...``` \n**Kết quả**\n```...```"). A
// real bug this caused (2026-07-07): once inside an "examples" section, the
// output-side label alone was misread as leaving that section, silently
// discarding the entire second half (the expected output) of the sample.
// Classified separately so exampleSectionBodies can treat them as "stay
// inside the current example" rather than "end the section".
const IO_SECTION_KEYS = new Set([
  "input", "dau vao", "du lieu vao", "du lieu", "input format", "standard input", "dinh dang vao",
  "output", "dau ra", "ket qua", "ket qua ra", "output format", "standard output", "dinh dang ra",
]);
const OTHER_SECTION_KEYS = new Set([
  "constraint", "constraints", "rang buoc", "gioi han", "limit", "limits",
  "subtask", "subtasks", "scoring", "cham diem", "phan diem",
  "note", "notes", "ghi chu", "giai thich", "luu y", "explanation", "remark", "remarks",
  "de bai", "bai toan", "problem", "mo ta", "description", "statement", "noi dung", "tom tat de",
]);
const SECTION_KEYS = new Set([...EXAMPLE_SECTION_KEYS, ...IO_SECTION_KEYS, ...OTHER_SECTION_KEYS]);

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
      .replace(/^\*{1,2}\s*/, "").replace(/\s*\*{1,2}$/, "") // strip **bold**/*italic* header markers
      .replace(/\s*\([^)]*\)\s*$/, "")
  );
  if (!h) return null;
  if (/^(?:sample\s+)?(?:input|output)\s*#?\s*\d+\b/.test(h)) return null;
  for (const key of SECTION_KEYS) {
    if (h === key || h.startsWith(key + " ") || h.endsWith(" " + key)) {
      if (EXAMPLE_SECTION_KEYS.has(key)) return "examples";
      if (IO_SECTION_KEYS.has(key)) return "io";
      return "other";
    }
  }
  // A real markdown heading (`## ...`) we don't recognize is still a hard
  // section boundary — real bug found 2026-07-07: appending ANY new `##`
  // section after the last worked example (e.g. a Synthesizer "upgraded
  // variant" note) with no recognized keyword let the trailing example's
  // output section run straight into that new section's text, corrupting the
  // sample. Headings are an unambiguous authoring signal; never swallow one
  // into a running example/IO block just because its label is unfamiliar.
  if (heading) return "other";
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
      if (kind === "io" && curType === "examples") {
        // An Input/Output label encountered WHILE already inside an example
        // is part of THAT example (the line between its two halves) — never
        // a section boundary. Keep it in curLines for fromLabelledText to read.
        curLines.push(line);
        continue;
      }
      if (kind) {
        flush();
        curType = kind === "io" ? "other" : kind;
        continue;
      }
    }
    curLines.push(line);
  }
  flush();
  return bodies;
}

// ---- fenced-code-block extraction -------------------------------------------

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

// ---- plain-label extraction (the format real judge pages actually use) ------

const IN_WORDS = String.raw`sample\s*input|input|d[ữu]\s*li[ệe]u\s*v[àa]o|đầu\s*v[àa]o|dau\s*v[àa]o|v[àa]o`;
const OUT_WORDS = String.raw`sample\s*output|output|k[ếe]t\s*qu[ảa](?:\s*ra)?|đầu\s*ra|dau\s*ra|đáp\s*án|dap\s*an|ra`;
const SUFFIX = String.raw`\s*#?\s*\d*`;
const IN_ONLY = new RegExp(`^(?:${IN_WORDS})${SUFFIX}\\s*[:：]?\\s*$`, "i");
const OUT_ONLY = new RegExp(`^(?:${OUT_WORDS})${SUFFIX}\\s*[:：]?\\s*$`, "i");
const IN_INLINE = new RegExp(`^(?:${IN_WORDS})${SUFFIX}\\s*[:：]\\s*(\\S.*)$`, "i");
const OUT_INLINE = new RegExp(`^(?:${OUT_WORDS})${SUFFIX}\\s*[:：]\\s*(\\S.*)$`, "i");

const OTHER_SECTION = new RegExp(
  "^(?:constraints?|r[àa]ng\\s*bu[ộo]c|gi[ớo]i\\s*h[ạa]n|limits?|subtasks?|scoring|" +
  "ch[ấa]m\\s*đi[ểe]m|ph[âa]n\\s*đi[ểe]m|notes?|ghi\\s*ch[úu]|l[ưu]u\\s*[ýy]|" +
  "explanation|gi[ảa]i\\s*th[íi]ch)\\s*[:：]?\\s*$", "i"
);
const isOtherSectionHeader = (t) => OTHER_SECTION.test(t);

function isProseBlock(s) {
  return String(s || "").split("\n").some((line) =>
    (line.match(/[A-Za-zÀ-Ỹà-ỹ]{2,}/g) || []).length >= 5
  );
}

function trimBlock(arr) {
  return arr.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

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
  let preData = []; // lines seen before ANY label — see the "implicit input" note below
  for (const line of lines) {
    const t = line.trim();
    const lab = matchLabel(t);
    if (lab) {
      // "Ví dụ\n4 5\n1 2 1\n...\nĐầu ra\n6" — a real, common shape: the example
      // section header alone introduces the input (no separate "Input:"
      // label at all), and only the OUTPUT gets an explicit label. Without
      // this, the input data (collected into preData below, since `cur` was
      // still null) would be silently dropped entirely. Guarded by
      // isProseBlock so a genuine "no example here" statement (prose before
      // the first Output/Constraints-style label) never gets fabricated
      // into a fake sample.
      if (lab.kind === "out" && !started && preData.length && !isProseBlock(trimBlock(preData))) {
        blocks.push({ kind: "in", data: preData });
      }
      preData = [];
      if (cur) blocks.push(cur);
      cur = { kind: lab.kind, data: lab.inline ? [lab.inline] : [] };
      started = true;
      continue;
    }
    // Same heading-is-a-hard-boundary rule as classifySectionLabel, for the
    // path where fromLabelledText runs directly on the whole statement (no
    // recognized "Ví dụ" section wrapping it) — an unrecognized `## heading`
    // must still cut off an in-progress in/out block instead of being read
    // as more of its data.
    if (started && (isOtherSectionHeader(t) || /^\s*#{1,6}\s+/.test(line))) {
      if (cur) { blocks.push(cur); cur = null; }
      continue;
    }
    if (cur) cur.data.push(line);
    else preData.push(line);
  }
  if (cur) blocks.push(cur);

  const samples = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "in") {
      const out = blocks[i + 1] && blocks[i + 1].kind === "out" ? blocks[i + 1] : null;
      const input = trimBlock(blocks[i].data);
      const output = out ? trimBlock(out.data) : "";
      if (isProseBlock(input) && isProseBlock(output)) { if (out) i++; continue; }
      samples.push({ input, output });
      if (out) i++;
    }
  }
  return samples;
}

/** Up to MAX_SAMPLES clean { input, output } pairs. Fenced blocks win when
 *  present (the most explicit signal); otherwise the plain label format. */
function extractSamples(text) {
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

module.exports = { extractSamples, cleanStatementNoise, normalizeStatementStructure };
