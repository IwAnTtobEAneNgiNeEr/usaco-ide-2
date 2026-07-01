"use strict";

// analysis/statement-analysis.js — Vietnamese CP statement analyzer.
// Registered as the "statement" analysis module. Calls AI to extract
// title, difficulty, techniques, constraints, and warnings in Vietnamese.

const id = "statement";
const name = "Phân tích đề bài";
const description = "AI phân tích đề thi CP: tóm tắt, kỹ thuật, ràng buộc, cạm bẫy";

const SYSTEM_PROMPT = [
  "Bạn là trợ lý phân tích đề thi lập trình thi đấu (competitive programming).",
  "Đọc đề bài và trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON), theo schema:",
  "{",
  '  "title": "tên bài ngắn gọn hoặc rỗng",',
  '  "source": "USACO|Codeforces|CSES|AtCoder|VNOI|... hoặc rỗng nếu không rõ",',
  '  "difficulty": "easy|medium|hard",',
  '  "usacoTier": "Bronze|Silver|Gold|Platinum hoặc rỗng nếu không phải kiểu USACO",',
  '  "cfRating": 1500,',
  '  "tags": ["dp","graphs", ...],',
  '  "tomTat": "Tóm tắt đề bài bằng tiếng Việt, 2-3 câu",',
  '  "kyThuat": ["Prefix Sum", "Binary Search", ...],',
  '  "rangBuoc": "Tóm tắt ràng buộc quan trọng bằng tiếng Việt",',
  '  "doPhucTapYeuCauTime": "O(N log N)",',
  '  "doPhucTapYeuCauSpace": "O(N)",',
  '  "doKho": "Nhận xét độ khó bằng tiếng Việt",',
  '  "luuY": "Cạm bẫy cần cẩn thận bằng tiếng Việt"',
  "}",
  "- TẤT CẢ mô tả PHẢI viết bằng tiếng Việt.",
  "- TUYỆT ĐỐI KHÔNG giải bài."
].join("\n");

function normalize(parsed) {
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 8) : [];
  const kyThuat = Array.isArray(parsed.kyThuat) ? parsed.kyThuat.map(t => String(t).trim()).filter(Boolean).slice(0, 6)
    : (Array.isArray(parsed.expectedTechnique) ? parsed.expectedTechnique.map(t => String(t).trim()).filter(Boolean).slice(0, 6) : []);
  const tier = ["Bronze", "Silver", "Gold", "Platinum"].find(
    t => String(parsed.usacoTier || "").toLowerCase() === t.toLowerCase()
  ) || "";
  let cfRating = Math.round(Number(parsed.cfRating) || 0);
  if (cfRating && (cfRating < 500 || cfRating > 4000)) cfRating = 0;
  return {
    title: String(parsed.title || "").trim(),
    source: String(parsed.source || "").trim(),
    difficulty: ["easy", "medium", "hard"].includes(parsed.difficulty) ? parsed.difficulty : "",
    usacoTier: tier,
    cfRating,
    tags,
    tomTat: String(parsed.tomTat || parsed.problemSummary || "").trim(),
    kyThuat,
    rangBuoc: String(parsed.rangBuoc || parsed.constraintsSummary || "").trim(),
    doPhucTapYeuCauTime: String(parsed.doPhucTapYeuCauTime || "").trim(),
    doPhucTapYeuCauSpace: String(parsed.doPhucTapYeuCauSpace || "").trim(),
    doKho: String(parsed.doKho || parsed.difficultyEstimate || "").trim(),
    luuY: String(parsed.luuY || "").trim()
  };
}

async function analyze(ctx) {
  const { settings, statement } = ctx;
  if (!statement || !statement.trim()) throw new Error("Statement is empty.");
  // ctx.chat is the adapter's chat function (injected by the caller)
  const chatFn = ctx.chat || (await require("../ai")).chat || null;
  if (!chatFn) throw new Error("No chat function available");
  const content = await chatFn({
    settings,
    jsonMode: true,
    maxTokens: 1200,
    timeoutMs: 60000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: statement }
    ]
  });
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error("AI analysis did not return valid JSON."); }
  return normalize(parsed);
}

module.exports = { id, name, description, analyze, normalize, SYSTEM_PROMPT };
