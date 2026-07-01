"use strict";

// adapters/openai-compatible.js — Default adapter for any OpenAI-compatible API.
// Wraps the existing chat logic from ai.js into the adapter contract:
//   { id, name, chat(opts), testConnection(settings), normalize(response) }

const id = "openai-compatible";
const name = "OpenAI-Compatible";

function modelCandidates(settings) {
  const list = [settings.model];
  String(settings.fallbackModels || "")
    .split(/[,\n]/)
    .map(m => m.trim())
    .filter(Boolean)
    .forEach(m => list.push(m));
  return [...new Set(list.filter(Boolean))];
}

function friendlyError(status, msg) {
  const d = msg ? ` (${String(msg).slice(0, 200)})` : "";
  if (status === 401 || status === 403) return `API key bị từ chối — kiểm tra lại key trong Settings → AI.${d}`;
  if (status === 429) return `Hết hạn mức (429) — đợi một lát, hoặc thêm fallback models.${d}`;
  if (status === 404) return `Không tìm thấy model hoặc endpoint (404).${d}`;
  if (status >= 500) return `Nhà cung cấp AI lỗi tạm thời (${status}).${d}`;
  return `AI error ${status}: ${msg}`;
}

function extractContent(data) {
  if (!data || !data.choices || !data.choices[0]) return "";
  const c = data.choices[0];
  return (c.message && c.message.content) || c.text || "";
}

function extractDelta(obj) {
  if (!obj || !obj.choices || !obj.choices[0]) return "";
  const c = obj.choices[0];
  if (c.delta && c.delta.content != null) return String(c.delta.content);
  if (c.delta && c.delta.text != null) return String(c.delta.text);
  if (c.text != null) return String(c.text);
  if (c.message && c.message.content != null) return String(c.message.content);
  return "";
}

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
    else { onCallerAbort = () => controller.abort(); signal.addEventListener("abort", onCallerAbort, { once: true }); }
  }
  const cleanup = () => { clearTimeout(timer); if (signal && onCallerAbort) signal.removeEventListener("abort", onCallerAbort); };

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
    const cancelled = signal && signal.aborted;
    const e = new Error(cancelled ? "Đã hủy yêu cầu AI." : "Không gọi được AI endpoint.");
    e.retryable = !cancelled;
    if (cancelled) e.code = "ABORTED";
    throw e;
  }

  if (!res.ok) {
    cleanup();
    const text = await res.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const msg = (data && data.error && (data.error.message || data.error.type)) || res.statusText;
    const e = new Error(friendlyError(res.status, msg));
    e.status = res.status;
    e.retryable = res.status === 429 || res.status >= 500;
    if (res.status === 401 || res.status === 403) e.code = "AUTH";
    throw e;
  }

  if (stream) {
    let full = "";
    let buf = "";
    let raw = "";
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
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const delta = extractDelta(JSON.parse(payload));
            if (delta) { full += delta; if (onDelta) onDelta(delta); }
          } catch { /* skip */ }
        }
      }
    } catch (error) {
      cleanup();
      const cancelled = signal && signal.aborted;
      const e = new Error(cancelled ? "Đã hủy yêu cầu AI." : "Lỗi trong khi streaming.");
      e.retryable = !cancelled;
      e.partial = full;
      throw e;
    }
    cleanup();
    if (!full.trim() && raw.trim()) {
      try { full = extractContent(JSON.parse(raw)); } catch { /* not JSON */ }
    }
    if (!full.trim()) throw new Error("AI trả về phản hồi rỗng.");
    return full;
  }

  cleanup();
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const content = extractContent(data);
  if (!content.trim()) throw new Error("AI trả về phản hồi rỗng.");
  return content;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function chat({ settings, messages, jsonMode, maxTokens, timeoutMs = 60000, stream, onDelta, signal }) {
  if (!settings.apiKey) {
    const err = new Error("Bạn cần nhập API key trong Settings trước.");
    err.code = "NO_KEY";
    throw err;
  }
  const models = modelCandidates(settings);
  let lastErr = null;
  let deltasEmitted = false;
  const tracked = onDelta ? d => { deltasEmitted = true; onDelta(d); } : undefined;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await chatOnce({ settings, model, messages, jsonMode, maxTokens, timeoutMs, stream, onDelta: tracked, signal });
      } catch (error) {
        lastErr = error;
        if (!error.retryable || deltasEmitted) throw error;
        if (attempt < 2) {
          await sleep(Math.min(8000, 600 * Math.pow(2, attempt)));
        } else if (mi < models.length - 1) {
          break;
        }
      }
    }
  }
  throw lastErr || new Error("AI request failed.");
}

async function testConnection(settings) {
  await chat({
    settings,
    messages: [
      { role: "system", content: "You are a connectivity probe. Reply with the single word: ok" },
      { role: "user", content: "ping" }
    ],
    maxTokens: 5,
    timeoutMs: 15000
  });
  return { ok: true };
}

module.exports = { id, name, chat, testConnection, modelCandidates, friendlyError };
