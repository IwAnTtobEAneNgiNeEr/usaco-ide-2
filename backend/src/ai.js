"use strict";

// ai.js — OpenAI-compatible client for AI OCR, analysis, and test-case generation.
// The API key is read from ai-settings.json and is NEVER logged.

const crypto = require("crypto");
const { CONTEST } = require("./config");

const NO_KEY_MESSAGE = "Bạn cần nhập API key trong Settings trước.";

// ---------------------------------------------------------------------------
// Structured logging — one clear line per pipeline stage so the backend is
// debuggable: "OCR start", "OCR success", "AI analyze start", etc.
// ---------------------------------------------------------------------------

function log(stage, detail) {
  const ts = new Date().toISOString().slice(11, 23);
  const tail = detail ? ` — ${detail}` : "";
  // eslint-disable-next-line no-console
  console.log(`[AI ${ts}] ${stage}${tail}`);
}

// ---------------------------------------------------------------------------
// Tiny LRU cache keyed by a hash of the statement (+ model + kind). When the
// statement has not changed we never call the model again.
// ---------------------------------------------------------------------------

const CACHE_MAX = 60;
const cache = new Map();

function cacheKey(kind, model, text) {
  const h = crypto.createHash("sha1").update(String(text || "")).digest("hex");
  return `${kind}:${model}:${h}`;
}
function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v); // refresh recency
  return v;
}
function cacheSet(key, value) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ordered, de-duplicated list of models to try: primary first, then any
// fallbacks. A rate-limited (429) or overloaded model rolls over to the next.
function modelCandidates(settings) {
  const list = [settings.model];
  String(settings.fallbackModels || "")
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter(Boolean)
    .forEach((m) => list.push(m));
  return [...new Set(list.filter(Boolean))];
}

// Turn a raw provider HTTP error into a friendly, actionable Vietnamese message
// while keeping the provider's own text in parentheses for debugging. Used so
// the user sees "kiểm tra key trong Settings" instead of a raw vendor string.
function friendlyAiError(status, providerMsg) {
  const detail = providerMsg ? ` (${String(providerMsg).slice(0, 200)})` : "";
  if (status === 401 || status === 403)
    return `API key bị từ chối — kiểm tra lại key trong Settings → AI.${detail}`;
  if (status === 429)
    return `Hết hạn mức / bị giới hạn tốc độ (429) — đợi một lát, hoặc thêm model dự phòng ("Fallback models") trong Settings → AI.${detail}`;
  if (status === 404)
    return `Không tìm thấy model hoặc endpoint (404) — kiểm tra "Model" và "Base URL" trong Settings → AI.${detail}`;
  if (status >= 500)
    return `Nhà cung cấp AI đang lỗi tạm thời (${status}) — hệ thống sẽ tự thử lại.${detail}`;
  return `AI error ${status}: ${providerMsg}`;
}

// One concrete request to one model. Throws an Error tagged with `.retryable`
// (429 / 5xx / overloaded → try a fallback) or `.fatal` (auth / bad request).
// With `stream: true` the response is consumed as SSE: `onDelta(text)` fires per
// content chunk and the full accumulated text is returned. `signal` lets the
// caller (e.g. an HTTP route whose client disconnected) abort mid-flight.
async function chatOnce({ settings, model, messages, jsonMode, maxTokens, timeoutMs, stream, onDelta, signal }) {
  const url = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = { model, messages, temperature: 0.3 };
  if (maxTokens) body.max_tokens = maxTokens;
  if (jsonMode) body.response_format = { type: "json_object" };
  if (stream) body.stream = true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let onCallerAbort = null;
  if (signal) {
    if (signal.aborted) controller.abort();
    else {
      onCallerAbort = () => controller.abort();
      signal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }
  const cleanup = () => {
    clearTimeout(timer);
    if (signal && onCallerAbort) signal.removeEventListener("abort", onCallerAbort);
  };
  const abortError = (error) => {
    const cancelled = signal && signal.aborted;
    const e = new Error(
      error && error.name === "AbortError"
        ? (cancelled ? "Đã hủy yêu cầu AI." : "Quá thời gian chờ AI (timeout).")
        : "Không gọi được AI endpoint. Kiểm tra Base URL / mạng."
    );
    e.retryable = !cancelled; // network blips / timeouts are worth a retry; user cancels are not
    if (cancelled) e.code = "ABORTED";
    return e;
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    cleanup();
    throw abortError(error);
  }

  if (!res.ok) {
    cleanup();
    const text = await res.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const providerMsg = (data && data.error && (data.error.message || data.error.type)) || res.statusText || "request failed";
    const e = new Error(friendlyAiError(res.status, providerMsg));
    e.status = res.status;
    e.providerMessage = providerMsg;
    // 429 (rate limit) + 5xx (overload/transient) are retryable; 4xx auth/bad-request are fatal.
    e.retryable = res.status === 429 || res.status >= 500;
    if (res.status === 401 || res.status === 403) e.code = "AUTH";
    throw e;
  }

  if (stream) {
    // SSE: lines of `data: {json}` ending with `data: [DONE]`. Some
    // OpenAI-compatible relays IGNORE `stream: true` and reply with one plain
    // JSON body — keep the raw text so we can salvage that case below.
    let full = "";
    let buf = "";
    let raw = "";
    let sawSse = false;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body) {
        const piece = decoder.decode(chunk, { stream: true });
        raw += piece;
        buf += piece;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          sawSse = true;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let obj = null;
          try { obj = JSON.parse(payload); } catch { continue; }
          const delta = obj && obj.choices && obj.choices[0] && (
            (obj.choices[0].delta && obj.choices[0].delta.content !== undefined && obj.choices[0].delta.content !== null ? String(obj.choices[0].delta.content) : undefined) ||
            (obj.choices[0].delta && obj.choices[0].delta.text !== undefined && obj.choices[0].delta.text !== null ? String(obj.choices[0].delta.text) : undefined) ||
            (obj.choices[0].text !== undefined && obj.choices[0].text !== null ? String(obj.choices[0].text) : undefined) ||
            (obj.choices[0].message && obj.choices[0].message.content !== undefined && obj.choices[0].message.content !== null ? String(obj.choices[0].message.content) : undefined) ||
            ""
          );
          if (delta) {
            full += delta;
            if (onDelta) onDelta(delta);
          }
        }
      }
    } catch (error) {
      cleanup();
      const e = abortError(error);
      e.partial = full; // what already streamed, for callers that want it
      throw e;
    }
    cleanup();

    // Process any remaining content in buf after the stream ended
    if (buf.trim()) {
      const line = buf.trim();
      if (line.startsWith("data:")) {
        sawSse = true;
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            const obj = JSON.parse(payload);
            const delta = obj && obj.choices && obj.choices[0] && (
              (obj.choices[0].delta && obj.choices[0].delta.content !== undefined && obj.choices[0].delta.content !== null ? String(obj.choices[0].delta.content) : undefined) ||
              (obj.choices[0].delta && obj.choices[0].delta.text !== undefined && obj.choices[0].delta.text !== null ? String(obj.choices[0].delta.text) : undefined) ||
              (obj.choices[0].text !== undefined && obj.choices[0].text !== null ? String(obj.choices[0].text) : undefined) ||
              (obj.choices[0].message && obj.choices[0].message.content !== undefined && obj.choices[0].message.content !== null ? String(obj.choices[0].message.content) : undefined) ||
              ""
            );
            if (delta) {
              full += delta;
              if (onDelta) onDelta(delta);
            }
          } catch { /* ignore */ }
        }
      }
    }

    if (!full.trim() && raw.trim()) {
      // Treat a buffered completion as one delta if we didn't extract anything.
      try {
        const data = JSON.parse(raw);
        const content = data && data.choices && data.choices[0] && (
          (data.choices[0].message && data.choices[0].message.content !== undefined && data.choices[0].message.content !== null ? String(data.choices[0].message.content) : undefined) ||
          (data.choices[0].text !== undefined && data.choices[0].text !== null ? String(data.choices[0].text) : undefined) ||
          ""
        );
        if (content && String(content).trim()) {
          full = String(content);
          if (onDelta) onDelta(full);
        }
      } catch { /* not JSON either */ }
    }
    if (!full.trim()) throw new Error("AI trả về phản hồi rỗng.");
    return full;
  }

  cleanup();
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const content = data && data.choices && data.choices[0] && (
    (data.choices[0].message && data.choices[0].message.content !== undefined && data.choices[0].message.content !== null ? String(data.choices[0].message.content) : undefined) ||
    (data.choices[0].text !== undefined && data.choices[0].text !== null ? String(data.choices[0].text) : undefined) ||
    ""
  );
  if (!content || !String(content).trim()) throw new Error("AI trả về phản hồi rỗng.");
  return content;
}

// Resilient chat: walks the model candidate list, and for each model retries a
// couple of times with exponential backoff before falling back to the next one.
// The user never has to manually switch models when one is rate-limited.
// Streaming (`stream` + `onDelta` + `signal`) keeps the retry/fallback walk
// ONLY until the first delta reaches the caller — once bytes have streamed out,
// an error is fatal for this request (a stream can't be silently restarted).
async function chat({ settings, messages, jsonMode, maxTokens, timeoutMs = 60000, stream, onDelta, signal }) {
  if (!settings.apiKey) {
    const err = new Error(NO_KEY_MESSAGE);
    err.code = "NO_KEY";
    throw err;
  }
  const models = modelCandidates(settings);
  const RETRIES_PER_MODEL = 2; // attempts beyond the first, per model
  let lastErr = null;
  let deltasEmitted = false;
  const trackedOnDelta = onDelta ? (d) => { deltasEmitted = true; onDelta(d); } : undefined;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
      try {
        const content = await chatOnce({ settings, model, messages, jsonMode, maxTokens, timeoutMs, stream, onDelta: trackedOnDelta, signal });
        if (mi > 0 || attempt > 0) log("AI recovered", `model=${model}${attempt ? ` retry=${attempt}` : ""}`);
        return content;
      } catch (error) {
        lastErr = error;
        if (!error.retryable || deltasEmitted) throw error; // auth/bad request, user cancel, or mid-stream failure
        const moreAttempts = attempt < RETRIES_PER_MODEL;
        const moreModels = mi < models.length - 1;
        if (!moreAttempts && !moreModels) break;
        if (moreAttempts) {
          const backoff = Math.min(8000, 600 * Math.pow(2, attempt)); // 600ms, 1.2s, 2.4s…
          log("AI retry", `${error.status || ""} ${model} — chờ ${backoff}ms (lần ${attempt + 1})`);
          await sleep(backoff);
        } else {
          log("AI fallback", `${model} → ${models[mi + 1]} (lý do: ${error.status || error.message})`);
          break; // move to next model
        }
      }
    }
  }
  throw lastErr || new Error("AI request failed.");
}

// Quick connectivity/auth probe.
async function testConnection(settings) {
  const content = await chat({
    settings,
    messages: [
      { role: "system", content: "You are a connectivity probe. Reply with the single word: ok" },
      { role: "user", content: "ping" }
    ],
    maxTokens: 5,
    timeoutMs: 20000
  });
  return { ok: true, model: settings.model, sample: content.trim().slice(0, 40) };
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

function escapeControlChars(str) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\n') {
        result += "\\n";
      } else if (char === '\r') {
        result += "\\r";
      } else if (char === '\t') {
        result += "\\t";
      } else {
        result += char;
      }
    } else {
      result += char;
    }
    if (char === '\\' && !escaped) {
      escaped = true;
    } else {
      escaped = false;
    }
  }
  return result;
}

function safeParseJson(raw) {
  // Tolerate accidental ```json fences.
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to slicing the outermost JSON object.
  if (text[0] !== "{") {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  // Escape unescaped control characters inside JSON string literals.
  const cleaned = escapeControlChars(text);
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Test-case generation
// ---------------------------------------------------------------------------

function buildPrompt({ statement, code, meta }) {
  const system = [
    "You are a meticulous competitive-programming test-case generator AND solver.",
    "Follow this strict order INTERNALLY (chain of thought) before writing any output:",
    "1. SOLVE: read the statement and solve the problem yourself — decide the exact algorithm. Determine whether the indexing/positions are 0-based or 1-based by analyzing the statement and verifying it against the sample test inputs and outputs. Compare it with the candidate solution if provided.",
    "2. DESIGN diverse tests across these CATEGORIES (include every category the statement supports):",
    "     • sample        — the statement's own sample tests, EXACT given outputs, named sample-1, sample-2, …",
    "     • min-boundary  — smallest legal input (e.g. N=1, empty / single element).",
    "     • small-random  — a couple of tiny, hand-checkable random cases.",
    "     • duplicates    — many equal / repeated values.",
    "     • sorted        — already-sorted input.",
    "     • reverse       — reverse-sorted input.",
    "     • extreme       — minimum and maximum allowed values.",
    "     • constraint-limit — the largest N the constraints allow (e.g. N≈1e5 / 2e5) IF you can still compute the answer reliably; otherwise set expected:null.",
    "     • corner        — special structural cases (all same, disconnected, no solution, …).",
    "     • adversarial   — cases designed to break a common WRONG approach (greedy trap, off-by-one, missing case).",
    "     • overflow      — values forcing 64-bit handling, IF the problem can overflow 32-bit.",
    "     • precision     — tricky floating-point cases, IF the problem involves real numbers.",
    "3. VERIFY: for EACH test, solve it internally, RECOMPUTE the expected output step by step, then COMPARE against a second independent recomputation. Fix any mismatch.",
    "4. Only then emit the final JSON.",
    "",
    "Return STRICT JSON only — no markdown, no prose outside JSON. Schema:",
    "{",
    '  "approach": "giải thích NGẮN cách giải bạn dùng để tự tính đáp án (tiếng Việt)",',
    '  "tests": [',
    '    { "name": "sample-1", "category": "sample|min-boundary|small-random|duplicates|sorted|reverse|extreme|constraint-limit|corner|adversarial|overflow|precision",',
    '      "input": "<stdin text>", "expected": "<stdout text>" | null, "reason": "vì sao có test này (tiếng Việt)", "warning": "" }',
    "  ],",
    '  "notes": ["giả định, mơ hồ, hoặc cảnh báo (tiếng Việt)"]',
    "}",
    "",
    "HARD RULES:",
    "- CRITICAL: INDEXING CONVENTION (0-based vs 1-based) is the most common failure point. You MUST analyze the sample test cases and their given outputs to determine whether the problem indices/positions are 0-based or 1-based. Compare the statement's requirements with the CANDIDATE SOLUTION (if provided). If the candidate solution uses 0-based indexing and is correct, follow 0-based indexing. You must ensure your generated tests and their expected outputs strictly respect the correct indexing convention.",
    "- CRITICAL: MODULO WITH NEGATIVE NUMBERS. In languages like C++, `-3 % 2` is `-1` (not `1`), and `-4 % 2` is `0`. If the problem statement or logic involves negative numbers and modulo, simulate the exact operations (preserving negative signs) to compute correct expected outputs. Never assume `%` only yields non-negative results.",
    "- AIM FOR AT LEAST 15 tests when the statement gives enough information; cover as many of the categories above as apply. Fewer is acceptable ONLY when the problem is too small to support 15 meaningful cases.",
    "- Never guess expected outputs. Recompute every expected output by simulating your solution; verify arithmetic carefully.",
    "- If you cannot determine the exact output with certainty, set \"expected\": null and explain in \"warning\" (e.g. \"Cannot determine exact output.\"). NEVER fabricate an expected value.",
    "- Prefer expected:null over a possibly-wrong expected output.",
    "- The statement's sample tests come FIRST, named sample-1, sample-2, ..., using their EXACT given outputs.",
    "- 'input' must EXACTLY match the statement's input format (whitespace/newlines matter).",
    "- Keep each literal input under ~64 KB; for a max case that would be larger, use a smaller representative input and note it, or set expected:null.",
    "- 'approach', 'reason', 'warning', and 'notes' MUST be written in Vietnamese."
  ].join("\n");

  const metaLine = meta
    ? `Title: ${meta.title || ""}\nSource: ${meta.source || ""}\nTopic: ${meta.topic || ""}\nDifficulty: ${meta.difficulty || ""}`
    : "";

  const user = [
    "PROBLEM METADATA:",
    metaLine,
    "",
    "PROBLEM STATEMENT:",
    statement || "(no statement provided)",
    code && code.trim() ? "\nCANDIDATE SOLUTION (may help infer format; do not trust its correctness):\n" + code : ""
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function normalizeTests(parsed) {
  const rawTests = Array.isArray(parsed.tests) ? parsed.tests : [];
  const tests = rawTests.map((t, i) => {
    // expected may be null/omitted when the model is not sure — that is allowed.
    const hasStr = typeof t.expected === "string";
    const expected = hasStr ? t.expected : "";
    const warning = (t.warning && String(t.warning).trim()) || "";
    const expectedKnown = hasStr && expected.trim() !== "" && !warning;
    const category = (t.category && String(t.category).trim()) || "";
    let reason = (t.reason && String(t.reason).trim()) || "";
    if (category) reason = reason ? `[${category}] ${reason}` : `[${category}]`;
    if (warning) reason = reason ? `${reason} · ⚠ ${warning}` : `⚠ ${warning}`;
    return {
      name: (t.name && String(t.name).trim()) || `ai-${i + 1}`,
      category,
      input: typeof t.input === "string" ? t.input : "",
      expected,
      expectedKnown,
      reason
    };
  });
  const notes = Array.isArray(parsed.notes) ? parsed.notes.map((n) => String(n)) : [];
  if (parsed.approach && String(parsed.approach).trim()) {
    notes.push("Cách AI tự tính đáp án: " + String(parsed.approach).trim());
  }
  if (tests.some((t) => !t.expectedKnown)) {
    notes.unshift("⚠ Một số test AI để trống đáp án (không chắc chắn — tránh bịa). Hãy tự kiểm tra trước khi áp dụng.");
  }
  return { tests, notes };
}

async function generateTests({ settings, statement, code, meta }) {
  if (!statement || !statement.trim()) {
    throw new Error("Statement is empty. Paste the problem statement first.");
  }
  // Cache keyed on statement + code so identical inputs are instant.
  const key = cacheKey("tests", settings.model, statement.trim() + "\u0000" + String(code || ""));
  const hit = cacheGet(key);
  if (hit) { log("Generate tests cache hit", `${hit.tests.length} tests`); return hit; }

  log("Generate tests start");
  const content = await chat({
    settings,
    messages: buildPrompt({ statement, code, meta }),
    jsonMode: true,
    maxTokens: 8000, // room for 15+ diverse tests
    timeoutMs: 120000
  });

  let parsed;
  try {
    parsed = safeParseJson(content);
  } catch {
    throw new Error("AI did not return valid JSON. Try again or adjust the model.");
  }

  const result = normalizeTests(parsed);
  log("Generate tests success", `${result.tests.length} tests`);
  cacheSet(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Image OCR -> Markdown (uses the configured multimodal model, e.g. Gemini/GPT-4o)
// ---------------------------------------------------------------------------

const OCR_SYSTEM = [
  "You transcribe competitive-programming problem screenshots into clean GitHub-flavored Markdown.",
  "Reproduce the FULL problem faithfully and preserve its structure. When the following parts exist, keep them as clearly separated sections, in this order:",
  "  - Problem title (as a level-1 heading)",
  "  - Statement / description",
  "  - Input format",
  "  - Output format",
  "  - Constraints",
  "  - Sample Input / Sample Output (one fenced ``` code block per sample, keeping exact whitespace and line breaks)",
  "  - Explanation / Notes",
  "Use headings like '## Input', '## Output', '## Constraints', '## Sample Input 1', '## Sample Output 1', '## Explanation' when those parts are present.",
  "Keep math readable in plain text (e.g. 10^9, a_i, n <= 2*10^5).",
  "Transcribe EVERY sample test exactly — do not summarize, round, or omit numbers.",
  "Do NOT solve the problem, do NOT add commentary — output only the transcribed Markdown."
].join("\n");

async function ocrImage({ settings, dataUrl }) {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) {
    throw new Error("OCR failed: không nhận được ảnh hợp lệ.");
  }
  log("OCR start", "image → markdown");
  let content;
  try {
    content = await chat({
      settings,
      messages: [
        { role: "system", content: OCR_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this problem statement to Markdown:" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      maxTokens: 4000,
      timeoutMs: 90000
    });
  } catch (error) {
    // Re-frame any model error as an OCR failure with the real reason attached.
    if (error.code === "NO_KEY") throw error;
    log("OCR failed", error.message);
    const e = new Error(`OCR failed: ${error.message}`);
    e.code = "OCR_FAILED";
    throw e;
  }
  const md = content.trim();
  if (!md) {
    log("OCR failed", "empty transcription");
    const e = new Error("OCR failed: mô hình không đọc được chữ nào. Ảnh có thể quá mờ, bị cắt, hoặc không chứa văn bản.");
    e.code = "OCR_EMPTY";
    throw e;
  }
  log("OCR success", `${md.length} chars`);
  return md;
}

// ---------------------------------------------------------------------------
// Statement analysis -> Vietnamese structured summary + metadata
// ---------------------------------------------------------------------------
const ANALYZE_SYSTEM = [
  "Bạn là trợ lý phân tích đề thi lập trình thi đấu (competitive programming).",
  "Đọc đề bài và trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON), theo schema:",
  "{",
  '  "title": "tên bài ngắn gọn hoặc rỗng",',
  '  "source": "USACO|Codeforces|CSES|AtCoder|VNOI|... hoặc rỗng nếu không rõ",',
  '  "difficulty": "easy|medium|hard",',
  '  "usacoTier": "Bronze|Silver|Gold|Platinum hoặc rỗng nếu không phải kiểu USACO",',
  '  "cfRating": 1500,   // số nguyên ước lượng độ khó theo thang Codeforces (800–3500), 0 nếu không ước lượng được',
  '  "tags": ["dp","graphs", ...],',
  '  "tomTat": "Tóm tắt đề bài bằng tiếng Việt, 2-3 câu, nêu rõ cần tính/ làm gì",',
  '  "kyThuat": ["Prefix Sum", "Binary Search", ...],   // Expected Techniques — kỹ thuật/thuật toán nên dùng',
  '  "rangBuoc": "Tóm tắt các ràng buộc quan trọng (kích thước n, giới hạn giá trị) bằng tiếng Việt",',
  '  "doPhucTapYeuCauTime": "Độ phức tạp thời gian yêu cầu ước lượng (vd: O(N) hoặc O(N log N)) dựa trên giới hạn thời gian và kích thước N.",',
  '  "doPhucTapYeuCauSpace": "Độ phức tạp bộ nhớ yêu cầu ước lượng (vd: O(N) hoặc O(1)).",',
  '  "doKho": "Nhận xét độ khó bằng tiếng Việt (vd: Bronze / dễ, Silver / trung bình)",',
  '  "luuY": "Các lưu ý / cạm bẫy cần cẩn thận bằng tiếng Việt (vd: cẩn thận tràn số long long, off-by-one, cạnh đôi...)"',
  "}",
  "QUY TẮC:",
  "- TẤT CẢ phần mô tả (tomTat, rangBuoc, doKho, luuY) PHẢI viết bằng tiếng Việt tự nhiên.",
  "- 'kyThuat' (Expected Techniques) là tên kỹ thuật/thuật toán (có thể giữ tiếng Anh quen thuộc như 'DSU', 'Dijkstra').",
  "- 'cfRating' là số nguyên ước lượng theo thang Codeforces; ước lượng hợp lý cả khi đề là USACO/VNOI (vd Bronze≈800–1200, Silver≈1200–1600, Gold≈1600–2100, Platinum≈2100+).",
  "- Suy luận từ nội dung đề; dùng chuỗi rỗng / mảng rỗng / 0 khi không chắc.",
  "- TUYỆT ĐỐI KHÔNG giải bài, không đưa lời giải hay công thức cuối cùng."
].join("\n");

function normalizeAnalysis(parsed) {
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [];
  const kyThuat = Array.isArray(parsed.kyThuat) ? parsed.kyThuat.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : (Array.isArray(parsed.expectedTechnique) ? parsed.expectedTechnique.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : []);
  const tier = ["Bronze", "Silver", "Gold", "Platinum"].find(
    (t) => String(parsed.usacoTier || "").toLowerCase() === t.toLowerCase()
  ) || "";
  let cfRating = Math.round(Number(parsed.cfRating) || 0);
  if (cfRating && (cfRating < 500 || cfRating > 4000)) cfRating = 0; // implausible → drop
  return {
    title: String(parsed.title || "").trim(),
    source: String(parsed.source || "").trim(),
    difficulty: ["easy", "medium", "hard"].includes(parsed.difficulty) ? parsed.difficulty : "",
    usacoTier: tier,
    cfRating,
    tags,
    // Vietnamese display fields
    tomTat: String(parsed.tomTat || parsed.problemSummary || "").trim(),
    kyThuat,
    rangBuoc: String(parsed.rangBuoc || parsed.constraintsSummary || "").trim(),
    doPhucTapYeuCauTime: String(parsed.doPhucTapYeuCauTime || "").trim(),
    doPhucTapYeuCauSpace: String(parsed.doPhucTapYeuCauSpace || "").trim(),
    doKho: String(parsed.doKho || parsed.difficultyEstimate || "").trim(),
    luuY: String(parsed.luuY || "").trim()
  };
}

async function analyzeStatement({ settings, statement }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty.");
  const key = cacheKey("analyze", settings.model, statement.trim());
  const hit = cacheGet(key);
  if (hit) { log("AI analyze cache hit"); return hit; }

  log("AI analyze start");
  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 1200,
    timeoutMs: 60000,
    messages: [
      { role: "system", content: ANALYZE_SYSTEM },
      { role: "user", content: statement }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("AI analysis did not return valid JSON."); }
  const result = normalizeAnalysis(parsed);
  log("AI analyze success", result.kyThuat.join(", ") || "no techniques");
  cacheSet(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Sample extraction — pull official Sample Input/Output pairs from a statement.
// Display-only; the test generator still produces the authoritative test list.
// ---------------------------------------------------------------------------

function extractSamples(statement) {
  const text = String(statement || "");
  if (!text.trim()) return [];

  // Collect fenced code blocks together with the heading/word right before them.
  const blocks = [];
  const re = /(^|\n)[^\n]*?\b(input|output)\b[^\n]*\n+```[a-zA-Z]*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ kind: m[2].toLowerCase(), body: m[3].replace(/\s+$/, "") });
  }

  const samples = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "input") {
      const out = blocks[i + 1] && blocks[i + 1].kind === "output" ? blocks[i + 1] : null;
      samples.push({ input: blocks[i].body, output: out ? out.body : "" });
      if (out) i++;
    }
  }

  // Fallback: pair up bare consecutive code blocks if no input/output labels matched.
  if (samples.length === 0) {
    const bare = [];
    const bre = /```[a-zA-Z]*\n([\s\S]*?)```/g;
    let b;
    while ((b = bre.exec(text)) !== null) bare.push(b[1].replace(/\s+$/, ""));
    for (let i = 0; i + 1 < bare.length; i += 2) {
      samples.push({ input: bare[i], output: bare[i + 1] });
    }
  }
  return samples.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Leveled hints — Vietnamese, never the full solution
// ---------------------------------------------------------------------------

async function getHint({ settings, statement, code, level }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty — paste the problem first.");
  const lvl = Math.min(Math.max(Number(level) || 1, 1), 3);
  const intensity = {
    1: "Mức 1: gợi ý nhẹ. Chỉ hướng tư duy hoặc quan sát mấu chốt. Chưa cần nêu tên thuật toán.",
    2: "Mức 2: nêu tên kỹ thuật/ý tưởng chính và quan sát quan trọng, NHƯNG không nêu thuật toán đầy đủ hay cách cài đặt.",
    3: "Mức 3: phác thảo hướng làm ở mức cao trong 2-3 bước. Vẫn KHÔNG có code, KHÔNG lời giải đầy đủ, KHÔNG công thức cuối làm lộ đáp án."
  }[lvl];

  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 600,
    timeoutMs: 60000,
    messages: [
      {
        role: "system",
        content: [
          "Bạn là HLV lập trình thi đấu đưa gợi ý theo mức độ. Trả về DUY NHẤT JSON hợp lệ:",
          '{ "technique": "tên kỹ thuật ngắn hoặc rỗng", "hint": "tối đa 3 câu, tiếng Việt", "difficulty": "Easy|Medium|Hard" }',
          "LUẬT CỨNG: không bao giờ đưa lời giải đầy đủ, không viết code, không đưa công thức cuối hay các bước giải bài một cách tầm thường.",
          intensity,
          "'hint' viết bằng tiếng Việt, tối đa 3 câu."
        ].join("\n")
      },
      {
        role: "user",
        content: `PROBLEM:\n${statement}\n\nMY CURRENT CODE (may be incomplete):\n${(code || "").slice(0, 4000)}`
      }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Hint response was not valid JSON."); }
  return {
    level: lvl,
    technique: String(parsed.technique || "").trim(),
    hint: String(parsed.hint || "").trim(),
    difficulty: String(parsed.difficulty || "").trim()
  };
}

// ---------------------------------------------------------------------------
// OCR cleanup — repair raw OCR text (esp. Vietnamese diacritics) WITHOUT
// changing meaning, summarizing, or dropping any sample. Runs after Tesseract /
// MarkItDown and before analysis. Cached by hash so re-OCR of the same image is
// free. On any failure the caller falls back to the raw text.
// ---------------------------------------------------------------------------

const OCR_CLEANUP_SYSTEM = [
  "Bạn là bộ HẬU XỬ LÝ văn bản OCR cho đề lập trình thi đấu (ưu tiên đề tiếng Việt: VNOI, VOI, HSGQG).",
  "Đầu vào là văn bản OCR THÔ, thường bị mất dấu tiếng Việt và lỗi ký tự (vd: 'duong di'→'đường đi', 'vj tri'→'vị trí', 'thdi gian'→'thời gian', 'vat pham'→'vật phẩm', 'dudng'/'d�n'→'đường'/'dẫn').",
  "NHIỆM VỤ:",
  "- Khôi phục dấu tiếng Việt đúng ngữ cảnh.",
  "- Sửa lỗi ký tự OCR (ký tự thay thế �, chữ dính, nhầm 0/O, 1/l/I, 5/S…) khi CHẮC CHẮN từ ngữ cảnh.",
  "- Giữ NGUYÊN cấu trúc, công thức, biến (n, a_i, 10^9), và MỌI test mẫu (Input/Output) — sao chép chính xác từng số, từng khoảng trắng, từng dòng.",
  "LUẬT CỨNG:",
  "- KHÔNG tóm tắt. KHÔNG diễn giải lại. KHÔNG thêm/bớt nội dung. KHÔNG giải bài.",
  "- KHÔNG bỏ sót hay làm tròn bất kỳ ví dụ / con số nào.",
  "- Nếu một đoạn không chắc, giữ nguyên thay vì bịa.",
  "- Trả về DUY NHẤT văn bản đã làm sạch (giữ định dạng Markdown nếu có), không kèm lời bình."
].join("\n");

// Heuristic: is OCR output too corrupt to safely "clean up"? When it is, the
// cleanup model would hallucinate a plausible-but-wrong statement, so we skip it
// and return the raw text. Conservative on purpose — valid Vietnamese (lots of
// accented LETTERS) must NOT trip it; we only flag heavy replacement chars (�)
// or text that is mostly non-letter noise.
function looksGarbled(text) {
  const s = String(text || "");
  const len = s.length;
  if (len < 40) return false; // too short to judge — let it through
  const replacement = (s.match(/�/g) || []).length;
  if (replacement / len > 0.03) return true;
  const letters = (s.match(/\p{L}/gu) || []).length;
  const spaces = (s.match(/\s/g) || []).length;
  const nonSpace = len - spaces;
  if (nonSpace > 0 && letters / nonSpace < 0.35) return true; // mostly symbols/noise
  return false;
}

async function cleanupOcr({ settings, rawText }) {
  const text = String(rawText || "").trim();
  if (!text) return { text: "", cleaned: false };
  if (!settings || !settings.apiKey) return { text, cleaned: false }; // no key → raw passthrough
  if (looksGarbled(text)) {
    log("OCR cleanup skipped", "văn bản quá nhiễu — bỏ làm sạch để tránh bịa nội dung");
    return { text, cleaned: false, garbled: true };
  }

  const key = cacheKey("ocrclean", settings.model, text);
  const hit = cacheGet(key);
  if (hit) { log("OCR cleanup cache hit"); return hit; }

  log("OCR cleanup start", `${text.length} chars`);
  let content;
  try {
    content = await chat({
      settings,
      maxTokens: 8000,
      timeoutMs: 90000,
      messages: [
        { role: "system", content: OCR_CLEANUP_SYSTEM },
        { role: "user", content: text }
      ]
    });
  } catch (error) {
    log("OCR cleanup failed", error.message);
    return { text, cleaned: false }; // graceful fallback to raw OCR
  }
  const cleanedText = String(content || "").trim();
  // Guard against the model collapsing the statement: if it shrank drastically,
  // keep the raw text rather than risk losing samples.
  if (!cleanedText || cleanedText.length < text.length * 0.5) {
    log("OCR cleanup rejected", `too short (${cleanedText.length} vs ${text.length})`);
    return { text, cleaned: false };
  }
  const result = { text: cleanedText, cleaned: true };
  cacheSet(key, result);
  log("OCR cleanup success", `${cleanedText.length} chars`);
  return result;
}

// ---------------------------------------------------------------------------
// Learning from WA — analyze a user's repeated wrong answers. The AI explains
// WHERE the thinking is wrong, which cases are missing, which edge cases are
// unhandled, and which technique to use. It NEVER rewrites the user's code.
// ---------------------------------------------------------------------------

const REVIEW_SYSTEM = [
  "Bạn là HLV lập trình thi đấu giàu kinh nghiệm, đang giúp học sinh hiểu VÌ SAO bài bị Wrong Answer.",
  "Bạn nhận: đề bài, code hiện tại của học sinh, và lịch sử các lần WA (kèm output sai gần nhất).",
  "Trả về DUY NHẤT JSON hợp lệ (không markdown ngoài JSON):",
  "{",
  '  "tongQuan": "1-2 câu chốt LỖI TƯ DUY LỚN NHẤT đang khiến bài sai (cụ thể, không nói chung chung), tiếng Việt",',
  '  "saiTuDuy": ["mỗi ý: gọi tên hiểu lầm cốt lõi + nêu 1 input nhỏ hoặc điều kiện cụ thể làm lộ nó, tiếng Việt"],',
  '  "truongHopThieu": ["trường hợp đầu vào chưa xử lý / chưa cover, tiếng Việt"],',
  '  "edgeCase": ["edge case cụ thể dễ làm sai (n=1, rỗng, trùng, tràn số, …), tiếng Việt"],',
  '  "kyThuatNenDung": ["kỹ thuật/thuật toán nên dùng hoặc bổ sung"]',
  "}",
  "LUẬT CỨNG:",
  "- TUYỆT ĐỐI KHÔNG viết lại code, KHÔNG đưa code sửa, KHÔNG đưa lời giải hoàn chỉnh hay công thức cuối.",
  "- Chỉ chẩn đoán và định hướng để học sinh tự sửa.",
  "- Mọi nội dung viết bằng tiếng Việt; mảng rỗng nếu không có ý nào."
].join("\n");

async function reviewMistakes({ settings, statement, code, waHistory }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty — không có đề để phân tích.");
  if (!code || !code.trim()) throw new Error("Chưa có code để phân tích lỗi.");

  const waText = (Array.isArray(waHistory) ? waHistory : []).slice(0, 5).map((w, i) => {
    const parts = [`Lần WA #${i + 1} (${w.at || ""}, verdict ${w.verdict || "WA"}${w.passed != null ? `, ${w.passed}/${w.total} pass` : ""})`];
    if (w.stdout) parts.push(`output (rút gọn):\n${String(w.stdout).slice(0, 800)}`);
    if (w.stderr) parts.push(`stderr:\n${String(w.stderr).slice(0, 400)}`);
    return parts.join("\n");
  }).join("\n\n");

  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 1500,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: REVIEW_SYSTEM },
      {
        role: "user",
        content: `ĐỀ BÀI:\n${statement.slice(0, 8000)}\n\nCODE HIỆN TẠI:\n${code.slice(0, 8000)}\n\nLỊCH SỬ WA:\n${waText || "(không có chi tiết output)"}`
      }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Phản hồi phân tích lỗi không phải JSON hợp lệ."); }
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    tongQuan: String(parsed.tongQuan || "").trim(),
    saiTuDuy: arr(parsed.saiTuDuy),
    truongHopThieu: arr(parsed.truongHopThieu),
    edgeCase: arr(parsed.edgeCase),
    kyThuatNenDung: arr(parsed.kyThuatNenDung)
  };
}

// ---------------------------------------------------------------------------
// Helper-code generation for the Stress Tester — the AI writes a random-input
// GENERATOR (reads argv[1] as seed/size) or a correct-but-slow BRUTE reference.
// Returns raw C++ source (fences stripped).
// ---------------------------------------------------------------------------

function stripCodeFences(raw) {
  let t = String(raw || "").trim();
  const fence = t.match(/```(?:cpp|c\+\+|c)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return t;
}

async function generateHelper({ settings, statement, kind, mainCode }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty — cần đề bài để sinh code.");
  const isGen = kind === "generator";
  const sys = isGen
    ? [
        "You write a C++17 RANDOM TEST GENERATOR for stress-testing a competitive-programming problem.",
        "Contract: the program reads its FIRST command-line argument argv[1] as an integer seed AND uses it to bound the size (seed itself, or a small function of it) so EARLY seeds make SMALL inputs.",
        "Seed the RNG with that argument: `mt19937 rng(atoi(argv[1]));`.",
        "Print ONE valid random input to stdout, EXACTLY matching the problem's input format and respecting (small) constraints — keep N tiny (e.g. ≤ seed or ≤ 8) so a brute force can solve it fast.",
        "Output ONLY the C++ source. No markdown, no comments-as-prose, no explanation."
      ].join("\n")
    : [
        "You write a C++17 BRUTE-FORCE / reference solution for a competitive-programming problem.",
        "It must be OBVIOUSLY CORRECT (simplest possible algorithm — full search / simulation), even if slow.",
        "Read from stdin, write to stdout, matching the problem's exact I/O format.",
        "Do NOT optimize; correctness over speed. Output ONLY the C++ source — no markdown, no prose."
      ].join("\n");

  const content = await chat({
    settings,
    maxTokens: 2500,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `PROBLEM STATEMENT:\n${statement}\n\n${mainCode ? "USER SOLUTION (for I/O format reference only):\n" + String(mainCode).slice(0, 4000) : ""}` }
    ]
  });
  const code = stripCodeFences(content);
  if (!/#include|int\s+main/.test(code)) throw new Error("AI không trả về code C++ hợp lệ.");
  return code;
}

// ---------------------------------------------------------------------------
// AI Solution Template Generator — writes a C++ skeleton (boilerplate)
// ---------------------------------------------------------------------------
async function generateTemplate({ settings, statement }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty — cần đề bài để sinh template.");
  const sys = [
    "You write a C++17 template/skeleton (boilerplate) for a competitive-programming problem based on the problem description.",
    "Rules:",
    "1. The template should NOT be a complete solution. Do NOT implement the actual algorithm or final formulas.",
    "2. It must set up standard fast I/O: `std::ios_base::sync_with_stdio(false); std::cin.tie(NULL);`.",
    "3. It must parse the input correctly (read variables, read arrays, read graphs) based on the problem description.",
    "4. It must contain comments in Vietnamese (or placeholders like `// TODO: ...`) detailing the logical steps needed to solve the problem.",
    "5. It should define appropriate data structures (e.g. global arrays with appropriate sizes matching constraints, structs, or types) but leave the logic blank.",
    "6. Output ONLY the C++ source code. No markdown code fences, no comments-as-prose, no explanations outside the code."
  ].join("\n");

  const content = await chat({
    settings,
    maxTokens: 2000,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `PROBLEM STATEMENT:\n${statement}` }
    ]
  });
  const code = stripCodeFences(content);
  if (!/#include|int\s+main/.test(code)) throw new Error("AI không trả về template C++ hợp lệ.");
  return code;
}

// ---------------------------------------------------------------------------
// AI Code Review — diagnose bugs / complexity / edge-cases / risks in the
// user's CURRENT code. Points at problems; does not hand over a full solution.
// ---------------------------------------------------------------------------

const REVIEW_CODE_SYSTEM = [
  "Bạn là reviewer code lập trình thi đấu (C++) giàu kinh nghiệm.",
  "Nhận đề bài + code của học sinh. Trả về DUY NHẤT JSON hợp lệ:",
  "{",
  '  "tongQuan": "1-2 câu nhận xét chung (tiếng Việt)",',
  '  "loi": ["bug hoặc khả năng sai, nêu rõ dòng/biến nếu được (tiếng Việt)"],',
  '  "doPhucTap": "Nhận xét độ phức tạp thời gian/bộ nhớ của code này (tiếng Việt)",',
  '  "rui_ro": ["rủi ro: tràn số (int vs long long), UB, chưa khởi tạo, chỉ số ngoài mảng, chia 0... (tiếng Việt)"],',
  '  "edgeCase": ["edge case code có thể bỏ sót (tiếng Việt)"],',
  '  "style": ["góp ý nhỏ về cách viết / dễ đọc (tiếng Việt)"]',
  "}",
  "LUẬT: được chỉ ra chỗ sai trong code của HỌ và gợi ý hướng sửa, NHƯNG không viết lại toàn bộ lời giải tối ưu nếu code họ đang sai thuật toán — chỉ nói thuật toán nào phù hợp hơn. Mảng rỗng nếu không có ý."
].join("\n");

async function reviewCode({ settings, statement, code }) {
  if (!code || !code.trim()) throw new Error("Chưa có code để review.");
  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 1600,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: REVIEW_CODE_SYSTEM },
      { role: "user", content: `ĐỀ BÀI:\n${(statement || "(không có đề)").slice(0, 6000)}\n\nCODE:\n${code.slice(0, 9000)}` }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Phản hồi review không phải JSON hợp lệ."); }
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    tongQuan: String(parsed.tongQuan || "").trim(),
    loi: arr(parsed.loi),
    doPhucTap: String(parsed.doPhucTap || "").trim(),
    rui_ro: arr(parsed.rui_ro),
    edgeCase: arr(parsed.edgeCase),
    style: arr(parsed.style)
  };
}

// ---------------------------------------------------------------------------
// Explain Compile Error — when the user gets a CE, the AI translates the
// cryptic g++ template error into simple Vietnamese and points to the line.
// ---------------------------------------------------------------------------

const EXPLAIN_CE_SYSTEM = [
  "Bạn là trợ giảng lập trình C++. Học sinh vừa biên dịch code và gặp lỗi Compile Error (CE).",
  "Nhiệm vụ của bạn: Giải thích lỗi này bằng tiếng Việt sao cho người mới học dễ hiểu nhất.",
  "Dựa vào thông báo lỗi (stderr) và mã nguồn (code) được cung cấp, hãy chỉ ra CỤ THỂ dòng code nào gây lỗi và cách sửa (nếu rõ ràng).",
  "Trả lời ngắn gọn bằng văn xuôi (dùng Markdown), không tự ý viết lại toàn bộ chương trình của học sinh.",
  "KHÔNG được lộ lời giải của bài toán (nếu bạn đoán được bài toán)."
].join("\n");

async function explainCompileError({ settings, code, stderr }) {
  if (!stderr || !stderr.trim()) throw new Error("Không có thông báo lỗi để giải thích.");
  const content = await chat({
    settings,
    maxTokens: 600,
    timeoutMs: 45000,
    messages: [
      { role: "system", content: EXPLAIN_CE_SYSTEM },
      { role: "user", content: `MÃ NGUỒN:\n${(code || "").slice(0, 4000)}\n\nLỖI BIÊN DỊCH (STDERR):\n${stderr.slice(0, 4000)}` }
    ]
  });
  return String(content || "").trim();
}

// ---------------------------------------------------------------------------
// Auto-Fix — after WA, analyze the code + statement + test result, find the
// buggy lines, and return a JSON diff that the frontend can apply directly.
// The 'search' field MUST match the user's code EXACTLY (whitespace-sensitive).
// ---------------------------------------------------------------------------

const AUTOFIX_SYSTEM = [
  "Bạn là chuyên gia debug C++ lập trình thi đấu.",
  "Nhận: đề bài, code bị WA, và kết quả test sai gần nhất (input/expected/actual output).",
  "NHIỆM VỤ: Tìm chỗ sai trong code và trả về CÁC BẢN VÁ nhỏ nhất có thể để sửa.",
  "Trả về DUY NHẤT JSON hợp lệ (không markdown ngoài JSON):",
  "{",
  '  "explanation": "Vì sao code sai: gọi tên NGUYÊN NHÂN GỐC / lỗi tư duy (không chỉ mô tả triệu chứng), bằng tiếng Việt",',
  '  "fixes": [',
  '    { "search": "đoạn code gốc CẦN THAY THẾ — sao chép CHÍNH XÁC từ code gốc",',
  '      "replace": "đoạn code đã sửa" }',
  '  ]',
  "}",
  "LUẬT CỨNG:",
  "- 'search' PHẢI là bản sao NGUYÊN VĂN (byte-for-byte) của một đoạn text CÓ THẬT trong code gốc — giữ ĐÚNG khoảng trắng, tab, xuống dòng.",
  "- Nếu không tìm được chuỗi khớp chính xác, ĐỂ TRỐNG fixes: [].",
  "- Mỗi fix nên nhỏ (1-5 dòng); tránh thay thế toàn bộ hàm.",
  "- 'explanation' viết bằng tiếng Việt, tối đa 3 câu, PHẢI nêu nguyên nhân gốc cụ thể (vd: 'dùng int nên tràn khi tích vượt ~2 tỉ'), không nói chung chung.",
  "- TUYỆT ĐỐI KHÔNG bịa search string không có trong code gốc."
].join("\n");

async function autoFixCode({ settings, statement, code, testResult }) {
  if (!code || !code.trim()) throw new Error("Chưa có code để sửa.");

  log("Auto-fix start");
  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 1500,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: AUTOFIX_SYSTEM },
      {
        role: "user",
        content: `ĐỀ BÀI:\n${(statement || "(không có đề)").slice(0, 6000)}\n\nCODE GỐC (GIỮ NGUYÊN ĐỊNH DẠNG):\n${code.slice(0, 9000)}\n\nKẾT QUẢ TEST SAI GẦN NHẤT:\n${String(testResult || "(không có)").slice(0, 2000)}`
      }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Phản hồi auto-fix không phải JSON hợp lệ."); }

  const explanation = String(parsed.explanation || "").trim();
  const rawFixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];

  // Validate: only keep fixes whose 'search' actually exists in the original code.
  const fixes = rawFixes
    .map((f) => ({
      search: String(f.search || ""),
      replace: String(f.replace || "")
    }))
    .filter((f) => f.search && code.includes(f.search));

  log("Auto-fix success", `${fixes.length}/${rawFixes.length} valid fixes`);
  return { explanation, fixes };
}

// ---------------------------------------------------------------------------
// Dry-Run Debugger — simulate executing C++ code step-by-step, tracking
// specific variables through iterations. Returns a Markdown table.
// ---------------------------------------------------------------------------

const DRYRUN_SYSTEM = [
  "Bạn là trình biên dịch C++ ảo. Nhiệm vụ: DRY-RUN (chạy tay) code C++ với input được cung cấp.",
  "Theo dõi CHÍNH XÁC các biến được chỉ định qua từng bước thực thi.",
  "YÊU CẦU:",
  "- Trả về 1 bảng Markdown (Markdown table) với các cột: Bước | Dòng code/Vị trí | [tên biến 1] | [tên biến 2] | ...",
  "- Mỗi dòng bảng tương ứng với 1 thay đổi trạng thái (gán biến, vào vòng lặp, kiểm tra điều kiện quan trọng).",
  "- Với vòng lặp: liệt kê MỖI iteration (tối đa 30 dòng; nếu nhiều hơn thì ghi '...' và nhảy đến iteration cuối).",
  "- Với mảng/vector: ghi giá trị ở dạng `[1, 2, 3]` hoặc `dp = [0, 1, 1, 2]`.",
  "- Với DP 2 chiều: ghi dạng hàng đang cập nhật, ví dụ `dp[2] = [0, 3, 5]`.",
  "- Kết thúc bằng 1 dòng ghi giá trị output cuối cùng.",
  "- Viết bằng tiếng Việt, ngắn gọn.",
  "- KHÔNG giải thích thuật toán, CHỈ mô phỏng thực thi."
].join("\n");

async function dryRunDebugger({ settings, code, input, targetVariables }) {
  if (!code || !code.trim()) throw new Error("Chưa có code để mô phỏng.");
  if (!input || !String(input).trim()) throw new Error("Cần input để mô phỏng.");

  const vars = Array.isArray(targetVariables)
    ? targetVariables.map((v) => String(v).trim()).filter(Boolean)
    : String(targetVariables || "").split(/[,;]+/).map((v) => v.trim()).filter(Boolean);

  log("Dry-run start", `vars: ${vars.join(", ") || "(auto)"}`);
  const content = await chat({
    settings,
    maxTokens: 2000,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: DRYRUN_SYSTEM },
      {
        role: "user",
        content: `CODE C++:\n${code.slice(0, 8000)}\n\nINPUT:\n${String(input).slice(0, 2000)}\n\nCÁC BIẾN CẦN THEO DÕI: ${vars.length ? vars.join(", ") : "(tự chọn các biến quan trọng nhất)"}`
      }
    ]
  });
  const result = String(content || "").trim();
  log("Dry-run success", `${result.length} chars`);
  return result;
}

// ---------------------------------------------------------------------------
// Explain Test Case — dry-run a sample test and explain WHY the given input
// maps to the given output, step by step, following the problem's rules.
// Returns plain Markdown (not JSON) for rich rendering.
// ---------------------------------------------------------------------------

const EXPLAIN_TESTCASE_SYSTEM = [
  "Bạn là trợ giảng thuật toán giỏi. Học sinh đang đọc một bài tập lập trình thi đấu và KHÔNG HIỂU vì sao Input mẫu lại sinh ra Output mẫu.",
  "Bạn nhận: đề bài, một cặp Input/Output mẫu.",
  "NHIỆM VỤ: Dry-run (mô phỏng chạy tay) từng bước logic để chứng minh Input → Output theo đúng luật bài toán.",
  "YÊU CẦU:",
  "- Bắt đầu bằng 1 câu tóm siêu ngắn bài toán yêu cầu gì.",
  "- Liệt kê từng bước xử lý dữ liệu từ Input: đọc giá trị, tính toán trung gian, so sánh, v.v.",
  "- Kết luận vì sao ra đúng Output đó.",
  "- Dùng Markdown (heading nhỏ, danh sách, **bold** cho giá trị quan trọng, `code` cho biến/số).",
  "- Viết bằng tiếng Việt, ngắn gọn dễ hiểu, TUYỆT ĐỐI KHÔNG viết code lời giải.",
  "- Nếu Output có nhiều dòng/giá trị, giải thích lần lượt từng phần."
].join("\n");

async function explainTestCase({ settings, statement, input, output }) {
  if (!statement || !statement.trim()) throw new Error("Chưa có đề bài để giải thích.");
  if (!input && !output) throw new Error("Cần ít nhất Input hoặc Output để giải thích.");

  const key = cacheKey("explain-tc", settings.model, `${statement.trim()}\0${input}\0${output}`);
  const hit = cacheGet(key);
  if (hit) { log("Explain test-case cache hit"); return hit; }

  log("Explain test-case start");
  const content = await chat({
    settings,
    maxTokens: 1500,
    timeoutMs: 60000,
    messages: [
      { role: "system", content: EXPLAIN_TESTCASE_SYSTEM },
      {
        role: "user",
        content: `ĐỀ BÀI:\n${statement.slice(0, 8000)}\n\nINPUT MẪU:\n${String(input || "").slice(0, 2000)}\n\nOUTPUT MẪU:\n${String(output || "").slice(0, 2000)}`
      }
    ]
  });
  const result = String(content || "").trim();
  cacheSet(key, result);
  log("Explain test-case success", `${result.length} chars`);
  return result;
}

// ---------------------------------------------------------------------------
// Post-AC Editorial — once a problem is AC, produce a concise "lời giải chuẩn"
// (allowed to reveal the full solution; the student has already solved it). The
// output is a small JSON record so the UI can render structured sections; it's
// cached on disk keyed by statement hash, so opening it a second time is free.
// ---------------------------------------------------------------------------

const EDITORIAL_SYSTEM = [
  "Bạn là biên tập viên editorial cho lập trình thi đấu C++. Học sinh ĐÃ giải xong (AC) bài này.",
  "Nhiệm vụ: viết LỜI GIẢI CHUẨN ngắn gọn để học sinh đối chiếu cách tiếp cận của mình.",
  "Vì bài đã AC, bạn được phép trình bày thẳng thuật toán đúng (KHÔNG cần che giấu).",
  "Trả về DUY NHẤT JSON hợp lệ — không markdown ngoài JSON. Schema:",
  "{",
  '  "loiGiai": "Lời giải chuẩn dưới dạng Markdown, tiếng Việt, súc tích (tối đa ~10 câu). Có thể dùng `code` inline cho biến/công thức; KHÔNG kèm cả khối code C++.",',
  '  "doPhucTap": "VD: \\"O(n log n) thời gian, O(n) bộ nhớ\\" — kèm 1 câu giải thích vì sao đó là chặn tốt cho ràng buộc của đề.",',
  '  "kyThuat": ["tên kỹ thuật chính 1", "tên kỹ thuật phụ 2 (nếu có)"] ,',
  '  "baiHoc": ["1 bài học rút ra từ bài này (tiếng Việt)", "có thể có 1–3 mục"],',
  '  "luuY": "1 câu cảnh báo về bẫy phổ biến / edge case dễ sai, hoặc \\"\\" nếu không có."',
  "}",
  "LUẬT CỨNG:",
  "- TẤT CẢ chuỗi PHẢI là tiếng Việt tự nhiên (trừ tên kỹ thuật/thuật ngữ chuẩn).",
  "- loiGiai phải tập trung vào TƯ DUY thuật toán, KHÔNG kèm full source C++.",
  "- doPhucTap phải khớp với loiGiai; nếu không chắc chặn dưới, ghi chặn trên đã biết.",
  "- Nếu đề bài thiếu thông tin (chỉ vài câu, không có ràng buộc), ghi loiGiai = \"\" và luuY giải thích vì sao bỏ qua.",
  "- Không bịa ràng buộc, không nhắc đến editorial trực tuyến nào."
].join("\n");

function normalizeEditorial(parsed) {
  const arr = (x) => Array.isArray(x) ? x.map((s) => String(s || "").trim()).filter(Boolean) : [];
  return {
    loiGiai: String(parsed.loiGiai || "").trim(),
    doPhucTap: String(parsed.doPhucTap || "").trim(),
    kyThuat: arr(parsed.kyThuat),
    baiHoc: arr(parsed.baiHoc),
    luuY: String(parsed.luuY || "").trim()
  };
}

async function generateEditorial({ settings, statement, code, analysis }) {
  if (!statement || !statement.trim()) throw new Error("Chưa có đề bài để viết lời giải.");

  // Pass the AC code + analysis as context so the editorial aligns with what
  // the student already did (technique they used, complexity they hit).
  const ctxBits = [];
  if (analysis) {
    if (analysis.tomTat) ctxBits.push(`Tóm tắt đề: ${analysis.tomTat}`);
    if (analysis.rangBuoc) ctxBits.push(`Ràng buộc: ${analysis.rangBuoc}`);
    if (Array.isArray(analysis.kyThuat) && analysis.kyThuat.length) ctxBits.push(`Kỹ thuật theo phân tích: ${analysis.kyThuat.join(", ")}`);
  }
  const ctx = ctxBits.length ? `\n\nPHÂN TÍCH ĐÃ CÓ:\n${ctxBits.join("\n")}` : "";

  log("Editorial start");
  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 900,
    timeoutMs: 60000,
    messages: [
      { role: "system", content: EDITORIAL_SYSTEM },
      {
        role: "user",
        content: `ĐỀ BÀI:\n${statement.slice(0, 7000)}${ctx}\n\nCODE AC CỦA HỌC SINH (tham khảo hướng tiếp cận, không cần copy lại):\n${(code || "(không có)").slice(0, 6000)}`
      }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Phản hồi editorial không phải JSON hợp lệ."); }
  const result = normalizeEditorial(parsed);
  log("Editorial success", `loiGiai=${result.loiGiai.length}c, baiHoc=${result.baiHoc.length}`);
  return result;
}

// ---------------------------------------------------------------------------
// Synthesizer — after a problem is solved (AC), generate a HARDER VARIANT of the
// SAME problem and explain WHY a stronger technique is needed. The teaching goal:
// "an easy recursion-fib solution → push N to 1e7 → recursion now TLEs / overflows
//  the stack → memoized DP, because DP stores subresults and never recomputes."
// Output is structured, cached, and never contains a full solution.
// ---------------------------------------------------------------------------

const SYNTH_SYSTEM = [
  "Bạn là HLV lập trình thi đấu thiết kế PHIÊN BẢN KHÓ HƠN của một bài tập để DẠY học sinh VÌ SAO một kỹ thuật mạnh hơn tồn tại.",
  "Nhận: đề gốc, kỹ thuật học sinh đã dùng để AC, và code AC của họ.",
  "Trả về DUY NHẤT JSON hợp lệ (không markdown ngoài JSON):",
  "{",
  '  "baiNangCap":   "đề bài biến thể, CÙNG họ bài, chỉ SIẾT 1-2 ràng buộc (mô tả ngắn gọn bằng tiếng Việt, gồm ràng buộc mới)",',
  '  "rangBuocMoi":  "ràng buộc nào bị đẩy lên (vd: N: 30 → 1e7)",',
  '  "doPhucTapCu":  "Big-O của cách cũ học sinh dùng (vd: O(2^n))",',
  '  "viSaoHong":    "GIẢI THÍCH cách cũ HỎNG Ở ĐÂU dưới ràng buộc mới: TLE? tràn stack? tràn bộ nhớ? — phải nhất quán với doPhucTapCu",',
  '  "kyThuatMoi":   "tên kỹ thuật cần dùng (vd: DP có nhớ / bottom-up DP)",',
  '  "doPhucTapMoi": "Big-O sau khi dùng kỹ thuật mới (vd: O(n))",',
  '  "khacBietCotLoi":"1-2 câu: kỹ thuật mới KHÁC cũ ở điểm mấu chốt nào (vd: lưu kết quả con đã tính nên không tính lại)",',
  '  "camBay":       ["cạm bẫy khi cài kỹ thuật mới (tiếng Việt)"],',
  '  "loTrinh":      ["2-3 bước Ý TƯỞNG để tiếp cận, KHÔNG code, KHÔNG công thức cuối"]',
  "}",
  "LUẬT CỨNG:",
  "- baiNangCap PHẢI cùng họ bài gốc, KHÔNG đổi sang bài khác.",
  "- viSaoHong PHẢI là lập luận độ phức tạp/bộ nhớ cụ thể, nhất quán với doPhucTapCu và rangBuocMoi.",
  "- doPhucTapCu và doPhucTapMoi PHẢI là Big-O thật; kyThuatMoi PHẢI thực sự đạt được doPhucTapMoi.",
  "- TUYỆT ĐỐI KHÔNG viết code hoàn chỉnh, KHÔNG công thức cuối làm lộ đáp án.",
  "- Nếu đề gốc đã tối ưu (không có biến thể khó hơn hợp lý), để baiNangCap = \"\" và giải thích trong khacBietCotLoi.",
  "- Mọi nội dung bằng tiếng Việt; mảng rỗng nếu không có ý."
].join("\n");

async function synthesizeVariant({ settings, statement, technique, code }) {
  if (!statement || !statement.trim()) throw new Error("Statement is empty — cần đề bài để tạo biến thể.");
  const key = cacheKey("synth", settings.model, statement.trim() + "|" + String(technique || ""));
  const hit = cacheGet(key);
  if (hit) { log("Synthesize cache hit"); return hit; }

  log("Synthesize start", technique || "(no technique)");
  const content = await chat({
    settings,
    jsonMode: true,
    maxTokens: 1300,
    timeoutMs: 90000,
    messages: [
      { role: "system", content: SYNTH_SYSTEM },
      {
        role: "user",
        content: `ĐỀ GỐC:\n${statement.slice(0, 7000)}\n\nKỸ THUẬT HỌC SINH ĐÃ DÙNG: ${technique || "(không rõ — suy từ code)"}\n\nCODE AC (chỉ để tham khảo I/O và cách giải, không cần phân tích sâu):\n${String(code || "").slice(0, 4000)}`
      }
    ]
  });
  let parsed;
  try { parsed = safeParseJson(content); } catch { throw new Error("Phản hồi synthesize không phải JSON hợp lệ."); }
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const result = {
    baiNangCap: String(parsed.baiNangCap || "").trim(),
    rangBuocMoi: String(parsed.rangBuocMoi || "").trim(),
    doPhucTapCu: String(parsed.doPhucTapCu || "").trim(),
    viSaoHong: String(parsed.viSaoHong || "").trim(),
    kyThuatMoi: String(parsed.kyThuatMoi || "").trim(),
    doPhucTapMoi: String(parsed.doPhucTapMoi || "").trim(),
    khacBietCotLoi: String(parsed.khacBietCotLoi || "").trim(),
    camBay: arr(parsed.camBay),
    loTrinh: arr(parsed.loTrinh)
  };
  cacheSet(key, result);
  log("Synthesize success", result.kyThuatMoi || "(no technique)");
  return result;
}

// ---------------------------------------------------------------------------
// Problem Coach chat — a scoped Q&A about ONE problem, unlocked after the focus
// timer ends. The prompt is sandboxed HARD so the model cannot hallucinate
// constraints or leak the answer: it may use ONLY the statement, the student's
// code, and the latest test result; it must admit uncertainty; and it only
// gives a full solution when the student explicitly flips revealAllowed on.
// ---------------------------------------------------------------------------

const CHAT_SYSTEM = [
  "Bạn là trợ giảng lập trình thi đấu (competitive programming) cho ĐÚNG MỘT bài tập.",
  "Học sinh đang tự học CP (beginner→intermediate). Mục tiêu: giúp họ TỰ HIỂU và TỰ SỬA code của CHÍNH HỌ — không phải đưa đáp án AC rồi giảng lại.",
  "Người đọc là HỌC SINH MỚI. Câu trả lời phải DỄ HIỂU, CỤ THỂ, và chỉ dùng những thứ CƠ BẢN vừa đủ để giải bài.",
  "",
  "DỮ LIỆU ĐƯỢC DÙNG (và CHỈ những thứ này): (1) ĐỀ BÀI, (2) CODE HIỆN TẠI, (3) KẾT QUẢ TEST GẦN NHẤT, (4) LỊCH SỬ NỘP BÀI.",
  "",
  "=== ĐỊNH DẠNG BẮT BUỘC (nhìn lướt là hiểu) ===",
  "- LUÔN mở đầu bằng MỘT dòng chốt in đậm trả lời thẳng câu hỏi — không chào hỏi, không vòng vo:",
  "    • Lỗi code → '**Chẩn đoán:** <một câu nói trúng nguyên nhân gốc>'.",
  "    • Hỏi cách làm / khái niệm → '**Trả lời nhanh:** <một câu trả lời thẳng>'.",
  "- Sau dòng chốt, dùng các MỤC có nhãn IN ĐẬM; mỗi mục 1-3 câu hoặc vài gạch đầu dòng ngắn. CHỈ dùng mục thật sự cần:",
  "    **Lỗi sai:** hiểu lầm cốt lõi học sinh đang ngầm tin (1 câu).",
  "    **Bằng chứng:** một input nhỏ CỤ THỂ → code in ra GÌ so với ĐÁNG LẼ là gì; chỉ rõ dòng/biến gây sai.",
  "    **Hướng sửa:** việc cần làm (bám chế độ lộ lời giải bên dưới).",
  "    **Hướng tiếp cận:** (khi hỏi cách làm) tên kỹ thuật + vì sao khớp ràng buộc đề + minh họa bằng sample input.",
  "    **Bước tiếp theo:** đúng MỘT việc nên làm ngay.",
  "- Viết NGẮN: ưu tiên gạch đầu dòng hơn đoạn văn dài; mỗi câu trả lời xoáy vào 1 vấn đề chính. Nhiều lỗi → nói lỗi QUAN TRỌNG NHẤT trước.",
  "",
  "=== TUYỆT ĐỐI KHÔNG NÓI CHUNG CHUNG ===",
  "- CẤM các câu rỗng nếu không kèm case/dòng/hiểu lầm CỤ THỂ: 'thiếu vài edge case', 'logic chưa đúng', 'cần xử lý kỹ hơn', 'thử dùng DP/greedy', 'kiểm tra lại điều kiện', 'tối ưu thêm'…",
  "- Nhắc một kỹ thuật thì PHẢI nói đủ: (a) nó là gì trong 1 câu, (b) vì sao khớp ĐÚNG ràng buộc bài này, (c) áp dụng cụ thể ra sao (nếu DP: state / transition / base case). Không nêu tên thuật toán suông.",
  "- Không bịa test/constraint/số liệu không có trong đề hay log. Không chắc nguyên nhân → nói 'mình chưa chắc' + cách kiểm chứng.",
  "",
  "=== SỬA CODE CỦA HỌC SINH — KHÔNG VIẾT BÀI MỚI (mệnh lệnh quan trọng nhất) ===",
  "- Sai lầm TỆ NHẤT: dán một lời giải AC mới trong khi code họ chỉ sai một chỗ. TUYỆT ĐỐI KHÔNG.",
  "- Đọc kỹ CODE HIỆN TẠI: họ đang ĐỊNH dùng thuật toán/CTDL gì, đọc input/xuất output ra sao. Bám đúng ý đồ đó.",
  "- Code GẦN ĐÚNG (qua một phần test, hoặc ý đúng chỉ lỗi cài đặt): chỉ tìm đúng chỗ sai và VÁ TỐI THIỂU. Không đổi tên biến/style, không viết lại đoạn đang chạy đúng.",
  "- Ví dụ SAI: họ dùng BFS mà bạn dán lời giải DFS sạch đẹp. Ví dụ ĐÚNG: 'dòng 23 bạn đánh dấu visited sau khi pop thay vì khi push, nên một đỉnh bị đẩy vào queue nhiều lần.'",
  "",
  "=== GIẢI PHÁP DỄ HỌC (rất quan trọng) ===",
  "- Khi đề xuất cách làm hoặc viết code: chọn cách ĐƠN GIẢN NHẤT đủ để qua bài, KHÔNG phải cách 'pro' hay ngắn nhất.",
  "- Ưu tiên công cụ cơ bản học sinh chắc chắn biết: mảng / vector, vòng for/while, if, hàm tự viết ngắn, sort, cin/cout. Chỉ dùng kỹ thuật/CTDL nâng cao (segment tree, bitmask, STL hiếm, đệ quy rối) khi ràng buộc đề THỰC SỰ bắt buộc — và khi dùng phải giải thích nó làm gì bằng lời.",
  "- Tránh mẹo khó đọc: toán tử bit lắt léo, nhồi nhiều việc vào một dòng, macro. Code phải dễ gõ lại và dễ hiểu.",
  "- Nếu có cách ngắn-khó-hiểu và cách dài-dễ-hiểu, chọn cách DỄ HIỂU và nói rõ vì sao.",
  "",
  "=== XỬ LÝ TỪNG VERDICT ===",
  "- WA: theo skeleton **Lỗi sai** → **Bằng chứng** (tự dựng counter-example nếu chưa có test) → **Hướng sửa**.",
  "- TLE: chỉ đúng vòng lặp/đệ quy nghẽn + độ phức tạp hiện tại; ước số phép tính theo ràng buộc để cho thấy vì sao chậm; nêu độ phức tạp MỤC TIÊU cần đạt. Tối ưu trên nền code hiện tại trước, đổi thuật toán chỉ khi cần.",
  "- RE: loại lỗi (tràn mảng, chia 0, stack overflow…) + DÒNG gây ra.",
  "- CE: lỗi cú pháp cụ thể + dòng.",
  "- Nộp lại cùng lỗi → chỉ nguyên nhân gốc, không lặp lại phân tích cũ.",
  "",
  "=== CHẾ ĐỘ LỘ LỜI GIẢI ===",
  "- TẮT: TUYỆT ĐỐI KHÔNG VIẾT CODE C++ (dù 1 dòng, 1 khối if-else, hay 1 hàm). Vẫn PHẢI gọi tên lỗi tư duy và chỉ đúng dòng sai — chỉ là không viết sẵn câu lệnh sửa; gợi ý bằng lời + mã giả trừu tượng. Mục tiêu: học sinh TỰ NGHĨ ra cách sửa.",
  "- BẬT: được viết code, NHƯNG mặc định là BẢN VÁ TỐI THIỂU vào code của họ (chỉ vài dòng đang sai, giữ nguyên phần còn lại) và tuân nguyên tắc DỄ HỌC ở trên. Viết lại từ đầu CHỈ khi thuật toán của họ không thể AC — và phải giải thích vì sao không cứu được TRƯỚC khi đưa code mới. KHÔNG BAO GIỜ dán nguyên một lời giải AC làm câu trả lời chính cho một bài gần đúng.",
  "",
  "Trả lời bằng tiếng Việt. Markdown ngắn gọn, nhãn mục in đậm. Không xưng là AI của hãng nào."
].join("\n");

// Compact, token-bounded rendering of recent submissions so the Coach can see
// HOW MANY times the student retried and WHAT failed (error logs), not just the
// last verdict. Newest first; logs are assumed already truncated by the caller
// but we re-cap defensively. Returns "" when there is nothing to show.
function formatRunHistory(runHistory) {
  const list = (Array.isArray(runHistory) ? runHistory : []).slice(0, 5);
  if (!list.length) return "";
  const lines = list.map((h, i) => {
    const verdict = h.verdict || h.type || "?";
    const score = (h.passed != null && h.total != null) ? ` ${h.passed}/${h.total}` : "";
    const t = h.timeMs != null ? ` · ${h.timeMs}ms` : "";
    let s = `#${i + 1} ${verdict}${score}${t}`;
    const stderr = String(h.stderr || h.error || "").trim();
    if (stderr) s += `\n   stderr: ${stderr.slice(0, 400)}`;
    const stdout = String(h.stdout || "").trim();
    if (stdout && verdict !== "AC") s += `\n   stdout(thực tế): ${stdout.slice(0, 300)}`;
    return s;
  });

  // Detect repeated verdict patterns to highlight persistent mistakes.
  const verdicts = list.map((h) => h.verdict || h.type || "?");
  let pattern = "";
  const waCnt = verdicts.filter((v) => v === "WA").length;
  const tleCnt = verdicts.filter((v) => v === "TLE").length;
  const reCnt = verdicts.filter((v) => v === "RE").length;
  if (waCnt >= 3) pattern = `⚠ Học sinh đã WA ${waCnt}/${list.length} lần gần đây — có khả năng sai tư duy gốc, không chỉ thiếu edge case.`;
  else if (tleCnt >= 3) pattern = `⚠ Học sinh đã TLE ${tleCnt}/${list.length} lần gần đây — cần đổi thuật toán hoặc cấu trúc dữ liệu, tối ưu nhỏ không đủ.`;
  else if (reCnt >= 2) pattern = `⚠ Học sinh đã RE ${reCnt}/${list.length} lần gần đây — có thể có lỗi hệ thống (tràn mảng, stack overflow) chưa nhận ra.`;

  let out = `=== LỊCH SỬ NỘP BÀI GẦN ĐÂY (mới → cũ, ${list.length} lần) ===\n`;
  if (pattern) out += pattern + "\n";
  out += lines.join("\n");
  return out;
}

// Per-test diff details from the most recent judge run. The client sends these
// directly from app.state.testResults so the Coach can see EXACTLY which tests
// failed and HOW (expected vs actual + stderr per test).
function formatPerTestResults(perTest) {
  if (!Array.isArray(perTest) || !perTest.length) return "";
  const failed = perTest.filter((t) => t.status && t.status !== "AC");
  if (!failed.length) return "";
  const lines = failed.slice(0, 6).map((t) => {
    let s = `• Test "${t.name || t.id}": ${t.status}`;
    if (t.timeMs != null) s += ` (${Math.round(t.timeMs)}ms)`;
    if (t.diff) s += `\n  dòng ${t.diff.line}: expected "${String(t.diff.expected).slice(0, 120)}" → actual "${String(t.diff.actual).slice(0, 120)}"`;
    else if (t.actual != null) s += `\n  actual: ${String(t.actual).slice(0, 200)}`;
    if (t.stderr) s += `\n  stderr: ${String(t.stderr).slice(0, 300)}`;
    return s;
  });
  const extra = failed.length > 6 ? `\n… và ${failed.length - 6} test sai nữa.` : "";
  return `=== CHI TIẾT TEST SAI (lần chạy gần nhất) ===\n` + lines.join("\n") + extra;
}

// Shared message assembly for the Coach (buffered + streaming variants), so the
// two endpoints can never drift apart in what context the model sees.
function buildChatMessages({ statement, code, testResult, runHistory, perTestResults, history, message, revealAllowed }) {
  // Window the conversation so token use stays bounded no matter how long the chat grows.
  const turns = (Array.isArray(history) ? history : []).slice(-8).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: String(t.content || "").slice(0, 1200)
  }));

  const historyBlock = formatRunHistory(runHistory);
  const perTestBlock = formatPerTestResults(perTestResults);

  const ctx = [
    "=== ĐỀ BÀI ===",
    (statement || "(chưa có đề bài)").slice(0, 6000),
    "",
    "=== CODE HIỆN TẠI ===",
    (code || "(chưa có code)").slice(0, 6000),
    "",
    "=== KẾT QUẢ TEST GẦN NHẤT ===",
    String(testResult || "(chưa chạy)").slice(0, 600),
    ...(perTestBlock ? ["", perTestBlock] : []),
    ...(historyBlock ? ["", historyBlock] : []),
    "",
    `=== CHẾ ĐỘ LỘ LỜI GIẢI === ${revealAllowed ? "BẬT — được phép đưa lời giải/code đầy đủ." : "TẮT — TUYỆT ĐỐI KHÔNG VIẾT CODE C++, CHỈ GỢI Ý BẰNG LỜI VĂN."}`
  ].join("\n");

  const combinedSystemMessage = CHAT_SYSTEM + "\n\n" + ctx;

  return [
    { role: "system", content: combinedSystemMessage },
    ...turns,
    { role: "user", content: String(message).slice(0, 2000) }
  ];
}

async function chatProblem(opts) {
  const { settings, runHistory, history, message, revealAllowed } = opts;
  if (!message || !message.trim()) throw new Error("Câu hỏi trống.");
  const messages = buildChatMessages(opts);
  log("Coach chat", `reveal=${Boolean(revealAllowed)}, history=${(Array.isArray(history) ? history : []).length}, runs=${(Array.isArray(runHistory) ? runHistory : []).length}`);
  const content = await chat({ settings, maxTokens: 1200, timeoutMs: 60000, messages });
  return String(content || "").trim();
}

// Streaming variant: identical context, but deltas flow to `onDelta` as they
// arrive and `signal` aborts the upstream call (e.g. client disconnected).
// Returns the full reply once the stream completes.
async function chatProblemStream(opts) {
  const { settings, message, onDelta, signal } = opts;
  if (!message || !message.trim()) throw new Error("Câu hỏi trống.");
  const messages = buildChatMessages(opts);
  log("Coach chat (stream)", `reveal=${Boolean(opts.revealAllowed)}`);
  const content = await chat({ settings, maxTokens: 1200, timeoutMs: 90000, messages, stream: true, onDelta, signal });
  return String(content || "").trim();
}

// ---------------------------------------------------------------------------
// AI Contest Generator — build an ORIGINAL practice contest of 5-7 brand-new
// problems on ONE topic, ratings strictly increasing and below 2000. The model
// must NOT clone/paraphrase the student's solved problems (passed in only to
// infer level + topic coverage) and must verify every expected output or set it
// to null. Output is strict JSON; we normalize, validate hard, and on a schema
// failure retry ONCE with a repair prompt before failing clearly.
// ---------------------------------------------------------------------------

const CONTEST_SYSTEM = [
  "You are a strict competitive-programming contest setter and verifier.",
  "Create an ORIGINAL practice contest for ONE topic.",
  "",
  "Hard constraints:",
  "- Stay on the given topic.",
  "- Create EXACTLY the requested number of problems.",
  "- Ratings must be STRICTLY INCREASING integers and BELOW 2000.",
  "- Adjacent ratings should increase by about 150-200 when the range allows.",
  "- Every problem must be solvable in C++17.",
  "- Problems must be COMPLETELY different from each other.",
  "- Problems must NOT clone, paraphrase, rename, or lightly mutate ANY solved/source problem the user provides.",
  "- Use the solved problems ONLY to infer the student's level and topic coverage.",
  "- For each problem produce: title, rating, tags, full statement, input format, output format, constraints,",
  "  sample tests, official tests, a uniqueness note, and a PRIVATE solution sketch used only for verification.",
  "- All tests must match the input format EXACTLY (whitespace and newlines matter).",
  "- Expected outputs MUST be verified by simulating your own solution. If you are not 100% certain, set",
  "  \"expected\": null and \"expectedKnown\": false with a short \"warning\". NEVER fabricate an expected output.",
  "- Each problem needs AT LEAST 5 tests whose expected output is known and verified, including at least one",
  "  sample test (the statement's own sample) and at least one min/edge case; add an adversarial case when it fits.",
  "- Keep every statement focused and under ~12000 characters so a reader UI never hangs.",
  "- Return STRICT JSON only. No markdown fences, no prose outside the JSON.",
  "",
  "JSON schema (return exactly this shape):",
  "{",
  '  "title": "Contest title",',
  '  "topic": "<topic>",',
  '  "difficultyPlan": "short note in Vietnamese about the rating ladder",',
  '  "problems": [',
  "    {",
  '      "title": "...", "rating": 950, "tags": ["..."],',
  '      "uniquenessNote": "Vietnamese — how this differs from the solved problems",',
  '      "statement": "Markdown statement (Vietnamese)",',
  '      "inputFormat": "...", "outputFormat": "...", "constraints": ["..."],',
  '      "solutionSketchPrivate": "Vietnamese, private — used only to verify tests",',
  '      "samples": [ { "input": "...", "expected": "...", "explanation": "..." } ],',
  '      "tests": [',
  '        { "name": "sample-1|min|edge|random-small|adversarial|large", "input": "...",',
  '          "expected": "..." , "expectedKnown": true, "reason": "Vietnamese", "warning": "" }',
  "      ]",
  "    }",
  "  ],",
  '  "warnings": []',
  "}",
  "All Vietnamese fields (uniquenessNote, difficultyPlan, statement, reason, warning) must be natural Vietnamese."
].join("\n");

// Compact, token-bounded view of the solved problems for level + anti-clone.
function buildSolvedContext(solvedProblems) {
  const list = Array.isArray(solvedProblems) ? solvedProblems.slice(0, 24) : [];
  if (!list.length) return "(none provided)";
  return list.map((p, i) => {
    const head = `${i + 1}. [rating ${p.rating || "?"}] ${String(p.title || "").trim()}` +
      (p.tags && p.tags.length ? ` — tags: ${p.tags.join(", ")}` : "");
    const sum = p.summary ? `\n   tóm tắt: ${String(p.summary).slice(0, 240)}` : "";
    const exc = p.statementExcerpt ? `\n   trích đề: ${String(p.statementExcerpt).replace(/\s+/g, " ").slice(0, 320)}` : "";
    return head + sum + exc;
  }).join("\n");
}

function buildContestMessages({ topic, solvedProblems, problemCount, minRating, maxRating, repairNote }) {
  const user = [
    `TOPIC: ${topic}`,
    `NUMBER OF PROBLEMS: exactly ${problemCount}`,
    `RATING RANGE: from about ${minRating} up to at most ${maxRating} (every rating strictly < 2000, strictly increasing).`,
    "",
    "SOLVED PROBLEMS by this student on the same topic — use ONLY to gauge level and to AVOID overlap.",
    "Do NOT reuse, rename, translate, or lightly mutate any of these:",
    buildSolvedContext(solvedProblems),
    repairNote ? `\nPREVIOUS ATTEMPT WAS REJECTED. Fix these issues and return corrected JSON only:\n${repairNote}` : ""
  ].join("\n");
  return [
    { role: "system", content: CONTEST_SYSTEM },
    { role: "user", content: user }
  ];
}

// Shape one raw problem into the structure contestStore.createContest expects,
// keeping only VERIFIED tests (known expected, no warning) and de-duping inputs.
function normalizeContestProblem(raw, warnings) {
  const title = String(raw.title || "").trim();
  const samplesRaw = Array.isArray(raw.samples) ? raw.samples : [];
  const samples = samplesRaw.map((s) => ({
    input: typeof s.input === "string" ? s.input : "",
    expected: typeof s.expected === "string" ? s.expected : "",
    explanation: typeof s.explanation === "string" ? s.explanation : ""
  }));

  const verifiedTests = [];
  const seen = new Set();
  let skipped = 0;

  // Samples come first and are treated as verified when they carry an output.
  samples.forEach((s, i) => {
    if (s.expected && s.expected.trim() !== "" && !seen.has(s.input)) {
      verifiedTests.push({ name: `sample-${i + 1}`, input: s.input, expected: s.expected, reason: s.explanation || "sample test" });
      seen.add(s.input);
    }
  });

  (Array.isArray(raw.tests) ? raw.tests : []).forEach((t, i) => {
    const input = typeof t.input === "string" ? t.input : "";
    const expStr = typeof t.expected === "string" ? t.expected : null;
    const warning = (t.warning && String(t.warning).trim()) || "";
    const known = expStr != null && expStr.trim() !== "" && t.expectedKnown !== false && !warning;
    if (!known) { skipped += 1; return; }
    if (seen.has(input)) return; // de-dupe identical inputs
    verifiedTests.push({ name: String(t.name || `test-${i + 1}`).trim() || `test-${i + 1}`, input, expected: expStr, reason: String(t.reason || "").trim() });
    seen.add(input);
  });

  if (skipped > 0) {
    warnings.push(`Bài "${title || "?"}": bỏ ${skipped} test không có đáp án chắc chắn (input-only).`);
  }

  return {
    title,
    rating: Math.round(Number(raw.rating) || 0),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [],
    uniquenessNote: String(raw.uniquenessNote || "").trim(),
    statement: String(raw.statement || "").trim(),
    inputFormat: String(raw.inputFormat || "").trim(),
    outputFormat: String(raw.outputFormat || "").trim(),
    constraints: Array.isArray(raw.constraints)
      ? raw.constraints.map((c) => String(c).trim()).filter(Boolean)
      : (raw.constraints ? [String(raw.constraints).trim()] : []),
    solutionSketchPrivate: String(raw.solutionSketchPrivate || "").trim(),
    samples,
    verifiedTests
  };
}

function normalizeContest(parsed) {
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map((w) => String(w).trim()).filter(Boolean) : [];
  const problems = (Array.isArray(parsed.problems) ? parsed.problems : []).map((p) => normalizeContestProblem(p, warnings));
  return {
    title: String(parsed.title || "").trim(),
    topic: String(parsed.topic || "").trim(),
    difficultyPlan: String(parsed.difficultyPlan || "").trim(),
    problems,
    warnings
  };
}

// Hard schema validation. Returns a list of human-readable issues ([] = valid).
function validateContest(c, { minRating, maxRating }) {
  const errors = [];
  const probs = c.problems || [];
  if (probs.length < CONTEST.minProblems || probs.length > CONTEST.maxProblems) {
    errors.push(`Số bài phải từ ${CONTEST.minProblems}-${CONTEST.maxProblems} (đang có ${probs.length}).`);
  }

  const titlesSeen = new Set();
  let prevRating = 0;
  probs.forEach((p, i) => {
    const label = `Bài ${i + 1} ("${p.title || "?"}")`;
    if (!p.title) errors.push(`${label}: thiếu tiêu đề.`);
    const tnorm = p.title.toLowerCase();
    if (tnorm && titlesSeen.has(tnorm)) errors.push(`${label}: tiêu đề trùng với bài khác.`);
    titlesSeen.add(tnorm);

    if (!p.statement || p.statement.length < 40) errors.push(`${label}: đề bài quá ngắn hoặc trống.`);
    if (p.statement && p.statement.length > CONTEST.maxStatementChars) errors.push(`${label}: đề bài quá dài (>${CONTEST.maxStatementChars} ký tự).`);
    if (!p.inputFormat) errors.push(`${label}: thiếu Input format.`);
    if (!p.outputFormat) errors.push(`${label}: thiếu Output format.`);
    if (!p.constraints || p.constraints.length === 0) errors.push(`${label}: thiếu ràng buộc (constraints).`);

    if (!Number.isFinite(p.rating) || p.rating <= 0) errors.push(`${label}: rating không hợp lệ.`);
    if (p.rating >= 2000) errors.push(`${label}: rating phải dưới 2000 (đang ${p.rating}).`);
    if (p.rating > maxRating) errors.push(`${label}: rating ${p.rating} vượt mức tối đa ${maxRating}.`);
    if (i > 0 && p.rating <= prevRating) errors.push(`${label}: rating phải tăng dần (${p.rating} ≤ ${prevRating}).`);
    prevRating = p.rating;

    const verified = p.verifiedTests || [];
    if (verified.length < CONTEST.minTestsPerProblem) {
      errors.push(`${label}: cần ≥${CONTEST.minTestsPerProblem} test có đáp án chắc chắn (đang ${verified.length}).`);
    }
    if (!verified.some((t) => /^sample/i.test(t.name))) {
      errors.push(`${label}: cần ít nhất 1 sample test.`);
    }
  });

  return errors;
}

async function generateContest({ settings, topic, solvedProblems, problemCount, minRating, maxRating }) {
  const t = String(topic || "").trim();
  if (!t) throw new Error("Thiếu topic cho contest.");
  const count = Math.min(Math.max(Number(problemCount) || CONTEST.minProblems, CONTEST.minProblems), CONTEST.maxProblems);
  const minR = Math.max(Number(minRating) || 800, 1);
  const maxR = Math.min(Number(maxRating) || CONTEST.maxRatingCeil, CONTEST.maxRatingCeil);

  async function attempt(repairNote) {
    const content = await chat({
      settings,
      messages: buildContestMessages({ topic: t, solvedProblems, problemCount: count, minRating: minR, maxRating: maxR, repairNote }),
      jsonMode: true,
      maxTokens: 16000, // 5-7 full problems with statements + verified tests
      timeoutMs: 180000
    });
    let parsed;
    try { parsed = safeParseJson(content); }
    catch { throw new Error("AI không trả về JSON hợp lệ cho contest."); }
    const normalized = normalizeContest(parsed);
    const errors = validateContest(normalized, { minRating: minR, maxRating: maxR });
    return { normalized, errors };
  }

  log("Generate contest start", `${t} ×${count} (${minR}-${maxR})`);
  let { normalized, errors } = await attempt(null);

  if (errors.length) {
    log("Generate contest invalid", `${errors.length} issue(s) — repairing`);
    const retry = await attempt(errors.map((e, i) => `${i + 1}. ${e}`).join("\n"));
    normalized = retry.normalized;
    errors = retry.errors;
  }

  if (errors.length) {
    const e = new Error("Contest do AI tạo không đạt yêu cầu sau khi thử lại:\n• " + errors.slice(0, 8).join("\n• "));
    e.code = "CONTEST_INVALID";
    throw e;
  }

  log("Generate contest success", `${normalized.problems.length} problems`);
  return normalized;
}

// ---------------------------------------------------------------------------
// API key / provider detection. From the key shape we guess the provider,
// the right OpenAI-compatible base URL, and (best-effort) the live model list,
// then suggest a sensible default (Gemini Flash > Flash-Lite > first available).
// ---------------------------------------------------------------------------

const PROVIDERS = {
  google: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    suggest: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"],
    defaultModel: "gemini-2.5-flash",
    defaultFallbacks: "gemini-2.5-flash-lite, gemini-2.0-flash"
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    suggest: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"],
    defaultModel: "gpt-4.1-mini",
    defaultFallbacks: "gpt-4o-mini"
  },
  anthropic: {
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    suggest: ["claude-3-5-haiku-latest"],
    defaultModel: "claude-3-5-haiku-latest",
    defaultFallbacks: ""
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    suggest: ["google/gemini-2.5-flash", "google/gemini-2.0-flash-001"],
    defaultModel: "google/gemini-2.5-flash",
    defaultFallbacks: "google/gemini-2.0-flash-001"
  }
};

function detectProvider(apiKey) {
  const k = String(apiKey || "").trim();
  if (/^AIza[0-9A-Za-z_\-]{20,}$/.test(k)) return "google";
  if (/^sk[-_]or-/.test(k)) return "openrouter";
  if (/^sk[-_]ant-/.test(k)) return "anthropic";
  if (/^sk[-_]/.test(k)) return "openai";
  return "";
}

// Best-effort: hit the provider's OpenAI-compatible /models endpoint.
async function listModels({ baseUrl, apiKey }) {
  const url = `${String(baseUrl || "").replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const rows = (data && (data.data || data.models)) || [];
    return rows
      .map((m) => String(m.id || m.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

function suggestModel(provider, available) {
  const cfg = PROVIDERS[provider];
  const list = Array.isArray(available) ? available : [];
  if (cfg) {
    // Prefer the provider's ranked suggestions that are actually available.
    for (const want of cfg.suggest) {
      const hit = list.find((m) => m === want || m.endsWith(want) || m.includes(want));
      if (hit) return hit;
    }
    // Otherwise any flash-ish / mini-ish model, else the configured default.
    const flash = list.find((m) => /flash|mini|haiku/i.test(m));
    return flash || cfg.defaultModel;
  }
  return list[0] || "";
}

// Orchestrates detection for the Settings UI. Never persists anything.
async function detectKey({ apiKey }) {
  const provider = detectProvider(apiKey);
  const cfg = PROVIDERS[provider] || null;
  const baseUrl = cfg ? cfg.baseUrl : "";
  let available = [];
  if (cfg) available = await listModels({ baseUrl, apiKey });
  const suggested = cfg ? suggestModel(provider, available) : "";
  return {
    provider,
    label: cfg ? cfg.label : "",
    baseUrl,
    models: available.slice(0, 60),
    suggestedModel: suggested,
    suggestedFallbacks: cfg ? cfg.defaultFallbacks : ""
  };
}

// ---------------------------------------------------------------------------
// ⚔️ Weekend Boss — one AI-authored problem aimed straight at the student's
// weakest topic. Single problem (unlike contests), dramatic flavor included.
// ---------------------------------------------------------------------------

const BOSS_SYSTEM = `Bạn là một "trùm ra đề" (problem setter) khó tính của một judge luyện thi.
Nhiệm vụ: tạo ĐÚNG MỘT bài toán "BOSS" đánh thẳng vào điểm yếu của học sinh.

YÊU CẦU BẮT BUỘC:
- Đề bài hoàn toàn bằng TIẾNG VIỆT, định dạng Markdown, gồm các mục: mô tả bài toán (có cốt truyện ngắn kiểu "boss/quái vật" cho vui), **Input**, **Output**, **Ràng buộc**, và ít nhất 1 **Ví dụ** (input/output + giải thích).
- Bài phải GIẢI ĐƯỢC bằng C++ với stdin/stdout, thuật toán chuẩn của topic được giao, KHÔNG cần cấu trúc dữ liệu ngoài chương trình phổ thông.
- Độ khó: nhỉnh hơn trình hiện tại của học sinh một bậc (dựa vào thống kê được cung cấp) — thử thách nhưng không bất khả thi.
- Test: 1-2 sample (có đáp án) + 4-6 test thêm phủ biên (n nhỏ nhất, giá trị âm/0 nếu hợp lệ, trùng lặp, case lớn vừa phải). Đáp án của test phải tính CẨN THẬN.
- taunt: MỘT câu khiêu khích ngắn (≤120 ký tự) mà boss "nói" với học sinh, tiếng Việt, vui nhưng không xúc phạm.

TRẢ VỀ DUY NHẤT MỘT JSON OBJECT:
{
  "title": "tên bài (KHÔNG kèm chữ Boss — app tự thêm)",
  "taunt": "câu khiêu khích",
  "rating": 1100,
  "tags": ["topic", "kỹ thuật phụ"],
  "statement": "đề bài Markdown đầy đủ như mô tả trên",
  "samples": [{ "input": "...", "expected": "...", "explanation": "..." }],
  "tests": [{ "name": "edge-min", "input": "...", "expected": "...", "reason": "vì sao test này hiểm" }]
}`;

function validateBoss(b) {
  const errors = [];
  if (!b.title) errors.push("Thiếu title.");
  if (!b.statement || b.statement.length < 80) errors.push("Đề bài quá ngắn (<80 ký tự).");
  if (!/input/i.test(b.statement) || !/output/i.test(b.statement)) errors.push("Đề thiếu mục Input/Output.");
  if (!Array.isArray(b.samples) || b.samples.length < 1) errors.push("Cần ít nhất 1 sample có đáp án.");
  if (!Array.isArray(b.tests) || b.tests.length < 3) errors.push("Cần ít nhất 3 test ngoài sample.");
  const bad = [...(b.samples || []), ...(b.tests || [])].filter((t) => !t || typeof t.input !== "string" || !String(t.expected || "").trim());
  if (bad.length) errors.push(`${bad.length} test thiếu input hoặc đáp án.`);
  if (!b.taunt) errors.push("Thiếu câu taunt.");
  return errors;
}

function normalizeBoss(parsed) {
  return {
    title: String(parsed.title || "").trim(),
    taunt: String(parsed.taunt || "").trim().slice(0, 160),
    rating: Math.round(Number(parsed.rating) || 0) || null,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6) : [],
    statement: String(parsed.statement || "").trim(),
    samples: (Array.isArray(parsed.samples) ? parsed.samples : []).map((s) => ({
      input: typeof s.input === "string" ? s.input : "",
      expected: typeof s.expected === "string" ? s.expected : "",
      explanation: typeof s.explanation === "string" ? s.explanation : ""
    })),
    tests: (Array.isArray(parsed.tests) ? parsed.tests : []).map((t, i) => ({
      name: String(t.name || `test-${i + 1}`).trim(),
      input: typeof t.input === "string" ? t.input : "",
      expected: typeof t.expected === "string" ? t.expected : "",
      reason: String(t.reason || "").trim()
    }))
  };
}

// weakness: { topic, waCount, attempts, solved } — the pitch the prompt aims at.
async function generateBoss({ settings, weakness, recentTitles }) {
  const w = weakness || {};
  const user = [
    `TOPIC MỤC TIÊU: ${w.topic || "tổng hợp cơ bản"}`,
    `THỐNG KÊ HỌC SINH trên topic này: ${w.attempts || 0} bài đã làm, ${w.solved || 0} đã AC, ${w.waCount || 0} lần WA.`,
    w.waCount >= 3 ? "Học sinh đang YẾU topic này — bài boss phải ép đúng kiểu lỗi hay mắc (off-by-one, biên, tràn số...)." :
      "Học sinh khá vững — bài boss nên đẩy lên một bậc kỹ thuật.",
    "",
    "CÁC BÀI GẦN ĐÂY (tránh trùng ý tưởng):",
    (Array.isArray(recentTitles) && recentTitles.length ? recentTitles.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join("\n") : "(chưa có)")
  ].join("\n");

  async function attempt(repairNote) {
    const content = await chat({
      settings,
      messages: [
        { role: "system", content: BOSS_SYSTEM },
        { role: "user", content: repairNote ? `${user}\n\nLẦN TRƯỚC BỊ TỪ CHỐI, sửa các lỗi sau và trả về JSON đúng:\n${repairNote}` : user }
      ],
      jsonMode: true,
      maxTokens: 8000,
      timeoutMs: 150000
    });
    let parsed;
    try {
      parsed = safeParseJson(content);
    } catch (err) {
      log("Boss JSON parse failed", err.message);
      log("Raw boss content was:", content);
      throw new Error(`AI không trả về JSON hợp lệ cho boss. Chi tiết: ${err.message}`);
    }
    const normalized = normalizeBoss(parsed);
    return { normalized, errors: validateBoss(normalized) };
  }

  log("Generate boss start", w.topic || "?");
  let { normalized, errors } = await attempt(null);
  if (errors.length) {
    log("Generate boss invalid", `${errors.length} issue(s) — repairing`);
    ({ normalized, errors } = await attempt(errors.map((e, i) => `${i + 1}. ${e}`).join("\n")));
  }
  if (errors.length) {
    throw new Error("Boss do AI tạo không đạt yêu cầu sau khi thử lại:\n• " + errors.slice(0, 6).join("\n• "));
  }
  log("Generate boss success", normalized.title);
  return normalized;
}

// ---------------------------------------------------------------------------
// 🎓 AC Defense (viva) — after an AC, the AI interviews the STUDENT about
// their own code; a graded oral exam against the illusion of competence.
// ---------------------------------------------------------------------------

async function defenseQuestions({ settings, statement, code }) {
  const content = await chat({
    settings,
    messages: [
      {
        role: "system",
        content: `Bạn là giám khảo vấn đáp thuật toán. Học sinh vừa AC bài này bằng đoạn code đính kèm.
Hãy đặt ĐÚNG 3 câu hỏi NGẮN bằng tiếng Việt để kiểm tra học sinh có THẬT SỰ hiểu lời giải của chính mình không:
1) một câu về Ý TƯỞNG / vì sao cách làm đúng,
2) một câu về ĐỘ PHỨC TẠP hoặc giới hạn dữ liệu,
3) một câu về EDGE CASE hoặc một dòng code cụ thể trong bài (trích ngắn dòng đó vào câu hỏi).
Câu hỏi phải bám vào code THẬT của học sinh, không hỏi chung chung. KHÔNG kèm đáp án.
Trả về JSON: { "questions": ["...", "...", "..."] }`
      },
      { role: "user", content: `ĐỀ BÀI:\n${String(statement || "").slice(0, 4000)}\n\nCODE CỦA HỌC SINH:\n\`\`\`cpp\n${String(code || "").slice(0, 6000)}\n\`\`\`` }
    ],
    jsonMode: true,
    maxTokens: 1200,
    timeoutMs: 60000
  });
  const parsed = safeParseJson(content);
  const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3);
  if (questions.length < 3) throw new Error("AI không tạo đủ 3 câu hỏi vấn đáp.");
  return { questions };
}

async function defenseGrade({ settings, statement, code, qa }) {
  const qaText = (Array.isArray(qa) ? qa : []).map((x, i) =>
    `Câu ${i + 1}: ${String(x.q || "").trim()}\nTrả lời của học sinh: ${String(x.a || "").trim() || "(bỏ trống)"}`).join("\n\n");
  const content = await chat({
    settings,
    messages: [
      {
        role: "system",
        content: `Bạn là giám khảo vấn đáp công bằng nhưng nghiêm. Chấm phần trả lời của học sinh về chính lời giải của họ.
Quy tắc:
- Mỗi câu chấm đúng/sai theo Ý HIỂU, không bắt bẻ câu chữ; trả lời ngắn mà trúng vẫn tính đúng.
- Trả lời trống, lạc đề, hoặc "không biết" = sai.
- score tổng 0-10 (mỗi câu ~3.3 điểm). passed = score >= 7.
- feedback mỗi câu: 1-2 câu tiếng Việt, chỉ rõ thiếu gì hoặc khen đúng chỗ.
Trả về JSON: { "score": 8, "passed": true, "summary": "1 câu tổng kết", "feedback": [{ "ok": true, "comment": "..." }, ...] }`
      },
      { role: "user", content: `ĐỀ BÀI:\n${String(statement || "").slice(0, 3000)}\n\nCODE:\n\`\`\`cpp\n${String(code || "").slice(0, 5000)}\n\`\`\`\n\nPHẦN VẤN ĐÁP:\n${qaText}` }
    ],
    jsonMode: true,
    maxTokens: 1500,
    timeoutMs: 60000
  });
  const parsed = safeParseJson(content);
  const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    passed: Boolean(parsed.passed) && score >= 7,
    summary: String(parsed.summary || "").trim(),
    feedback: (Array.isArray(parsed.feedback) ? parsed.feedback : []).slice(0, 3).map((f) => ({
      ok: Boolean(f && f.ok),
      comment: String((f && f.comment) || "").trim()
    }))
  };
}

module.exports = {
  testConnection,
  generateTests,
  ocrImage,
  cleanupOcr,
  analyzeStatement,
  extractSamples,
  getHint,
  reviewMistakes,
  generateHelper,
  generateTemplate,
  reviewCode,
  explainCompileError,
  explainTestCase,
  autoFixCode,
  dryRunDebugger,
  synthesizeVariant,
  generateEditorial,
  chatProblem,
  chatProblemStream,
  formatRunHistory,
  generateContest,
  generateBoss,
  defenseQuestions,
  defenseGrade,
  detectKey,
  detectProvider,
  looksGarbled,
  log,
  NO_KEY_MESSAGE
};
