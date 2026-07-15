"use strict";

// diagnose.js — pure core of the "Khoảnh Khắc" autopilot (README-AUTOPILOT.md).
//
// The moment a failing verdict lands, the system diagnoses WHY — without being
// asked. This module owns everything deterministic about that call: the fixed
// bug taxonomy, the prompt (numbered code so the model can cite real lines),
// the tolerant parser for the model's 4-line reply, and the cache key that
// makes re-judging the same code free.
//
// Pure-core rules (README-LOOPS.md §1.3): no fs, no AI, no Express. crypto is
// allowed — it is deterministic. The AI call itself lives in the route, which
// feeds the model with buildDiagnoseMessages() and feeds the reply back into
// parseDiagnosis().

const crypto = require("crypto");

// Fixed taxonomy — the model MUST pick one. This is what makes the Student
// Model's recurringBugs honest: the tag space is closed and auditable, and
// every entry carries the evidence file that produced it (§3.3).
const TAXONOMY = [
  { tag: "bien-tran", label: "Tràn số (overflow)" },
  { tag: "off-by-one", label: "Lệch một đơn vị (off-by-one)" },
  { tag: "canh-bien", label: "Thiếu ca biên (edge case)" },
  { tag: "sai-cong-thuc", label: "Sai công thức / logic" },
  { tag: "sai-dinh-dang", label: "Sai định dạng output" },
  { tag: "chua-khoi-tao", label: "Biến chưa khởi tạo / không reset" },
  { tag: "tran-mang", label: "Truy cập ngoài mảng" },
  { tag: "sai-kieu-doc", label: "Đọc input sai cách" },
  { tag: "do-phuc-tap", label: "Độ phức tạp quá cao" },
  { tag: "de-quy-sau", label: "Đệ quy sâu / tràn stack" },
  { tag: "khac", label: "Khác" },
];

const TAGS = TAXONOMY.map((t) => t.tag);

function tagLabel(tag) {
  const hit = TAXONOMY.find((t) => t.tag === tag);
  return hit ? hit.label : "Khác";
}

// ---- text plumbing ---------------------------------------------------------

/** Keep head and tail of a long string; mark the cut so the model knows. */
function middleTruncate(s, max) {
  const str = String(s == null ? "" : s);
  if (str.length <= max) return str;
  const head = Math.ceil(max * 0.7);
  const tail = max - head;
  return `${str.slice(0, head)}\n…(cắt bớt ${str.length - max} ký tự)…\n${str.slice(str.length - tail)}`;
}

/** "  12| code" — line numbers are load-bearing: LINES in the reply cite them. */
function numberCode(code, { maxLines = 400 } = {}) {
  const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
  const shown = lines.slice(0, maxLines);
  const width = String(shown.length).length;
  const body = shown
    .map((l, i) => `${String(i + 1).padStart(width)}| ${l}`)
    .join("\n");
  const cut = lines.length > maxLines ? `\n…(còn ${lines.length - maxLines} dòng bị cắt)…` : "";
  return { numbered: body + cut, lineCount: lines.length };
}

// ---- prompt ----------------------------------------------------------------

/**
 * Build the chat messages for one diagnosis. Output contract (order matters —
 * the frontend streams the reply and reveals each field as its line completes):
 *   TAG: <taxonomy>
 *   LINES: <1-3 line numbers>
 *   VISAO: <1-2 câu vì sao fail test NÀY>
 *   GOIY: <1 câu hỏi/thí nghiệm đẩy em tự tìm ra — cấm nêu phép sửa cụ thể
 *         (README-AUTOPILOT.md M2: model hay lộ đáp án kiểu "thay X bằng Y"
 *         trên bug tầm thường; luật 4 trong system prompt chặn việc đó)>
 */
function buildDiagnoseMessages({ statement, code, verdict, test, timeMs, limitMs }) {
  const v = ["WA", "RE", "TLE"].includes(verdict) ? verdict : "WA";
  const { numbered, lineCount } = numberCode(code);
  const t = test || {};

  const system = [
    "Bạn là huấn luyện viên competitive programming cho một học sinh Việt Nam lớp 10.",
    `Code của em ấy vừa FAIL một test (verdict ${v}). Nhiệm vụ: chẩn đoán NGẮN GỌN vì sao.`,
    "",
    "LUẬT SẮT:",
    "1. Chỉ đưa GIẢ THUYẾT suy ra từ bằng chứng có thật trong code và test. Không chắc thì nói thẳng \"chưa chắc chắn\".",
    "2. TUYỆT ĐỐI không viết code sửa sẵn, không mô tả trọn vẹn thuật toán đúng. Em ấy phải tự sửa.",
    "3. LINES chỉ được chứa số dòng CÓ THẬT trong code đã đánh số bên dưới.",
    "4. GOIY là một CÂU HỎI hoặc một THÍ NGHIỆM để em tự kiểm tra — TUYỆT ĐỐI cấm nêu phép sửa cụ thể, dù bug có vẻ nhỏ đến đâu.",
    "   Cấm mọi câu dạng \"thay X bằng Y\", \"đổi ... thành ...\", \"sửa ... thành ...\", \"phải dùng ... thay vì ...\".",
    "   Đúng (ví dụ): \"Thử tính tay biểu thức ở dòng 6 với một giá trị nhỏ, so với kết quả mong đợi.\"",
    "   Sai (KHÔNG được viết kiểu này): \"Thay dấu trừ bằng dấu cộng ở dòng 6.\"",
    "5. Trả lời ĐÚNG 4 dòng theo thứ tự này, không thêm chữ nào khác:",
    `TAG: <một trong: ${TAGS.join("|")}>`,
    "LINES: <1-3 số dòng nghi vấn nhất, phân cách bằng dấu phẩy>",
    "VISAO: <1-2 câu tiếng Việt: vì sao code fail test NÀY>",
    "GOIY: <câu hỏi/thí nghiệm theo luật 4 — không nêu phép sửa>",
  ].join("\n");

  const parts = [
    `VERDICT: ${v}${v === "TLE" && timeMs ? ` (chạy ${timeMs}ms / giới hạn ${limitMs || "?"}ms)` : ""}`,
    "",
    "ĐỀ BÀI (tóm lược):",
    middleTruncate(statement, 1200) || "(không có đề)",
    "",
    `CODE HỌC SINH (${lineCount} dòng, đã đánh số):`,
    numbered,
    "",
    "TEST LÀM CODE FAIL:",
    `--- input ---\n${middleTruncate(t.input, 500) || "(rỗng)"}`,
    `--- expected ---\n${middleTruncate(t.expected, 300) || "(rỗng)"}`,
    `--- code em in ra ---\n${middleTruncate(t.actual, 300) || "(không có output)"}`,
  ];
  if (v === "RE" && t.stderr) parts.push(`--- stderr ---\n${middleTruncate(t.stderr, 300)}`);

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: parts.join("\n") },
    ],
    lineCount,
  };
}

// ---- parser ----------------------------------------------------------------

function grab(text, label) {
  const m = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "mi").exec(text);
  return m ? m[1].trim() : "";
}

/**
 * Parse the model's reply into the diagnosis contract. Tolerant: markdown
 * fences, extra prose, shuffled casing all survive. Returns { ok: false }
 * only when there is no usable VISAO — a diagnosis without a "why" is noise.
 */
function parseDiagnosis(text, lineCount) {
  const raw = String(text || "").replace(/```[a-z]*\n?/gi, "").trim();

  const tagRaw = grab(raw, "TAG").toLowerCase().replace(/[^a-z-]/g, "");
  const tag = TAGS.includes(tagRaw) ? tagRaw : "khac";

  const max = Math.max(1, Number(lineCount) || 1);
  const lines = [...new Set(
    (grab(raw, "LINES").match(/\d+/g) || [])
      .map(Number)
      .filter((n) => n >= 1 && n <= max)
  )].slice(0, 3);

  const why = grab(raw, "VISAO");
  const hint = grab(raw, "GOIY");

  if (!why) return { ok: false, raw };
  return { ok: true, tag, tagLabel: tagLabel(tag), lines, why, hint, raw };
}

// ---- cache key -------------------------------------------------------------

/** Same code + same failing test = same diagnosis. Re-judges are free. */
function cacheKey({ code, testId, input, verdict }) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([String(code || ""), String(testId || ""), String(input || ""), String(verdict || "")]))
    .digest("hex");
}

module.exports = {
  TAXONOMY,
  tagLabel,
  middleTruncate,
  numberCode,
  buildDiagnoseMessages,
  parseDiagnosis,
  cacheKey,
};
