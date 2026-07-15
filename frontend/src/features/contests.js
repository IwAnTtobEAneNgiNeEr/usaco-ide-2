// Contest Hub/Create owns only choosing and generating a practice set.
// Coding a contest problem always happens in the canonical Activity Workspace;
// this module never creates a second editor, runner, or statement renderer.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const PRESET_TOPICS = [
  "Greedy", "DP", "Graph", "Tree", "Math", "Binary Search", "Two Pointers",
  "Prefix Sum", "Sorting", "Strings", "Number Theory", "Bitmask", "DSU",
  "Stack", "Queue", "Recursion", "Backtracking", "Sliding Window", "Simulation", "Geometry"
];

function relDate(iso) {
  const date = new Date(iso || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("vi-VN");
}

function buildOverlay() {
  const existing = document.getElementById("contests-overlay");
  if (existing) return existing;
  const overlay = document.createElement("section");
  overlay.id = "contests-overlay";
  overlay.className = "contest-overlay hidden";
  overlay.setAttribute("aria-label", "Luyện tập theo bộ đề");
  overlay.innerHTML = `
    <div class="contest-shell">
      <header class="contest-bar">
        <div class="contest-brand"><span class="contest-brand-mark">‹/›</span><span>USACO IDE <b>2.0</b></span></div>
        <button id="contest-back" class="btn btn-ghost btn-sm hidden" type="button">← Danh sách</button>
        <span class="contest-bar-title">Luyện tập theo bộ đề</span>
        <span class="contest-bar-spacer"></span>
        <button id="contest-new-btn" class="btn btn-primary btn-sm" type="button">+ Tạo bộ đề</button>
        <button id="contest-close" class="btn btn-ghost btn-sm" type="button">× Đóng</button>
      </header>

      <div class="contest-screen" id="contest-hub">
        <div class="contest-hub-head">
          <input id="contest-topic-filter" class="input" type="search" placeholder="Lọc bộ đề theo chủ đề…" autocomplete="off" />
        </div>
        <div id="contest-list" class="contest-cards"></div>
      </div>

      <div class="contest-screen hidden" id="contest-create">
        <div class="contest-create-card">
          <h2 class="contest-h2">Tạo bộ đề mới</h2>
          <p class="panel-hint">Tạo 5–7 bài mới cùng chủ đề, độ khó tăng dần dưới 2000 Elo, kèm test đã kiểm tra. App dùng bài cũ để đo trình độ, không sao chép đề.</p>
          <label class="cc-label">Chủ đề
            <select id="cc-topic" class="select"></select>
          </label>
          <div id="cc-readiness" class="cc-readiness"></div>
          <div class="cc-grid">
            <label class="cc-label">Số bài
              <select id="cc-count" class="select"><option value="5">5 bài</option><option value="6" selected>6 bài</option><option value="7">7 bài</option></select>
            </label>
            <label class="cc-label">Elo nhỏ nhất<input id="cc-min" class="input" type="number" min="800" max="1950" step="50" value="800" /></label>
            <label class="cc-label">Elo lớn nhất<input id="cc-max" class="input" type="number" min="800" max="1950" step="50" value="1800" /></label>
          </div>
          <label class="cc-force"><input type="checkbox" id="cc-force" /> Tạo dù dữ liệu chủ đề còn ít</label>
          <div class="cc-actions"><button id="cc-generate" class="btn btn-primary" type="button">Tạo bộ đề</button></div>
          <div id="cc-status" class="cc-status" aria-live="polite"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initContests(app) {
  const trigger = document.getElementById("btn-contests");
  if (!trigger) return;
  const overlay = buildOverlay();
  const $ = (id) => overlay.querySelector(`#${id}`);
  const hub = $("contest-hub");
  const create = $("contest-create");
  const back = $("contest-back");
  const newButton = $("contest-new-btn");
  const list = $("contest-list");
  const filter = $("contest-topic-filter");
  const topic = $("cc-topic");
  const count = $("cc-count");
  const minRating = $("cc-min");
  const maxRating = $("cc-max");
  const force = $("cc-force");
  const readiness = $("cc-readiness");
  const status = $("cc-status");
  const generate = $("cc-generate");
  let contests = [];
  let generationAbort = null;

  function show(screen) {
    const isHub = screen === "hub";
    hub.classList.toggle("hidden", !isHub);
    create.classList.toggle("hidden", isHub);
    back.classList.toggle("hidden", isHub);
    newButton.classList.toggle("hidden", !isHub);
  }

  function close() { overlay.classList.add("hidden"); }

  async function open() {
    overlay.classList.remove("hidden");
    show("hub");
    await loadHub();
  }
  app.openContests = open;
  trigger.addEventListener("click", open);
  $("contest-close").addEventListener("click", close);
  back.addEventListener("click", () => show("hub"));
  newButton.addEventListener("click", openCreate);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (generationAbort) generationAbort.abort();
      else close();
    }
  });

  function renderHub() {
    const query = filter.value.trim().toLocaleLowerCase("vi");
    const visible = contests.filter((item) => !query || `${item.title} ${item.topic}`.toLocaleLowerCase("vi").includes(query));
    if (!visible.length) {
      list.innerHTML = `<div class="contest-empty">${contests.length ? "Không có bộ đề khớp bộ lọc." : "Chưa có bộ đề. Tạo một bộ theo chủ đề em đang luyện để bắt đầu."}</div>`;
      return;
    }
    list.innerHTML = visible.map((item) => {
      const progress = item.problemCount ? Math.round((item.solvedCount / item.problemCount) * 100) : 0;
      const label = { not_started: "Chưa bắt đầu", in_progress: "Đang làm", completed: "Hoàn thành" }[item.status] || item.status;
      return `<article class="contest-card" data-cid="${escapeHtml(item.id)}">
        <div class="contest-card-top"><span class="contest-card-title">${escapeHtml(item.title)}</span><span class="contest-chip contest-status-${escapeHtml(item.status)}">${escapeHtml(label)}</span></div>
        <div class="contest-card-sub"><span class="contest-tag">${escapeHtml(item.topic || "Tổng hợp")}</span><span class="p-dot"></span><span>${item.problemCount} bài</span><span class="p-dot"></span><span>${item.targetRatingStart}–${item.targetRatingEnd} Elo</span><span class="p-dot"></span><span>${relDate(item.createdAt)}</span></div>
        <div class="contest-progress"><div class="contest-progress-bar" style="width:${progress}%"></div></div>
        <div class="contest-card-foot"><span class="muted">${item.solvedCount}/${item.problemCount} AC</span><span class="toolbar-spacer"></span><button class="btn btn-ghost btn-sm" data-act="open" type="button">Mở bộ đề</button><button class="icon-btn" data-act="delete" type="button" title="Xóa bộ đề">×</button></div>
      </article>`;
    }).join("");
  }

  async function loadHub() {
    list.innerHTML = `<div class="contest-empty"><span class="spinner"></span> Đang tải bộ đề…</div>`;
    try {
      const response = await api.listContests();
      contests = response.contests || [];
      renderHub();
    } catch (error) {
      list.innerHTML = `<div class="contest-empty mk-bad">${escapeHtml(error.message)}</div>`;
    }
  }

  filter.addEventListener("input", renderHub);
  list.addEventListener("click", async (event) => {
    const card = event.target.closest(".contest-card");
    const action = event.target.closest("[data-act]")?.dataset.act;
    if (!card || !action) return;
    if (action === "delete") {
      const item = contests.find((entry) => entry.id === card.dataset.cid);
      if (!confirm(`Xóa bộ đề “${item ? item.title : card.dataset.cid}”? Toàn bộ bài làm trong bộ sẽ bị xóa.`)) return;
      try { await api.deleteContest(card.dataset.cid); await loadHub(); app.toast("Đã xóa bộ đề", "ok"); }
      catch (error) { app.toast(error.message, "err"); }
      return;
    }
    await openContest(card.dataset.cid);
  });

  function fillTopics(preferred) {
    const fromProblems = (app.state.problems || []).flatMap((item) => [item.topic, ...(item.tags || [])]).filter(Boolean);
    const values = [...new Set([...PRESET_TOPICS, ...fromProblems])].sort((a, b) => a.localeCompare(b, "vi"));
    topic.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if (preferred && values.includes(preferred)) topic.value = preferred;
  }

  async function refreshReadiness() {
    readiness.innerHTML = `<div class="cc-ready"><span class="spinner"></span> Đang đọc lịch sử chủ đề…</div>`;
    try {
      const response = await api.contestReadiness(topic.value);
      const enough = response.ready;
      readiness.innerHTML = `<div class="cc-ready ${enough ? "cc-ready-ok" : "cc-ready-warn"}"><b>${response.eligibleCount}</b> bài cùng chủ đề trong lịch sử · ${enough ? "đủ dữ liệu để cá nhân hóa" : `nên có ít nhất ${response.minEligible}`}</div>`;
      count.value = String(response.recommendedProblemCount || 6);
      minRating.value = String(response.ratingMin || 800);
      maxRating.value = String(Math.min(response.ratingMax || 1800, 1950));
    } catch (error) {
      readiness.innerHTML = `<div class="cc-ready mk-bad">${escapeHtml(error.message)}</div>`;
    }
  }

  function openCreate() {
    status.innerHTML = "";
    fillTopics(app.state.meta && app.state.meta.topic);
    show("create");
    refreshReadiness();
  }
  topic.addEventListener("change", refreshReadiness);

  generate.addEventListener("click", async () => {
    if (generationAbort) { generationAbort.abort(); return; }
    generationAbort = new AbortController();
    const original = generate.textContent;
    generate.textContent = "■ Dừng";
    generate.classList.add("btn-stop");
    status.innerHTML = `<div class="cc-loading"><span class="spinner"></span> Đang tạo và kiểm tra ${count.value} bài. Có thể mất 1–2 phút.</div>`;
    try {
      const response = await api.generateContest({
        topic: topic.value,
        problemCount: Number(count.value),
        minRating: Number(minRating.value) || 800,
        maxRating: Math.min(Number(maxRating.value) || 1800, 1950),
        force: force.checked
      }, { signal: generationAbort.signal });
      app.toast("Đã tạo bộ đề", "ok");
      await openContest(response.contest.id);
    } catch (error) {
      if (error && error.aborted) status.innerHTML = `<div class="cc-ready">Đã dừng tạo bộ đề.</div>`;
      else status.innerHTML = `<div class="cc-ready mk-bad">${escapeHtml(error.message)}</div>`;
    } finally {
      generationAbort = null;
      generate.textContent = original;
      generate.classList.remove("btn-stop");
    }
  });

  async function openContest(contestId, preferredProblemId) {
    if (!app.activityWorkspace) { app.toast("Coding workspace chưa sẵn sàng.", "err"); return; }
    close();
    app.activityWorkspace.openLoading({ kind: "contest", kicker: "Bộ đề", title: "Đang mở contest", message: "Đang tải đề, code và test đã kiểm tra." });
    try {
      const response = await api.getContest(contestId);
      const problems = response.problems || [];
      if (!problems.length) throw new Error("Bộ đề chưa có bài nào.");
      const index = Math.max(0, problems.findIndex((item) => item.id === preferredProblemId));
      await openContestProblem(response.contest, problems, index < 0 ? 0 : index);
    } catch (error) {
      app.activityWorkspace.showError({ kind: "contest", kicker: "Bộ đề", title: "Không mở được bộ đề", message: error.message, retry: () => openContest(contestId) });
    }
  }

  async function openContestProblem(contest, problems, index) {
    const problem = problems[index];
    const cid = contest.id;
    const pid = problem.id;
    const [{ statement }, { code }, { input }, { expected }, { tests }] = await Promise.all([
      api.getContestStatement(cid, pid), api.getContestCode(cid, pid), api.getContestInput(cid, pid),
      api.getContestExpected(cid, pid), api.listContestTests(cid, pid)
    ]);
    const samples = (Array.isArray(tests) ? tests : [])
      .map((test) => ({
        input: test.input || test.stdin || "",
        output: test.expected || test.output || test.stdout || ""
      }))
      .filter((sample) => String(sample.input).trim() || String(sample.output).trim())
      .slice(0, 2);
    const config = {
      kind: "contest",
      kicker: contest.title,
      title: `${pid} · ${problem.title}`,
      statement,
      samples,
      sheetMeta: { title: problem.title, elo: problem.rating, topic: contest.topic, kicker: `BỘ ĐỀ · BÀI ${index + 1}/${problems.length}` },
      code,
      input,
      expected,
      expectedEnabled: true,
      fileName: "main.cpp",
      runLabel: "Run",
      judgeLabel: "Submit",
      taskNote: `Bài ${index + 1}/${problems.length} · ${problem.rating} Elo`,
      status: [
        { label: "Tiến độ", value: `${index + 1}/${problems.length}`, tone: "accent" },
        { label: "Chủ đề", value: contest.topic },
        { label: "Elo", value: problem.rating },
        { label: "Trạng thái", value: problem.lastVerdict || "Chưa chấm", tone: problem.lastVerdict === "AC" ? "success" : "" }
      ],
      headerActions: [
        { label: "← Bộ đề", onClick: () => { app.activityWorkspace.close({ notify: false }); open(); } },
        { label: "← Bài trước", disabled: index === 0, onClick: () => openContestProblem(contest, problems, index - 1) },
        { label: "Bài sau →", disabled: index === problems.length - 1, onClick: () => openContestProblem(contest, problems, index + 1) }
      ],
      saveCode: (next) => api.saveContestCode(cid, pid, next),
      saveInput: (next) => api.saveContestInput(cid, pid, next),
      saveExpected: (next) => api.saveContestExpected(cid, pid, next),
      run: ({ code: source, signal }) => api.runContestProblem(cid, pid, source, { signal }),
      judge: async ({ code: source, signal }) => {
        const result = await api.judgeContestProblem(cid, pid, source, undefined, { signal });
        if (result.verdict === "AC" && index < problems.length - 1) {
          result.followup = { label: "Bài tiếp theo", onClick: () => openContestProblem(contest, problems, index + 1) };
        }
        return result;
      },
      onResult: async () => {
        try {
          const response = await api.getContestProblem(cid, pid);
          Object.assign(problem, response.problem || {});
        } catch { /* progress refresh is non-critical */ }
      }
    };
    if (app.activityWorkspace.isOpen) await app.activityWorkspace.replace(config);
    else await app.activityWorkspace.open(config);
  }
}
