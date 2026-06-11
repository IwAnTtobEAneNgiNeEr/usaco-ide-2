// features/contests.js — the AI Contest Generator UI. A self-contained full-screen
// overlay with three screens: a Hub (list contests, filter by topic), a Create flow
// (pick topic → see readiness → choose count/ratings → Generate), and a Workspace
// (open a contest, read each problem's statement, code, run + judge). Contests are a
// separate domain from the Problem Explorer — nothing here touches app.loadProblem.
//
// AI is only ever called when the user clicks "Generate with AI"; opening the tab
// never spends tokens.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const PRESET_TOPICS = [
  "Greedy", "DP", "Graph", "Tree", "Math", "Binary Search", "Two Pointers",
  "Prefix Sum", "Sorting", "Strings", "Number Theory", "Bitmask", "DSU",
  "Stack", "Queue", "Recursion", "Backtracking", "Sliding Window", "Simulation", "Geometry"
];

function normTopic(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ---- Tiny Markdown renderer (headings / bold / inline code / lists / fences) ----
function renderInline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function renderMarkdown(md) {
  const parts = String(md || "").split(/```/);
  let html = "";
  parts.forEach((seg, idx) => {
    if (idx % 2 === 1) { // fenced code block
      html += `<pre class="cw-pre">${escapeHtml(seg.replace(/^[a-zA-Z]*\n/, "").replace(/\s+$/, ""))}</pre>`;
      return;
    }
    const lines = seg.split(/\r?\n/);
    let inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (/^###\s+/.test(line)) { closeList(); html += `<h4>${renderInline(line.replace(/^###\s+/, ""))}</h4>`; }
      else if (/^##\s+/.test(line)) { closeList(); html += `<h3>${renderInline(line.replace(/^##\s+/, ""))}</h3>`; }
      else if (/^#\s+/.test(line)) { closeList(); html += `<h2>${renderInline(line.replace(/^#\s+/, ""))}</h2>`; }
      else if (/^[-*]\s+/.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`; }
      else if (line.trim() === "") { closeList(); }
      else { closeList(); html += `<p>${renderInline(line)}</p>`; }
    }
    closeList();
  });
  return html;
}

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString();
}
function verdictBadge(v) {
  return v ? `<span class="vbadge v-${escapeHtml(v)}">${escapeHtml(v)}</span>` : "";
}

function buildOverlay() {
  const existing = document.getElementById("contests-overlay");
  if (existing) return existing;
  const o = document.createElement("div");
  o.id = "contests-overlay";
  o.className = "contest-overlay hidden";
  o.innerHTML = `
    <div class="contest-shell">
      <header class="contest-bar">
        <button id="contest-back" class="btn btn-ghost btn-sm hidden">← Quay lại</button>
        <span class="contest-bar-title">🏆 AI Contests</span>
        <span class="contest-bar-spacer"></span>
        <button id="contest-new-btn" class="btn btn-primary btn-sm">+ Tạo contest</button>
        <button id="contest-close" class="btn btn-ghost btn-sm">✕ Đóng</button>
      </header>

      <!-- HUB -->
      <div class="contest-screen" id="contest-hub">
        <div class="contest-hub-head">
          <input id="contest-topic-filter" class="input" type="search" placeholder="Lọc contest theo topic…" autocomplete="off" />
        </div>
        <div id="contest-list" class="contest-cards"></div>
      </div>

      <!-- CREATE -->
      <div class="contest-screen hidden" id="contest-create">
        <div class="contest-create-card">
          <h2 class="contest-h2">Tạo contest mới</h2>
          <p class="panel-hint">AI tạo 5-7 bài hoàn toàn mới cùng chủ đề, độ khó tăng dần (dưới 2000 elo), kèm đề · ràng buộc · test đã kiểm chứng. Không clone bài bạn đã giải.</p>
          <label class="cc-label">Chủ đề (topic)
            <select id="cc-topic" class="select"></select>
          </label>
          <div id="cc-readiness" class="cc-readiness"></div>
          <div class="cc-grid">
            <label class="cc-label">Số bài
              <select id="cc-count" class="select">
                <option value="5">5 bài</option>
                <option value="6" selected>6 bài</option>
                <option value="7">7 bài</option>
              </select>
            </label>
            <label class="cc-label">Rating nhỏ nhất
              <input id="cc-min" class="input" type="number" min="1" max="1999" value="800" />
            </label>
            <label class="cc-label">Rating lớn nhất
              <input id="cc-max" class="input" type="number" min="1" max="1999" value="1800" />
            </label>
          </div>
          <label class="cc-force"><input type="checkbox" id="cc-force" /> Tạo dù chưa đủ bài (bỏ qua điều kiện)</label>
          <div class="cc-actions">
            <button id="cc-generate" class="btn btn-primary">✨ Generate with AI</button>
          </div>
          <div id="cc-status" class="cc-status"></div>
        </div>
      </div>

      <!-- WORKSPACE -->
      <div class="contest-screen hidden" id="contest-workspace">
        <div class="cw-head">
          <div><b id="cw-title">Contest</b> <span id="cw-meta" class="muted"></span></div>
          <button id="cw-delete" class="btn btn-ghost btn-sm" title="Xóa contest">🗑 Xóa</button>
        </div>
        <div class="cw-body">
          <aside id="cw-problems" class="cw-problems"></aside>
          <section class="cw-main">
            <div class="cw-tabs" id="cw-tabs">
              <button class="cw-tab active" data-cwtab="statement">Đề bài</button>
              <button class="cw-tab" data-cwtab="code">Code</button>
              <button class="cw-tab" data-cwtab="tests">Tests</button>
            </div>
            <div class="cw-pane" data-cwpane="statement"><div id="cw-statement" class="cw-statement"></div></div>
            <div class="cw-pane hidden" data-cwpane="code">
              <div class="cw-code-toolbar">
                <button id="cw-run" class="btn btn-run btn-sm">Run ▶</button>
                <button id="cw-judge" class="btn btn-judge btn-sm">Judge all</button>
                <button id="cw-save" class="btn btn-ghost btn-sm">Save</button>
                <span class="toolbar-spacer"></span>
                <span id="cw-verdict" class="verdict-chip verdict-idle">READY</span>
                <span id="cw-runtime" class="muted"></span>
              </div>
              <textarea id="cw-code" class="cw-code" spellcheck="false" autocomplete="off" wrap="off"></textarea>
              <pre id="cw-output" class="cw-output"></pre>
            </div>
            <div class="cw-pane hidden" data-cwpane="tests"><div id="cw-tests" class="cw-tests"></div></div>
          </section>
        </div>
      </div>
    </div>`;
  document.body.appendChild(o);
  return o;
}

export function initContests(app) {
  const trigger = document.getElementById("btn-contests");
  if (!trigger) return;
  const overlay = buildOverlay();
  const $ = (id) => overlay.querySelector("#" + id);

  const screens = {
    hub: $("contest-hub"),
    create: $("contest-create"),
    workspace: $("contest-workspace")
  };
  const backBtn = $("contest-back");
  const newBtn = $("contest-new-btn");

  let current = { contestId: null, problems: [], pid: null };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
    backBtn.classList.toggle("hidden", name === "hub");
    newBtn.classList.toggle("hidden", name !== "hub");
  }

  const open = () => { overlay.classList.remove("hidden"); showScreen("hub"); loadHub(); };
  const close = () => overlay.classList.add("hidden");
  trigger.addEventListener("click", open);
  $("contest-close").addEventListener("click", close);
  backBtn.addEventListener("click", () => showScreen("hub"));
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  // ---------------- HUB ----------------
  const listEl = $("contest-list");
  const topicFilter = $("contest-topic-filter");
  let allContests = [];

  function renderHub() {
    const q = topicFilter.value.trim().toLowerCase();
    const visible = allContests.filter((c) => !q || `${c.title} ${c.topic}`.toLowerCase().includes(q));
    if (visible.length === 0) {
      listEl.innerHTML = `<div class="contest-empty">${allContests.length === 0
        ? "Chưa có contest nào. Bấm <b>+ Tạo contest</b> để AI dựng bộ đề mới cùng chủ đề bạn đã luyện."
        : "Không có contest khớp bộ lọc."}</div>`;
      return;
    }
    listEl.innerHTML = visible.map((c) => {
      const prog = c.problemCount ? Math.round((c.solvedCount / c.problemCount) * 100) : 0;
      const statusLabel = { not_started: "Chưa bắt đầu", in_progress: "Đang làm", completed: "Hoàn thành" }[c.status] || c.status;
      return `
        <div class="contest-card" data-cid="${escapeHtml(c.id)}">
          <div class="contest-card-top">
            <span class="contest-card-title">${escapeHtml(c.title)}</span>
            <span class="contest-chip contest-status-${escapeHtml(c.status)}">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="contest-card-sub">
            <span class="contest-tag">${escapeHtml(c.topic || "—")}</span>
            <span class="p-dot"></span><span>${c.problemCount} bài</span>
            <span class="p-dot"></span><span>${c.targetRatingStart}–${c.targetRatingEnd} elo</span>
            <span class="p-dot"></span><span>${relTime(c.createdAt)}</span>
          </div>
          <div class="contest-progress"><div class="contest-progress-bar" style="width:${prog}%"></div></div>
          <div class="contest-card-foot">
            <span class="muted">${c.solvedCount}/${c.problemCount} AC</span>
            <span class="toolbar-spacer"></span>
            <button class="btn btn-ghost btn-sm" data-act="open">Mở</button>
            <button class="icon-btn" data-act="del" title="Xóa contest">✕</button>
          </div>
        </div>`;
    }).join("");
  }

  async function loadHub() {
    listEl.innerHTML = `<div class="contest-empty"><span class="spinner"></span> Đang tải…</div>`;
    try {
      const { contests } = await api.listContests();
      allContests = contests || [];
      renderHub();
    } catch (err) {
      listEl.innerHTML = `<div class="contest-empty mk-bad">${escapeHtml(err.message)}</div>`;
    }
  }

  topicFilter.addEventListener("input", renderHub);
  listEl.addEventListener("click", async (e) => {
    const card = e.target.closest(".contest-card");
    if (!card) return;
    const cid = card.dataset.cid;
    const act = e.target.closest("[data-act]") && e.target.closest("[data-act]").dataset.act;
    if (act === "del") {
      e.stopPropagation();
      const c = allContests.find((x) => x.id === cid);
      if (!confirm(`Xóa contest "${c ? c.title : cid}"? Toàn bộ bài + bài làm trong contest sẽ bị xóa.`)) return;
      try { await api.deleteContest(cid); app.toast("Đã xóa contest", "ok"); loadHub(); }
      catch (err) { app.toast(err.message, "err"); }
      return;
    }
    openContest(cid);
  });

  // ---------------- CREATE ----------------
  const topicSel = $("cc-topic");
  const readinessEl = $("cc-readiness");
  const countSel = $("cc-count");
  const minIn = $("cc-min");
  const maxIn = $("cc-max");
  const forceChk = $("cc-force");
  const genBtn = $("cc-generate");
  const ccStatus = $("cc-status");
  let lastReadiness = null;
  let genAbort = null;
  const genLabel = genBtn ? genBtn.textContent : "✨ Generate with AI";

  function knownTopics() {
    const map = new Map();
    PRESET_TOPICS.forEach((t) => map.set(normTopic(t), t));
    (app.state.problems || []).forEach((p) => {
      [p.topic, ...(p.tags || [])].filter(Boolean).forEach((t) => {
        const k = normTopic(t);
        if (k && !map.has(k)) map.set(k, String(t));
      });
    });
    return [...map.values()];
  }

  function fillTopics(preselect) {
    const topics = knownTopics();
    topicSel.innerHTML = topics.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (preselect) {
      const hit = topics.find((t) => normTopic(t) === normTopic(preselect));
      if (hit) topicSel.value = hit;
    }
  }

  function renderReadiness() {
    const r = lastReadiness;
    if (!r) { readinessEl.innerHTML = ""; return; }
    const cls = r.ready ? "cc-ready-ok" : "cc-ready-warn";
    const label = r.ready
      ? `Sẵn sàng ✓ — ${r.eligibleCount} bài đã giải cùng chủ đề`
      : `Mới có ${r.eligibleCount}/${r.minEligible} bài đã giải — chưa đủ điều kiện`;
    const sample = (r.problems || []).slice(0, 6)
      .map((p) => `<li>${escapeHtml(p.title)} <span class="muted">· ${p.rating} elo</span></li>`).join("");
    readinessEl.innerHTML = `
      <div class="cc-ready ${cls}">${escapeHtml(label)}</div>
      ${sample ? `<ul class="cc-ready-list">${sample}</ul>` : ""}`;
    forceChk.parentElement.classList.toggle("hidden", r.ready);
  }

  async function refreshReadiness() {
    const topic = topicSel.value;
    readinessEl.innerHTML = `<div class="cc-ready"><span class="spinner"></span> Kiểm tra điều kiện…</div>`;
    try {
      lastReadiness = await api.contestReadiness(topic);
      renderReadiness();
      countSel.value = String(lastReadiness.recommendedProblemCount || 6);
      minIn.value = String(lastReadiness.ratingMin || 800);
      maxIn.value = String(Math.min(lastReadiness.ratingMax || 1800, 1999));
    } catch (err) {
      readinessEl.innerHTML = `<div class="cc-ready mk-bad">${escapeHtml(err.message)}</div>`;
    }
  }

  function openCreate() {
    ccStatus.innerHTML = "";
    const openMeta = app.state.meta;
    fillTopics(openMeta ? openMeta.topic : null);
    showScreen("create");
    refreshReadiness();
  }
  newBtn.addEventListener("click", openCreate);
  topicSel.addEventListener("change", refreshReadiness);

  genBtn.addEventListener("click", async () => {
    // Mid-flight: abort the running generation.
    if (genAbort) { genAbort.abort(); return; }

    const topic = topicSel.value.trim();
    if (!topic) { app.toast("Chọn topic trước.", "err"); return; }
    const payload = {
      topic,
      problemCount: Number(countSel.value),
      minRating: Number(minIn.value) || 800,
      maxRating: Math.min(Number(maxIn.value) || 1800, 1999),
      force: forceChk.checked
    };
    genAbort = new AbortController();
    genBtn.textContent = "⏹ Dừng";
    genBtn.classList.add("btn-stop");
    ccStatus.innerHTML = `<div class="cc-loading"><span class="spinner"></span> AI đang ra đề ${payload.problemCount} bài + kiểm chứng test. Việc này có thể mất 1-2 phút, đừng đóng cửa sổ.</div>`;
    try {
      const res = await api.generateContest(payload, { signal: genAbort.signal });
      const warns = (res.warnings || []).length ? `<div class="cc-warns">⚠ ${res.warnings.map(escapeHtml).join("<br>⚠ ")}</div>` : "";
      ccStatus.innerHTML = `<div class="cc-ready cc-ready-ok">Đã tạo contest "${escapeHtml(res.contest.title)}" với ${res.problems.length} bài.</div>${warns}`;
      app.toast("Đã tạo contest mới", "ok");
      await loadHub();
      setTimeout(() => openContest(res.contest.id), 400);
    } catch (err) {
      if (err && err.aborted) {
        ccStatus.innerHTML = `<div class="cc-ready">⏹ Đã dừng tạo contest.</div>`;
      } else {
        let msg = escapeHtml(err.message);
        if (err.data && err.data.code === "NO_KEY") msg += ` — <b>mở Settings để nhập API key</b>.`;
        if (err.data && err.data.code === "NOT_READY") msg += ` — tick "Tạo dù chưa đủ bài" để bỏ qua.`;
        ccStatus.innerHTML = `<div class="cc-ready mk-bad">${msg}</div>`;
      }
    } finally {
      genAbort = null;
      genBtn.textContent = genLabel;
      genBtn.classList.remove("btn-stop");
    }
  });

  // ---------------- WORKSPACE ----------------
  const cwTitle = $("cw-title");
  const cwMeta = $("cw-meta");
  const cwProblems = $("cw-problems");
  const cwStatement = $("cw-statement");
  const cwCode = $("cw-code");
  const cwOutput = $("cw-output");
  const cwVerdict = $("cw-verdict");
  const cwRuntime = $("cw-runtime");
  const cwTestsEl = $("cw-tests");

  // Workspace sub-tabs.
  $("cw-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".cw-tab");
    if (!btn) return;
    const tab = btn.dataset.cwtab;
    overlay.querySelectorAll(".cw-tab").forEach((b) => b.classList.toggle("active", b === btn));
    overlay.querySelectorAll(".cw-pane").forEach((p) => p.classList.toggle("hidden", p.dataset.cwpane !== tab));
  });

  // Tab key inserts spaces in the contest code editor.
  cwCode.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = cwCode.selectionStart, en = cwCode.selectionEnd;
      cwCode.value = cwCode.value.slice(0, s) + "    " + cwCode.value.slice(en);
      cwCode.selectionStart = cwCode.selectionEnd = s + 4;
    }
  });

  function renderProblemList() {
    cwProblems.innerHTML = current.problems.map((p) => `
      <button class="cw-pitem ${p.id === current.pid ? "active" : ""}" data-pid="${escapeHtml(p.id)}">
        <span class="cw-pidx">${escapeHtml(p.id)}</span>
        <span class="cw-pinfo">
          <span class="cw-pname">${escapeHtml(p.title)}</span>
          <span class="cw-prating">${p.rating} elo ${verdictBadge(p.lastVerdict)}</span>
        </span>
      </button>`).join("");
  }

  cwProblems.addEventListener("click", (e) => {
    const item = e.target.closest(".cw-pitem");
    if (item) selectProblem(item.dataset.pid);
  });

  function setVerdict(v, runtime) {
    const known = ["AC", "WA", "RE", "TLE", "CE", "MLE"];
    cwVerdict.className = "verdict-chip " + (known.includes(v) ? "v-" + v : "verdict-idle");
    cwVerdict.textContent = v || "READY";
    cwRuntime.textContent = runtime != null ? `${runtime} ms` : "";
  }

  async function selectProblem(pid) {
    current.pid = pid;
    renderProblemList();
    cwStatement.innerHTML = `<p class="muted"><span class="spinner"></span> Đang tải đề…</p>`;
    cwOutput.textContent = "";
    setVerdict("READY", null);
    try {
      const [{ statement }, { code }, { tests }] = await Promise.all([
        api.getContestStatement(current.contestId, pid),
        api.getContestCode(current.contestId, pid),
        api.listContestTests(current.contestId, pid)
      ]);
      cwStatement.innerHTML = renderMarkdown(statement || "(chưa có đề)");
      cwCode.value = code || "";
      renderTests(tests);
    } catch (err) {
      cwStatement.innerHTML = `<p class="mk-bad">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderTests(tests) {
    if (!tests || !tests.length) { cwTestsEl.innerHTML = `<p class="muted">Chưa có test.</p>`; return; }
    cwTestsEl.innerHTML = tests.map((t) => `
      <div class="cw-test">
        <div class="cw-test-head">${escapeHtml(t.name)} ${t.reason ? `<span class="muted">· ${escapeHtml(t.reason)}</span>` : ""}</div>
        <div class="cw-test-io">
          <div><div class="cw-test-label">input</div><pre>${escapeHtml(t.input)}</pre></div>
          <div><div class="cw-test-label">expected</div><pre>${escapeHtml(t.expected)}</pre></div>
        </div>
      </div>`).join("");
  }

  async function openContest(cid) {
    showScreen("workspace");
    current = { contestId: cid, problems: [], pid: null };
    cwTitle.textContent = "Đang tải…";
    cwMeta.textContent = "";
    cwProblems.innerHTML = "";
    cwStatement.innerHTML = "";
    cwCode.value = "";
    try {
      const { contest, problems } = await api.getContest(cid);
      current.problems = problems || [];
      cwTitle.textContent = contest.title;
      cwMeta.textContent = `${contest.topic} · ${problems.length} bài · ${contest.targetRatingStart}–${contest.targetRatingEnd} elo`;
      renderProblemList();
      if (current.problems[0]) selectProblem(current.problems[0].id);
    } catch (err) {
      app.toast(err.message, "err");
      showScreen("hub");
    }
  }

  $("cw-delete").addEventListener("click", async () => {
    if (!current.contestId) return;
    if (!confirm("Xóa contest này? Toàn bộ bài + bài làm sẽ mất.")) return;
    try { await api.deleteContest(current.contestId); app.toast("Đã xóa", "ok"); showScreen("hub"); loadHub(); }
    catch (err) { app.toast(err.message, "err"); }
  });

  $("cw-save").addEventListener("click", async () => {
    if (!current.pid) return;
    try { await api.saveContestCode(current.contestId, current.pid, cwCode.value); app.toast("Đã lưu code", "ok"); }
    catch (err) { app.toast(err.message, "err"); }
  });

  $("cw-run").addEventListener("click", async () => {
    if (!current.pid) return;
    const btn = $("cw-run"); btn.disabled = true;
    setVerdict("…", null);
    cwOutput.textContent = "Đang biên dịch & chạy…";
    try {
      const r = await api.runContestProblem(current.contestId, current.pid, cwCode.value);
      setVerdict(r.verdict, r.timeMs);
      cwOutput.textContent = r.verdict === "CE"
        ? (r.stderr || "Compile error")
        : `STDOUT:\n${r.stdout || ""}${r.stderr ? `\n\nSTDERR:\n${r.stderr}` : ""}${r.diff ? `\n\nDIFF dòng ${r.diff.line}: expected "${r.diff.expected}" ≠ got "${r.diff.actual}"` : ""}`;
      refreshProblemVerdict();
    } catch (err) { cwOutput.textContent = err.message; setVerdict("READY", null); }
    finally { btn.disabled = false; }
  });

  $("cw-judge").addEventListener("click", async () => {
    if (!current.pid) return;
    const btn = $("cw-judge"); btn.disabled = true;
    setVerdict("…", null);
    cwOutput.textContent = "Đang chấm toàn bộ test…";
    try {
      const r = await api.judgeContestProblem(current.contestId, current.pid, cwCode.value);
      setVerdict(r.verdict, r.summary && r.summary.timeMs);
      if (r.verdict === "CE") {
        cwOutput.textContent = (r.compile && r.compile.stderr) || "Compile error";
      } else {
        const lines = (r.results || []).map((t) =>
          `${t.status === "AC" ? "✓" : "✗"} ${t.name} — ${t.status}${t.diff ? ` (dòng ${t.diff.line}: exp "${t.diff.expected}" ≠ "${t.diff.actual}")` : ""}`);
        cwOutput.textContent = `${r.summary.passed}/${r.summary.total} test AC\n\n${lines.join("\n")}`;
      }
      refreshProblemVerdict();
    } catch (err) { cwOutput.textContent = err.message; setVerdict("READY", null); }
    finally { btn.disabled = false; }
  });

  // After a run/judge, refresh just this problem's verdict in the side list.
  async function refreshProblemVerdict() {
    try {
      const { problem } = await api.getContestProblem(current.contestId, current.pid);
      const p = current.problems.find((x) => x.id === current.pid);
      if (p) { p.lastVerdict = problem.lastVerdict; p.status = problem.status; renderProblemList(); }
    } catch { /* non-fatal */ }
  }
}
