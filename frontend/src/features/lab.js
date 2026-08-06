// Stress Test / Sinh Test — a CP workflow rendered inside the canonical
// activity workspace. Generator receives argv[1]=seed, argv[2]=mode
// (correctness|performance) and — in exam batches — argv[3]=subtask id.
//
// Three modes:
//   • Correctness — classic Gen → Brute → Solution random hunt.
//   • Performance — near-constraint inputs, timing only.
//   • Thi đấu (exam) — the contest-realistic batch: the statement's
//     constraints are sliced into SUBTASKS (AI builds the plan + a
//     subtask-aware generator ONCE; user edits freely), the batch runs ≥100
//     tests split per subtask like a real judge, and there is deliberately NO
//     coach, NO hints, NO analysis — deriving outputs (their own brute) and
//     trusting them before submitting is entirely the student's job.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const GENERATOR_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

int main(int argc, char** argv) {
    uint32_t seed = argc > 1 ? stoul(argv[1]) : 1;
    string mode = argc > 2 ? argv[2] : "correctness";
    int subtask = argc > 3 ? atoi(argv[3]) : 0; // chỉ khác 0 ở chế độ Thi đấu
    mt19937 rng(seed);

    int n = mode == "performance" ? 200000 : uniform_int_distribution<int>(1, 12)(rng);
    cout << n << '\\n';
    for (int i = 0; i < n; ++i) {
        cout << uniform_int_distribution<int>(-20, 20)(rng) << " \\n"[i + 1 == n];
    }
}`;

const BRUTE_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // Viết lời giải chậm nhưng chắc chắn đúng cho dữ liệu nhỏ.
}`;

// Seeded into the Solution tab only when the picked problem has no saved code,
// so the stress workspace is never a dead end (a bare empty editor that fails
// the batch with "Thiếu code Solution").
const SOLUTION_STARTER = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // TODO: dán lời giải cần kiểm tra vào đây rồi Run batch để dò bug.
}`;

const DEFAULTS = Object.freeze({
  mode: "correctness",
  testCount: 100,
  seedMode: "random",
  seedStart: 1,
  timeMs: 2000,
  compareMode: "loose",
  epsilon: 0.000001
});

function key(problemId, suffix) { return `usaco.stress.${problemId}.${suffix}`; }

function readLocal(problemId, suffix, fallback) {
  try { return localStorage.getItem(key(problemId, suffix)) || fallback; }
  catch { return fallback; }
}

function writeLocal(problemId, suffix, value) {
  try { localStorage.setItem(key(problemId, suffix), String(value)); }
  catch { /* the explicit Save still keeps Solution on disk */ }
}

function readSettings(problemId) {
  try {
    const value = JSON.parse(localStorage.getItem(key(problemId, "settings")) || "null");
    return { ...DEFAULTS, ...(value && typeof value === "object" ? value : {}) };
  } catch { return { ...DEFAULTS }; }
}

function readExamPlan(problemId) {
  try {
    const value = JSON.parse(localStorage.getItem(key(problemId, "examplan")) || "null");
    return value && Array.isArray(value.subtasks) && value.subtasks.length ? value : null;
  } catch { return null; }
}

function writeExamPlan(problemId, plan) {
  try { localStorage.setItem(key(problemId, "examplan"), JSON.stringify(plan)); }
  catch { /* best effort */ }
}

function verdictOf(frame) {
  if (frame.type === "done") return frame.mode === "performance" ? "OK" : "AC";
  if (frame.type === "cancelled") return "STOPPED";
  return frame.verdict || (frame.stage === "compile" ? "CE" : "ERROR");
}

function programLabel(program) {
  return { generator: "Generator", brute: "Brute Force", solution: "Solution" }[program] || program || "Engine";
}

function progressRow(frame) {
  if (frame.type === "compile") {
    return { label: `Compile ${programLabel(frame.program)}`, status: frame.status, timeMs: frame.timeMs };
  }
  if (frame.type === "test") {
    const sub = frame.subtask ? `ST${frame.subtask.id} · ` : "";
    return { label: `${sub}Test ${frame.index} · seed ${frame.seed}`, status: frame.verdict, timeMs: frame.timings?.solutionMs };
  }
  if (frame.type === "start") {
    const label = frame.subtasks ? `Thi đấu · ${frame.subtasks.length} subtask · ${frame.testCount} test` : `${frame.mode === "performance" ? "Performance" : "Correctness"} · seed ${frame.seedStart}`;
    return { label, status: "START" };
  }
  return null;
}

// A short blockquote prepended ABOVE the real statement (never replacing it —
// a student can't stress-test a problem they can't read). Plain Markdown so
// it flows through the same parseSections/renderMarkdown pipeline as the
// statement itself — the fuller "how to use this tool" story lives in the
// rail's toolGuideHtml (activityProfile kind:"stress"), not here.
function stressBanner() {
  return `> **Stress Test:** viết **Generator** + **Brute Force** ở hai tab kế bên; app đối chiếu cả hai với **Solution** và dừng ở test đầu tiên sai. Chọn chế độ ở cột phải.`;
}

// Fallback đề when the problem being stress-tested has no saved statement.
function pipelineStatement(title) {
  return `# Stress Test / Sinh Test

**Bài đang kiểm tra:** ${title || "Bài hiện tại"}

Chưa có đề bài lưu cho bài này — mở bài trong Luyện tập và dán/tạo đề trước, rồi quay lại đây để stress test theo đúng ràng buộc thật.

Quy trình chạy độc lập: **Generator → Brute Force → Solution → so sánh output**. Hệ thống dừng ở lỗi đầu tiên để input còn nhỏ và dễ debug.`;
}

function mountControls(host, state, syncRef, problemId, examRef, actions) {
  const paint = () => {
    const plan = examRef.current;
    const isExam = state.mode === "exam";
    const planTotal = plan ? plan.subtasks.reduce((a, s) => a + (Number(s.count) || 0), 0) : 0;
    host.innerHTML = `
    <div class="aw-control-grid">
      <div class="aw-control-span aw-segment-label">Chế độ
        <div class="aw-segment aw-segment-3" data-stress-mode>
          <button type="button" data-mode="correctness">Correctness</button>
          <button type="button" data-mode="performance">Performance</button>
          <button type="button" data-mode="exam">Thi đấu</button>
        </div>
      </div>
      ${isExam ? `
      <div class="aw-control-span exam-plan">
        <div class="exam-plan-head">
          <span>Bộ test theo subtask${plan ? ` · <b>${planTotal}</b> test` : ""}</span>
          <button type="button" class="btn btn-ai btn-sm" data-exam-build>${plan ? "⟳ Dựng lại từ đề" : "⚙ Dựng khung từ đề (AI)"}</button>
        </div>
        ${plan ? `<div class="exam-plan-rows">${plan.subtasks.map((s) => `
          <div class="exam-plan-row">
            <span class="exam-plan-id">ST${s.id}</span>
            <span class="exam-plan-name" title="${escapeHtml(s.note || "")}">${escapeHtml(s.name)}${s.note ? `<i>${escapeHtml(s.note)}</i>` : ""}</span>
            <input type="number" min="1" max="500" value="${s.count}" data-exam-count="${s.id}" aria-label="Số test subtask ${s.id}">
          </div>`).join("")}</div>
        <div class="exam-plan-note">AI chỉ dựng khung sinh test — không giải, không gợi ý. Sửa generator/số test thoải mái; tối thiểu nên giữ ≥ 100 test.</div>`
        : `<div class="exam-plan-empty">Chưa có khung. Bấm "Dựng khung từ đề" — AI đọc ràng buộc trong đề và chia subtask + viết generator (1 lần duy nhất, có thể sửa tay).</div>`}
      </div>` : ""}
      <div class="aw-control-span aw-control-group">
        <div class="aw-control-group-k">Khối lượng chạy</div>
        <div class="aw-control-group-row">
          ${isExam ? "" : `<label>Số test<input data-field="testCount" type="number" min="1" max="1000"></label>`}
          <label>Time/test (ms)<input data-field="timeMs" type="number" min="100" max="10000" step="100"></label>
        </div>
      </div>
      <div class="aw-control-span aw-control-group aw-control-group-secondary">
        <div class="aw-control-group-k">Seed &amp; so sánh</div>
        <div class="aw-control-group-row">
          <label>Seed mode<select data-field="seedMode"><option value="random">Random</option><option value="fixed">Fixed</option></select></label>
          <label>Seed bắt đầu<input data-field="seedStart" type="number" min="0" max="1000000000"></label>
        </div>
        <div class="aw-control-group-row">
          <label>So sánh<select data-field="compareMode"><option value="loose">Loose</option><option value="strict">Strict</option><option value="token">Token</option><option value="float">Float</option></select></label>
          <label>Epsilon<input data-field="epsilon" type="number" min="0.000000001" step="0.000001"></label>
        </div>
      </div>
    </div>`;

    host.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        writeLocal(problemId, "settings", JSON.stringify(state));
        paint();
      });
    });
    host.querySelectorAll("[data-field]").forEach((input) => {
      input.value = state[input.dataset.field];
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        state[field] = ["testCount", "timeMs", "seedStart", "epsilon"].includes(field) ? Number(input.value) : input.value;
        writeLocal(problemId, "settings", JSON.stringify(state));
        paint();
      });
    });
    const seedStartInput = host.querySelector('[data-field="seedStart"]');
    if (seedStartInput) seedStartInput.disabled = state.seedMode !== "fixed";
    const epsilonInput = host.querySelector('[data-field="epsilon"]');
    if (epsilonInput) epsilonInput.disabled = state.compareMode !== "float";

    host.querySelectorAll("[data-exam-count]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = Number(input.dataset.examCount);
        const target = examRef.current && examRef.current.subtasks.find((s) => s.id === id);
        if (!target) return;
        target.count = Math.min(Math.max(Math.round(Number(input.value) || 1), 1), 500);
        writeExamPlan(problemId, examRef.current);
        paint();
      });
    });
    const buildButton = host.querySelector("[data-exam-build]");
    if (buildButton) buildButton.addEventListener("click", async () => {
      buildButton.disabled = true;
      buildButton.textContent = "Đang dựng khung…";
      try { await actions.buildPlan(); }
      finally { paint(); }
    });
  };
  syncRef.current = paint;
  paint();
}

export function initLab(app) {
  const trigger = document.getElementById("btn-stress");
  if (!trigger) return;

  async function openStress(problemId = app.state.currentId) {
    if (!problemId) {
      const recent = (app.state.problems || [])[0];
      if (!recent) { app.toast("Cần có ít nhất một bài để mở Sinh Test.", "err"); return; }
      problemId = recent.id;
      await app.selectProblem(problemId);
    }

    const problem = (app.state.problems || []).find((entry) => entry.id === problemId);
    const state = readSettings(problemId);
    const syncRef = { current: null };
    const examRef = { current: readExamPlan(problemId) };
    const progress = [];
    let pendingOverride = null;
    let workspaceApi = null;

    const [codeRes, statementRes, inputRes, expectedRes, testsRes] = await Promise.all([
      api.getCode(problemId),
      api.getStatement(problemId).catch(() => ({ statement: "" })),
      api.getInput(problemId).catch(() => ({ input: "" })),
      api.getExpected(problemId).catch(() => ({ expected: "" })),
      api.listTests(problemId).catch(() => ({ tests: [] }))
    ]);
    // Stress-testing a problem with no solution is a dead end: the batch used
    // to fail with a cryptic "Thiếu code Solution" from the backend. When the
    // problem has no saved code, seed the Solution tab with a clearly-labelled
    // starter so the tool is always usable and the guidance is human.
    const savedCode = codeRes.code || app.getEditorValue() || "";
    const hasSolution = Boolean(savedCode.trim());
    const solutionCode = hasSolution ? savedCode : SOLUTION_STARTER;
    if (!hasSolution) {
      app.toast("Bài này chưa có lời giải — viết vào tab Solution rồi Run batch để dò bug.", "info");
    }
    const realStatement = (statementRes.statement || "").trim();

    const buildPlan = async () => {
      try {
        const plan = await api.examPlan(problemId, realStatement);
        examRef.current = { subtasks: plan.subtasks };
        writeExamPlan(problemId, examRef.current);
        if (plan.generatorCode && plan.generatorCode.trim()) {
          workspaceApi?.setEditorValue("generator", plan.generatorCode);
          writeLocal(problemId, "generator", plan.generatorCode);
        }
        app.toast(`Đã dựng ${plan.subtasks.length} subtask · ${plan.subtasks.reduce((a, s) => a + s.count, 0)} test. Kiểm tra generator rồi Run batch.`, "ok");
      } catch (error) {
        if (error && error.aborted) return;
        if (error && error.data && error.data.code === "NO_KEY") app.toast("Cần API key (Settings → AI) để dựng khung test.", "err");
        else app.toast((error && error.message) || "Không dựng được khung test.", "err");
      }
    };

    const runBatch = async ({ editors, signal }, single) => {
      const override = pendingOverride;
      pendingOverride = null;
      progress.length = 0;
      const isExam = state.mode === "exam";
      if (isExam && !single && !examRef.current) {
        throw new Error("Chế độ Thi đấu cần khung subtask — bấm \"Dựng khung từ đề\" trước.");
      }
      const request = {
        mode: isExam ? "correctness" : state.mode,
        generatorCode: editors.generator,
        bruteCode: editors.brute,
        solutionCode: editors.solution,
        testCount: single ? 1 : state.testCount,
        seedMode: state.seedMode,
        seedStart: state.seedMode === "fixed" ? state.seedStart : undefined,
        timeMs: state.timeMs,
        compareMode: state.compareMode,
        epsilon: state.epsilon,
        ...(isExam && !single ? {
          subtasks: examRef.current.subtasks.map((s) => ({ id: s.id, name: s.name, count: s.count })),
          budgetMs: 240000,
          // A real judge's test set is a FIXED artifact — exam batches default
          // to deterministic seeds so run #2 grades the same bộ test as run #1.
          seedMode: "fixed",
          seedStart: Number.isFinite(Number(state.seedStart)) ? Number(state.seedStart) : 1
        } : {}),
        ...(isExam && single ? { subtasks: [{ id: (examRef.current?.subtasks[0]?.id) || 1, name: "thử nhanh", count: 1 }] } : {}),
        ...override
      };
      const terminal = await api.stressStream(problemId, request, {
        signal,
        onEvent(frame) {
          const row = progressRow(frame);
          if (row) progress.push(row);
          if (!frame.done) workspaceApi?.setProgress({
            verdict: frame.type === "test" ? frame.verdict : "RUNNING",
            summary: frame.type === "test"
              ? `Đã kiểm tra ${frame.index}/${request.subtasks ? request.subtasks.reduce((a, s) => a + s.count, 0) : request.testCount}${frame.subtask ? ` · đang ở ST${frame.subtask.id}` : ""}`
              : "Đang biên dịch ba chương trình…",
            frames: progress
          });
        }
      });
      return normalizeResult(terminal, request);
    };

    const copyInput = async (input) => {
      await navigator.clipboard.writeText(input || "");
      app.toast("Đã copy input gây lỗi.", "ok");
    };
    const runAsCustom = async (input) => {
      await api.saveInput(problemId, input || "");
      app.activityWorkspace.close({ notify: false });
      await app.selectProblem(problemId);
      app.el.ioInput.value = input || "";
      app.state.savedInput = input || "";
      app.setTab("run");
      app.toast("Đã chuyển input lỗi sang Custom Test.", "ok");
    };
    const rerun = (override) => {
      pendingOverride = override;
      workspaceApi.execute("judge");
    };

    const normalizeResult = (terminal, request) => {
      const verdict = verdictOf(terminal);
      const timings = terminal.timings || {};
      const timingLine = terminal.type === "failure"
        ? `${terminal.subtask ? `Subtask ${terminal.subtask.id} · ` : ""}Test ${terminal.index ?? "—"} · seed ${terminal.seed ?? "—"} · Generator ${Math.round(timings.generatorMs || 0)} ms · Brute ${Math.round(timings.bruteMs || 0)} ms · Solution ${Math.round(timings.solutionMs || 0)} ms`
        : "";
      // Exam batches: the per-subtask scoreboard replaces the raw 100-row log.
      const results = Array.isArray(terminal.perSubtask) && terminal.perSubtask.length
        ? terminal.perSubtask.map((s) => ({
            name: `Subtask ${s.id} — ${s.name}`,
            status: s.ran > 0 && s.passed === s.ran && s.ran === s.total ? "AC" : (s.ran === 0 ? "—" : (s.passed < s.ran ? "WA" : `${s.passed}/${s.total}`)),
            timeMs: undefined
          }))
        : progress.filter((row) => row.label.includes("Test ")).map((row) => ({
            name: row.label,
            status: row.status,
            timeMs: row.timeMs
          }));
      if (terminal.type === "failure") {
        results.push({
          name: `${terminal.subtask ? `ST${terminal.subtask.id} · ` : ""}Test ${terminal.index} · seed ${terminal.seed}`,
          status: verdict,
          timeMs: terminal.timings?.solutionMs,
          input: terminal.input,
          expected: terminal.expected,
          actual: terminal.actual,
          diff: terminal.diff
        });
      }
      const failedSubtask = terminal.subtask ? [{ id: terminal.subtask.id, name: terminal.subtask.name, count: 1 }] : undefined;
      const actions = terminal.type === "failure" ? [
        { label: "Replay same test", primary: true, onClick: () => rerun({ seedMode: "fixed", seedStart: terminal.seed, testCount: 1, ...(failedSubtask ? { subtasks: failedSubtask } : {}) }) },
        { label: "Copy input", onClick: () => copyInput(terminal.input) },
        { label: "Run as custom test", onClick: () => runAsCustom(terminal.input) },
        { label: "Continue", onClick: () => rerun({ seedMode: "fixed", seedStart: terminal.nextSeed, testCount: Math.max(1, request.testCount - terminal.attempted) }) },
        { label: "New seed", onClick: () => rerun({ seedMode: "random", seedStart: undefined }) }
      ] : [
        { label: "New seed", primary: true, onClick: () => rerun({ seedMode: "random", seedStart: undefined }) }
      ];
      const performance = terminal.performanceSummary;
      const examDone = terminal.type === "done" && Array.isArray(terminal.perSubtask) && terminal.perSubtask.length;
      const genOverflow = terminal.program === "generator" && /Output limit exceeded/i.test(
        (terminal.generator && terminal.generator.stderr) || terminal.error || ""
      );
      return {
        verdict,
        message: terminal.type === "done"
          ? (examDone
              ? `${terminal.attempted} test · ${terminal.perSubtask.length} subtask đều sạch — bộ test cỡ thi thật đã qua.`
              : (terminal.mode === "performance"
                  ? `${terminal.attempted} test · avg ${Math.round(performance?.averageMs || 0)} ms · max ${Math.round(performance?.maxMs || 0)} ms`
                  : `${terminal.attempted} test đều AC · seed ${terminal.seedStart}–${terminal.seedEnd}`))
          : `${programLabel(terminal.program)} · ${terminal.stage || "run"} · seed ${terminal.seed ?? "—"}`,
        feedback: [
          genOverflow ? "Generator in quá 1MB — vào tab Generator, hạ N của subtask này xuống (≤ ~5000): bộ luyện cần Brute còn chạy nổi, độ phủ nằm ở cấu trúc chứ không phải kích thước." : "",
          timingLine,
          terminal.runnerIsolation === "local-process" ? "Runner local-process có giới hạn thời gian; không phải container bảo mật." : ""
        ].filter(Boolean).join(" · "),
        results,
        stderr: [
          terminal.generator?.stderr ? `[Generator]\n${terminal.generator.stderr}` : "",
          terminal.brute?.stderr ? `[Brute Force]\n${terminal.brute.stderr}` : "",
          terminal.solution?.stderr ? `[Solution]\n${terminal.solution.stderr}` : "",
          terminal.error || ""
        ].filter(Boolean).join("\n\n"),
        diff: terminal.diff,
        actions
      };
    };

    await app.activityWorkspace.open({
      kind: "stress",
      kicker: "Kỹ năng thi đấu",
      title: "Stress Test / Sinh Test",
      // Stress applies to a problem the user picks — the source dialog is the
      // right tool here (and only here; rush/corefill/contest own their feed).
      sourceSwitch: true,
      // The actual đề bài is the primary reading surface (a student can't
      // stress-test a problem they can't read) — a collapsed banner above it
      // explains the TOOL, and the rail's toolGuideHtml explains the controls.
      statement: stressBanner() + "\n\n" + (realStatement || pipelineStatement(problem?.title)),
      samples: (testsRes.tests || []).slice(0, 2).map((test) => ({ input: test.input || "", output: test.expected || "" })),
      sheetMeta: {
        title: problem?.title || "Stress Test / Sinh Test",
        topic: (app.state.meta && app.state.meta.topic) || "",
        kicker: "SINH TEST · STRESS"
      },
      status: [
        { label: "Bài", value: problem?.title || problemId, tone: "accent" },
        { label: "Pipeline", value: "Gen → Brute → Solution" },
        { label: "Seed", value: "replayable", tone: "success" }
      ],
      runLabel: "Run",
      judgeLabel: "Run batch",
      input: inputRes.input || "",
      expected: expectedRes.expected || "",
      expectedEnabled: true,
      editors: [
        { id: "solution", label: "Solution", fileName: "solution.cpp", code: solutionCode, taskNote: "Lời giải tối ưu", saveCode: (code) => api.saveCode(problemId, code) },
        { id: "brute", label: "Brute Force", fileName: "brute.cpp", code: readLocal(problemId, "brute", BRUTE_TEMPLATE), taskNote: "Đúng chắc với dữ liệu nhỏ", saveCode: (code) => writeLocal(problemId, "brute", code) },
        { id: "generator", label: "Generator", fileName: "generator.cpp", code: readLocal(problemId, "generator", GENERATOR_TEMPLATE), taskNote: "mt19937 · argv seed/mode/subtask", saveCode: (code) => writeLocal(problemId, "generator", code) }
      ],
      mountControls: (host, apiRef) => { workspaceApi = apiRef; mountControls(host, state, syncRef, problemId, examRef, { buildPlan }); },
      saveInput: (input) => api.saveInput(problemId, input),
      saveExpected: (expected) => api.saveExpected(problemId, expected),
      // A populated STDIN is a real one-off solution run. Leaving it empty
      // keeps the stress-tool's expected quick check: Generator → Brute → Solution.
      run: (context) => String(context.input || "").trim()
        ? api.run(problemId, context.editors.solution, { signal: context.signal })
        : runBatch(context, true),
      judge: (context) => runBatch(context, false)
    });
  }

  app.openStress = openStress;
  trigger.addEventListener("click", () => openStress().catch((error) => {
    app.toast(error.message || "Không mở được Sinh Test.", "err");
  }));
}
