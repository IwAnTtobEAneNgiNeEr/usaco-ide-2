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
      const e = new Error("Đã hủy yêu cầu."); e.aborted = true; e.code = "ABORTED"; throw e;
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

async function postSse(url, body, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      const aborted = new Error("Đã hủy yêu cầu.");
      aborted.aborted = true;
      aborted.code = "ABORTED";
      throw aborted;
    }
    throw new Error("Không kết nối được backend. Backend USACO IDE 2.0 có đang chạy không?");
  }
  if (!res.ok) {
    const raw = await res.text();
    let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
    const error = new Error(data.error || data.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = null;
  for (;;) {
    let chunk;
    try { chunk = await reader.read(); }
    catch (error) {
      if (error && error.name === "AbortError") {
        const aborted = new Error("Đã hủy yêu cầu.");
        aborted.aborted = true;
        aborted.code = "ABORTED";
        throw aborted;
      }
      throw error;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop();
    for (const event of events) {
      const line = event.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) continue;
      let frame; try { frame = JSON.parse(line.slice(6)); } catch { continue; }
      if (frame.done) terminal = frame;
      if (typeof opts.onEvent === "function") {
        try { opts.onEvent(frame); } catch { /* UI progress callbacks are isolated */ }
      }
    }
  }
  if (terminal) return terminal;
  throw new Error("Kết nối Stress Test bị ngắt giữa chừng.");
}

export const api = {
  health: () => get("/api/health"),

  // Problems
  listProblems: () => get("/api/problems"),
  // Smart Library search (B1). `qs` is a prebuilt query string
  // (core/search-model.js buildSearchParams) — server returns ranked results
  // with its own "Vì sao khớp" reasons. 404 = backend without the route; the
  // Library falls back to local filtering.
  searchProblems: (qs) => get(`/api/problems/search${qs ? `?${qs}` : ""}`),
  // Home entry policy (B2): ≤3 reasoned items; unfinished work ranks first.
  // `qs` carries dismissed=/liked= (core/entry-model.js). 404 = backend
  // without the route; the home keeps its local ladder.
  entryRecommendations: (qs) => get(`/api/recommendations/entry${qs ? `?${qs}` : ""}`),
  getProblem: (id) => get(`/api/problems/${id}`),
  // Everything needed to open a problem (meta + files + tests) in one request.
  getWorkspace: (id) => get(`/api/problems/${id}/workspace`),
  createProblem: (data) => post("/api/problems", data),
  updateProblem: (id, data) => put(`/api/problems/${id}`, data),
  deleteProblem: (id) => del(`/api/problems/${id}`),
  duplicateProblem: (id) => post(`/api/problems/${id}/duplicate`),
  personalizedProblem: (recentWindow = 8, opts = {}) => aiCall(
    (signal) => post("/api/problems/personalized", { recentWindow }, { signal }),
    opts
  ),
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
  gameReview: (id) => get(`/api/problems/${id}/game-review`),

  // Tests
  listTests: (id) => get(`/api/problems/${id}/tests`),
  addTest: (id, data) => post(`/api/problems/${id}/tests`, data),
  addTestsBulk: (id, tests) => post(`/api/problems/${id}/tests/bulk`, { tests }),
  updateTest: (id, testId, data) => put(`/api/problems/${id}/tests/${testId}`, data),
  deleteTest: (id, testId) => del(`/api/problems/${id}/tests/${testId}`),

  // Judge — opts ({ signal }) lets the Stop button abort; the backend stops
  // launching further tests as soon as the connection drops.
  run: (id, code, opts) => post(`/api/problems/${id}/run`, { code }, opts),
  // intent="derive-module" only when the user has actually chosen that
  // direction — default stays "competitive" (docs/VERIFIED-ARTIFACT-API.md
  // §Agent B integration notes). Backend reads it to shape `nextAction` on AC.
  judge: (id, code, onlyTestId, opts, intent) => post(`/api/problems/${id}/judge`, { code, onlyTestId, intent }, opts),

  // ---- Verified Artifact Loop (docs/VERIFIED-ARTIFACT-API.md) --------------
  verifiedArtifact: (id, intent) => get(`/api/problems/${id}/verified-artifact${intent === "derive-module" ? "?intent=derive-module" : ""}`),
  // `href` on a run/judge response's `.evidence` is the canonical path — call
  // this only as a fallback when a caller already has just the id.
  evidence: (id, evidenceId) => get(`/api/problems/${id}/evidence/${encodeURIComponent(evidenceId)}`),
  evidenceByHref: (href) => get(href),
  bfsTrace: (id, evidenceId) => post(`/api/problems/${id}/analysis/bfs-trace`, { evidenceId }),
  // Concept-scoped deterministic traces (B3). kind ∈ bfs-trace | dijkstra-trace
  // | prefix-sum-trace (core/concept-detect.js). Server re-runs from the
  // evidence's own code+input; 404/501 = trace not shipped → honest fallback.
  analysisTrace: (id, kind, evidenceId) => post(`/api/problems/${id}/analysis/${encodeURIComponent(kind)}`, { evidenceId }),
  derivedArtifacts: (id) => get(`/api/problems/${id}/derived`),
  createGridPathfinder: (id, evidenceId) => post(`/api/problems/${id}/derived/grid-pathfinder`, { evidenceId }),
  // Generic create for the contract's derived modules (B4): grid-pathfinder,
  // weighted-graph-router, range-sum-module. Only a full Judge AC evidence id
  // is accepted by the backend.
  createDerivedModule: (id, moduleId, evidenceId) => post(`/api/problems/${id}/derived/${encodeURIComponent(moduleId)}`, { evidenceId }),
  getDerivedArtifact: (id, artifactId) => get(`/api/problems/${id}/derived/${encodeURIComponent(artifactId)}`),
  // Edit loop: read/write only GridPathfinder.cpp; the original main.cpp is
  // never touched (backend enforces this). Re-run verify after saving.
  getDerivedSource: (id, artifactId) => get(`/api/problems/${id}/derived/${encodeURIComponent(artifactId)}/source`),
  saveDerivedSource: (id, artifactId, source) => put(`/api/problems/${id}/derived/${encodeURIComponent(artifactId)}/source`, { source }),
  verifyDerivedArtifact: (id, artifactId, suite) => post(`/api/problems/${id}/derived/${encodeURIComponent(artifactId)}/verify`, { suite }),
  activateRequirementChange: (id, artifactId, changeId) => post(`/api/problems/${id}/derived/${encodeURIComponent(artifactId)}/requirement-changes/${encodeURIComponent(changeId)}/activate`, {}),

  // ---- Applied Algorithms v1 — standalone catalog modules (/api/modules) ----
  // Same artifact vocabulary as the per-problem derived routes, but scoped to
  // the catalog pilot (grid-pathfinder, weighted-graph-router, range-sum-module).
  // 404 on the list = backend without the pilot → the Library simply shows no
  // module rows (honest absence, never fabricated ones).
  listModules: () => get("/api/modules"),
  // POST /open materializes the curated module on first open and is idempotent
  // thereafter (contract §Open/materialize) — the canonical way in.
  openModule: (artifactId) => post(`/api/modules/${encodeURIComponent(artifactId)}/open`, {}),
  getModule: (artifactId) => get(`/api/modules/${encodeURIComponent(artifactId)}`),
  getModuleSource: (artifactId) => get(`/api/modules/${encodeURIComponent(artifactId)}/source`),
  saveModuleSource: (artifactId, source) => put(`/api/modules/${encodeURIComponent(artifactId)}/source`, { source }),
  verifyModule: (artifactId, suite) => post(`/api/modules/${encodeURIComponent(artifactId)}/verify`, { suite }),
  activateModuleRequirementChange: (artifactId, changeId) => post(`/api/modules/${encodeURIComponent(artifactId)}/requirement-changes/${encodeURIComponent(changeId)}/activate`, {}),
  // Route Planner (B4): compiles & runs the REAL verified WeightedGraphRouter
  // on the structured input (contract §Route Planner Simulation).
  // 409 = module not verified yet; 422 = compile/runtime failure.
  simulateRoute: (input) => post("/api/modules/weighted-graph-router/simulate", { input }),

  // Recorder events only the frontend can observe (README-AUTOPILOT.md M6).
  // Fire-and-forget by convention — callers should not await/block on this.
  recordEvent: (id, type, data) => post(`/api/problems/${id}/event`, { type, data }).catch(() => {}),

  // SPJ checker source (checker.cpp) — used when the problem has usesChecker on.
  getChecker: (id) => get(`/api/problems/${id}/checker`),
  saveChecker: (id, checker) => put(`/api/problems/${id}/checker`, { checker }),

  // Lab (stress tester + complexity profiler) + analytics
  stress: (id, data) => post(`/api/problems/${id}/stress`, data),
  stressStream: (id, data, opts = {}) => postSse(
    `/api/problems/${encodeURIComponent(id)}/stress/stream`,
    data,
    opts
  ),
  profile: (id, data) => post(`/api/problems/${id}/profile`, data),
  // Khung test thi đấu — ONE AI call: subtask plan (tổng ≥100 test) + generator
  // theo subtask. Không coach, không hint — phần còn lại user tự làm.
  examPlan: (id, statement, opts) => aiCall((s) => post(`/api/problems/${encodeURIComponent(id)}/exam-plan`, { statement }, { signal: s }), opts),
  stats: () => get("/api/stats"),
  skillMap: () => get("/api/stats/skills"),
  reviewQueue: () => get("/api/stats/review-queue"),
  plannerSession: (budgetMinutes) => get(`/api/planner/session?budgetMinutes=${encodeURIComponent(budgetMinutes || 45)}`),
  plannerQuiz: () => get("/api/planner/quiz"),
  progress: () => get("/api/progress"),
  mistakeBook: () => get("/api/stats/mistakes"),

  // ⚔ Đấu Trường (Arena) — S1-S12 backend, all local except the gauntlet's
  // FIRST run per problem (which may generate a reference/generator via AI,
  // hence aiCall so the global cancel pill applies).
  arenaRating: () => get("/api/arena/rating"),
  arenaStakes: (problemId) => get(`/api/arena/rating/stakes?problemId=${encodeURIComponent(problemId)}`),
  arenaMatch: (id) => get(`/api/problems/${id}/match`),
  arenaAdjourn: (id) => post(`/api/problems/${id}/match/adjourn`),
  arenaSurrender: (id) => post(`/api/problems/${id}/match/surrender`),
  arenaConfirmRating: (id) => post(`/api/problems/${id}/rating-confirm`),
  arenaGauntlet: (id, data, opts) => aiCall((s) => post(`/api/problems/${id}/gauntlet`, data, { signal: s }), opts),
  arenaVaultStatus: (id) => get(`/api/problems/${id}/reference`),
  arenaCards: () => get("/api/arena/cards"),
  arenaCard: (tag) => get(`/api/arena/cards/${encodeURIComponent(tag)}`),
  // Fire-and-forget by convention (quiz write-back must never block the UI).
  arenaCardTrain: (tag, correct) => post(`/api/arena/cards/${encodeURIComponent(tag)}/train`, { correct }).catch(() => null),
  arenaRoadmap: () => get("/api/arena/roadmap"),
  arenaGhost: (id) => get(`/api/problems/${id}/ghost`),
  arenaMemoir: (id) => get(`/api/problems/${id}/memoir`),
  arenaReel: () => get("/api/arena/reel"),
  arenaSeason: () => get("/api/arena/season"),
  // Nâng cấp tham chiếu 1-click — zero AI, reuses the student's own AC'd code.
  arenaUpgradeCandidates: () => get("/api/arena/upgrade-candidates"),
  arenaPromoteFromAc: (id) => post(`/api/problems/${id}/reference/promote-from-ac`),
  arenaPromoteAll: (budgetMs) => post("/api/arena/upgrade-candidates/promote-all", { budgetMs }),
  arenaArbitrate: (id, testId, data, opts) => post(`/api/problems/${id}/tests/${testId}/arbitrate`, data || {}, opts),
  arenaValidateTest: (id, testId) => post(`/api/problems/${id}/tests/${testId}/validate`),

  // ⚔ Đối Thủ & Sổ Cái (backend 2026-07-07): nước đi tiếp theo, dấu AC, lỗi lặp, thử thách.
  arenaNextBet: () => get("/api/arena/next-bet"),
  arenaMysteryOpen: () => post("/api/arena/next-bet/mystery/open"),
  arenaMysteryReroll: () => post("/api/arena/next-bet/mystery/reroll"),
  arenaGauntletReject: (id, data) => post(`/api/problems/${encodeURIComponent(id)}/gauntlet/reject`, data || {}),
  arenaSeal: (id) => get(`/api/problems/${id}/seal`),
  arenaSeals: () => get("/api/arena/seals"),
  arenaSpecimenQueue: () => get("/api/arena/specimen-queue"),
  arenaScoutingReport: (id) => get(`/api/problems/${id}/scouting-report`),
  arenaBossCases: () => get("/api/arena/boss-cases"),
  arenaProblemBossCases: (id) => get(`/api/problems/${id}/boss-cases`),
  // Sealed Gauntlet (SSE). opts.onEvent(frame) fires per frame ({stage:"start"},
  // {stage:"phase-start",phase}, {stage:"progress",...}); resolves with the
  // final done frame (same shape as the buffered arenaGauntlet response).
  // Falls back to the buffered endpoint when the server doesn't stream (older
  // backend). Routed through aiCall — the first run per problem may generate a
  // reference/generator via AI, so the global cancel pill must apply.
  arenaGauntletStream: (id, data, opts = {}) => aiCall(async (signal) => {
    let res;
    try {
      res = await fetch(`/api/problems/${encodeURIComponent(id)}/gauntlet/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data || {}),
        signal
      });
    } catch (networkErr) {
      if (networkErr && networkErr.name === "AbortError") {
        const e = new Error("Đã hủy yêu cầu."); e.aborted = true; e.code = "ABORTED"; throw e;
      }
      throw new Error("Không kết nối được backend. Backend USACO IDE 2.0 có đang chạy không?");
    }

    const ctype = res.headers.get("content-type") || "";
    if (res.status === 404 || (res.ok && !ctype.includes("text/event-stream"))) {
      // Backend without /gauntlet/stream — quietly use the buffered endpoint.
      return post(`/api/problems/${encodeURIComponent(id)}/gauntlet`, data || {}, { signal });
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
    let buf = "", finalPayload = null;
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (err && err.name === "AbortError") {
          const e = new Error("Đã hủy yêu cầu."); e.aborted = true; e.code = "ABORTED"; throw e;
        }
        throw err;
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop();
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let obj = null;
        try { obj = JSON.parse(line.slice(6)); } catch { continue; }
        if (obj.done) finalPayload = obj;
        else if (opts.onEvent) { try { opts.onEvent(obj); } catch { /* UI callback */ } }
      }
    }
    if (finalPayload) return finalPayload;
    throw new Error("Kết nối Đấu Trường bị ngắt giữa chừng.");
  }, opts),

  // ⚔️ Weekend Boss + 🎓 Explain Your Solution (defense)
  bossStatus: () => get("/api/boss"),
  bossSummon: (opts) => aiCall((s) => post("/api/boss/summon", {}, { signal: s }), opts),
  defenseQuestions: (problemId, opts) => aiCall((s) => post("/api/ai/defense-questions", { problemId }, { signal: s }), opts),
  defenseGrade: (problemId, qa, opts) => aiCall((s) => post("/api/ai/defense-grade", { problemId, qa }, { signal: s }), opts),

  // Settings + import
  getSettings: () => get("/api/settings"),
  saveSettings: (data) => put("/api/settings", data),
  checkCompiler: () => get("/api/settings/compiler"),
  // Personal C++ starter for new problems; blank template = reset to built-in.
  getTemplate: () => get("/api/settings/template"),
  saveTemplate: (template) => put("/api/settings/template", { template }),
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
  // WA Autopsy: reference + shrink can take up to ~30s — routed through aiCall
  // so the global "AI đang chạy… ✕ Hủy" pill and scoped cancel both apply.
  autopsy: (id, data, opts) => aiCall((s) => post(`/api/problems/${id}/autopsy`, data, { signal: s }), opts),
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
  runContestProblem: (cid, pid, code, opts) => post(`/api/contests/${cid}/problems/${pid}/run`, { code }, opts),
  judgeContestProblem: (cid, pid, code, onlyTestId, opts) => post(`/api/contests/${cid}/problems/${pid}/judge`, { code, onlyTestId }, opts),

  // 🧩 Điền Lõi (Core Fill) — "fix tư duy code": AI writes a full solution
  // with its ONE core reasoning step carved out; the student fills only that.
  // next/attempt go through aiCall since an empty deck falls back to
  // synchronous AI generation (same reasoning as arenaGauntlet's first run).
  corefillNext: (topic, opts) => aiCall((s) => get(`/api/arena/corefill/next${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`, { signal: s }), opts),
  // Non-scoring custom-input run. It compiles the edited scaffold but never
  // consumes/reveals the drill's hidden judge tests.
  corefillRun: (drillId, code, input, expected, opts) => post(`/api/arena/corefill/${encodeURIComponent(drillId)}/run`, { code, input, expected }, opts),
  corefillAttempt: (drillId, code, opts) => aiCall((s) => post(`/api/arena/corefill/${encodeURIComponent(drillId)}/attempt`, { code }, { signal: s }), opts),

  // ⚡ Luyện debug tốc độ (Bug Rush) — a fully separate arcade zone (features/rush.js).
  // start/submit go through aiCall since the deck can run dry mid-run and
  // fall back to synchronous generation — the global cancel pill must apply
  // exactly like arenaGauntlet's first-run-may-call-AI case.
  rushStart: (opts) => aiCall((s) => post("/api/arena/rush/start", {}, { signal: s }), opts),
  rushState: () => get("/api/arena/rush/state"),
  // Compile/run against user-provided stdin without spending a life or moving
  // the Rush clock/state forward.
  rushRun: (code, input, expected, opts) => post("/api/arena/rush/run", { code, input, expected }, opts),
  rushSubmit: (code, opts) => aiCall((s) => post("/api/arena/rush/submit", { code }, { signal: s }), opts),
  // Hint lũy tiến (server-authoritative): cấp 1 khoanh vùng miễn phí, cấp 2 kỹ
  // thuật trừ 1 điểm — không bao giờ trả bugSummary.
  rushHint: (opts) => post("/api/arena/rush/hint", {}, opts)
};
