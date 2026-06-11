// api.js — thin wrapper around the local backend REST API.

// ---- AI cancellation + activity ------------------------------------------
// Every in-flight AI request registers an AbortController here. A single
// "Cancel" affordance can abort them ALL (the image→statement→tests pipeline
// fires several at once), and listeners are notified so the UI can show/hide a
// global "AI running…" indicator without any per-feature wiring.
const aiControllers = new Set();
const aiListeners = new Set();

function notifyAiActivity() {
  for (const cb of aiListeners) { try { cb(aiControllers.size); } catch { /* ignore */ } }
}

// Wrap an AI call so it's tracked + cancelable. `fn(signal)` does the fetch.
//
// Cancellation is two-tier — both resolve to the same AbortError, so callers
// only ever handle one case:
//   • Global — abortAiRequest() aborts EVERY in-flight controller at once
//     (the global "AI đang chạy… ✕ Hủy" pill).
//   • Local  — pass opts.signal (an AbortSignal); aborting THAT signal cancels
//     only this one request and leaves sibling AI tasks running. This is what
//     lets the Coach's Stop button and the pipeline's Cancel button work
//     independently without touching each other's requests.
function aiCall(fn, opts = {}) {
  const controller = new AbortController();
  aiControllers.add(controller);
  notifyAiActivity();

  // Bridge an optional caller-owned signal onto this request's controller so
  // its abort cancels only this call (not the whole global set).
  const external = opts.signal;
  let onExternalAbort = null;
  if (external) {
    if (external.aborted) controller.abort();
    else {
      onExternalAbort = () => controller.abort();
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return Promise.resolve(fn(controller.signal)).finally(() => {
    if (external && onExternalAbort) external.removeEventListener("abort", onExternalAbort);
    aiControllers.delete(controller);
    notifyAiActivity();
  });
}

async function request(method, url, body, opts2 = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (opts2.signal) opts.signal = opts2.signal;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (networkErr) {
    if (networkErr && networkErr.name === "AbortError") {
      const e = new Error("Đã hủy yêu cầu AI."); e.aborted = true; e.code = "ABORTED"; throw e;
    }
    throw new Error("Không kết nối được backend. Backend USACO IDE 2.0 có đang chạy không?");
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const get = (url, opt) => request("GET", url, undefined, opt);
const post = (url, body, opt) => request("POST", url, body, opt);
const put = (url, body, opt) => request("PUT", url, body, opt);
const del = (url) => request("DELETE", url);

export const api = {
  health: () => get("/api/health"),

  // Problems
  listProblems: () => get("/api/problems"),
  getProblem: (id) => get(`/api/problems/${id}`),
  createProblem: (data) => post("/api/problems", data),
  updateProblem: (id, data) => put(`/api/problems/${id}`, data),
  deleteProblem: (id) => del(`/api/problems/${id}`),
  duplicateProblem: (id) => post(`/api/problems/${id}/duplicate`),
  openInEditor: (id) => post(`/api/problems/${id}/open-in-editor`),

  // Files
  getCode: (id) => get(`/api/problems/${id}/code`),
  saveCode: (id, code) => put(`/api/problems/${id}/code`, { code }),
  getInput: (id) => get(`/api/problems/${id}/input`),
  saveInput: (id, input) => put(`/api/problems/${id}/input`, { input }),
  getExpected: (id) => get(`/api/problems/${id}/expected`),
  saveExpected: (id, expected) => put(`/api/problems/${id}/expected`, { expected }),
  getNotes: (id) => get(`/api/problems/${id}/notes`),
  saveNotes: (id, notes) => put(`/api/problems/${id}/notes`, { notes }),
  getStatement: (id) => get(`/api/problems/${id}/statement`),
  saveStatement: (id, statement) => put(`/api/problems/${id}/statement`, { statement }),
  getMistakes: (id) => get(`/api/problems/${id}/mistakes`),
  getHistory: (id) => get(`/api/problems/${id}/history`),

  // Tests
  listTests: (id) => get(`/api/problems/${id}/tests`),
  addTest: (id, data) => post(`/api/problems/${id}/tests`, data),
  updateTest: (id, testId, data) => put(`/api/problems/${id}/tests/${testId}`, data),
  deleteTest: (id, testId) => del(`/api/problems/${id}/tests/${testId}`),

  // Judge
  run: (id, code) => post(`/api/problems/${id}/run`, { code }),
  judge: (id, code, onlyTestId) => post(`/api/problems/${id}/judge`, { code, onlyTestId }),

  // Lab (stress tester + complexity profiler) + analytics
  stress: (id, data) => post(`/api/problems/${id}/stress`, data),
  profile: (id, data) => post(`/api/problems/${id}/profile`, data),
  stats: () => get("/api/stats"),
  skillMap: () => get("/api/stats/skills"),
  reviewQueue: () => get("/api/stats/review-queue"),
  progress: () => get("/api/progress"),
  mistakeBook: () => get("/api/stats/mistakes"),

  // ⚔️ Weekend Boss + 🎓 AC Defense + ⚡ Flash quiz
  bossStatus: () => get("/api/boss"),
  bossSummon: (opts) => aiCall((s) => post("/api/boss/summon", {}, { signal: s }), opts),
  defenseQuestions: (problemId, opts) => aiCall((s) => post("/api/ai/defense-questions", { problemId }, { signal: s }), opts),
  defenseGrade: (problemId, qa, opts) => aiCall((s) => post("/api/ai/defense-grade", { problemId, qa }, { signal: s }), opts),
  flashQuiz: (opts) => aiCall((s) => post("/api/ai/flash-quiz", {}, { signal: s }), opts),

  // Settings + import
  getSettings: () => get("/api/settings"),
  saveSettings: (data) => put("/api/settings", data),
  checkCompiler: () => get("/api/settings/compiler"),
  import: (payload) => post("/api/import", payload),

  // AI — long-running calls go through aiCall() so they're cancelable + tracked.
  getAiSettings: () => get("/api/settings/ai"),
  saveAiSettings: (data) => put("/api/settings/ai", data),
  // Each AI method takes an optional trailing `opts` ({ signal }) so callers can
  // scope cancellation to their own request (see aiCall's two-tier note).
  aiTestConnection: (opts) => aiCall((s) => post("/api/ai/test-connection", {}, { signal: s }), opts),
  aiGenerateTests: (data, opts) => aiCall((s) => post("/api/ai/generate-tests", data, { signal: s }), opts),
  aiCapabilities: () => get("/api/ai/capabilities"),
  aiOcr: (data, opts) => aiCall((s) => post("/api/ai/ocr", data, { signal: s }), opts),
  aiAnalyze: (data, opts) => aiCall((s) => post("/api/ai/analyze", data, { signal: s }), opts),
  aiTemplate: (data, opts) => aiCall((s) => post("/api/ai/template", data, { signal: s }), opts),
  aiProcess: (data, opts) => aiCall((s) => post("/api/ai/process", data, { signal: s }), opts),
  aiHint: (data, opts) => aiCall((s) => post("/api/ai/hint", data, { signal: s }), opts),
  aiReviewMistakes: (data, opts) => aiCall((s) => post("/api/ai/review-mistakes", data, { signal: s }), opts),
  aiReviewCode: (data, opts) => aiCall((s) => post("/api/ai/review-code", data, { signal: s }), opts),
  aiExplainError: (data, opts) => aiCall((s) => post("/api/ai/explain-error", data, { signal: s }), opts),
  aiGenHelper: (data, opts) => aiCall((s) => post("/api/ai/gen-helper", data, { signal: s }), opts),
  aiSynthesize: (data, opts) => aiCall((s) => post("/api/ai/synthesize", data, { signal: s }), opts),
  aiEditorial: (data, opts) => aiCall((s) => post("/api/ai/editorial", data, { signal: s }), opts),
  aiExplainTestCase: (data, opts) => aiCall((s) => post("/api/ai/explain-testcase", data, { signal: s }), opts),
  aiAutoFix: (data, opts) => aiCall((s) => post("/api/ai/auto-fix", data, { signal: s }), opts),
  aiDryRun: (data, opts) => aiCall((s) => post("/api/ai/dry-run", data, { signal: s }), opts),
  aiChat: (data, opts) => aiCall((s) => post("/api/ai/chat", data, { signal: s }), opts),
  // Streaming Coach chat (SSE). opts.onDelta(delta, accumulated) fires per chunk;
  // resolves { ok, reply, history } like aiChat. Falls back to the buffered
  // /chat endpoint when the server doesn't speak SSE (older backend). Goes
  // through aiCall, so the global cancel pill + local Stop button both work.
  aiChatStream: (data, opts = {}) => aiCall(async (signal) => {
    let res;
    try {
      res = await fetch("/api/ai/chat-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        signal
      });
    } catch (networkErr) {
      if (networkErr && networkErr.name === "AbortError") {
        const e = new Error("Đã hủy yêu cầu AI."); e.aborted = true; e.code = "ABORTED"; throw e;
      }
      throw new Error("Không kết nối được backend. Backend USACO IDE 2.0 có đang chạy không?");
    }

    const ctype = res.headers.get("content-type") || "";
    if (res.status === 404 || (res.ok && !ctype.includes("text/event-stream"))) {
      // Backend without /chat-stream — quietly use the buffered endpoint.
      return post("/api/ai/chat", data, { signal });
    }
    if (!res.ok) {
      const text = await res.text();
      let d = null; try { d = JSON.parse(text); } catch { d = { raw: text }; }
      const err = new Error((d && (d.error || d.message)) || `Request failed (${res.status})`);
      err.status = res.status; err.data = d;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", acc = "", finalPayload = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          let obj = null;
          try { obj = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (obj.delta) {
            acc += obj.delta;
            if (opts.onDelta) { try { opts.onDelta(obj.delta, acc); } catch { /* UI callback */ } }
          } else if (obj.done) {
            finalPayload = obj;
          } else if (obj.error) {
            const e = new Error(obj.error);
            if (obj.code) e.data = { code: obj.code };
            e.partial = acc;
            throw e;
          }
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        const e = new Error("Đã hủy yêu cầu AI."); e.aborted = true; e.code = "ABORTED"; e.partial = acc; throw e;
      }
      throw err;
    }
    if (finalPayload) return { ok: true, reply: finalPayload.reply, history: finalPayload.history };
    const e = new Error("Kết nối AI bị ngắt giữa chừng.");
    e.partial = acc;
    throw e;
  }, opts),
  aiChatHistory: (id) => get(`/api/ai/chat-history?problemId=${encodeURIComponent(id)}`),
  aiChatClear: (id) => post("/api/ai/chat-clear", { problemId: id }),
  aiDetectKey: (apiKey, opts) => aiCall((s) => post("/api/ai/detect-key", { apiKey }, { signal: s }), opts),

  // AI cancellation + activity. `abortAiRequest()` cancels everything in flight;
  // `onAiActivityChange(cb)` fires with the in-flight count (cb is called once now).
  abortAiRequest: () => { for (const c of aiControllers) { try { c.abort(); } catch { /* ignore */ } } },
  onAiActivityChange: (cb) => { aiListeners.add(cb); cb(aiControllers.size); return () => aiListeners.delete(cb); },

  // Contests (AI Contest Generator) — a separate domain from problems.
  listContests: () => get("/api/contests"),
  contestReadiness: (topic) => get(`/api/contests/readiness?topic=${encodeURIComponent(topic)}`),
  generateContest: (data, opts) => aiCall((s) => post("/api/contests/generate", data, { signal: s }), opts),
  getContest: (cid) => get(`/api/contests/${cid}`),
  deleteContest: (cid) => del(`/api/contests/${cid}`),
  getContestProblem: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}`),
  getContestStatement: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}/statement`),
  getContestCode: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}/code`),
  saveContestCode: (cid, pid, code) => put(`/api/contests/${cid}/problems/${pid}/code`, { code }),
  getContestInput: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}/input`),
  saveContestInput: (cid, pid, input) => put(`/api/contests/${cid}/problems/${pid}/input`, { input }),
  getContestExpected: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}/expected`),
  saveContestExpected: (cid, pid, expected) => put(`/api/contests/${cid}/problems/${pid}/expected`, { expected }),
  listContestTests: (cid, pid) => get(`/api/contests/${cid}/problems/${pid}/tests`),
  runContestProblem: (cid, pid, code) => post(`/api/contests/${cid}/problems/${pid}/run`, { code }),
  judgeContestProblem: (cid, pid, code, onlyTestId) => post(`/api/contests/${cid}/problems/${pid}/judge`, { code, onlyTestId })
};
