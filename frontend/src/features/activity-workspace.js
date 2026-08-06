// activity-workspace.js — the single coding surface for code-bearing practice
// activities that are not normal ProblemStore problems.
//
// Core Fill, Rush, and Contest provide only data + run/judge adapters. This
// module exclusively owns their primary C++ editor, statement rendering,
// shortcuts, save state, and result console. Keeping one surface prevents the
// three activities from drifting away from the normal IDE interaction contract.

import { renderMarkdown, renderMath, escapeHtml } from "../md.js";
import { buildStatementSheetHtml, highlightTokens } from "../statement.js";
import { api } from "../api.js";

const CM_BUNDLE = "../../vendor/codemirror/codemirror.js";
const SAVE_DELAY_MS = 700;

export const ACTIVITY_WORKSPACE_CONTRACT = Object.freeze({
  primaryEditor: "codemirror",
  supportsMultipleEditors: true,
  shortcuts: Object.freeze({ run: "Ctrl+Enter", judge: "Ctrl+Shift+Enter", close: "Escape" }),
  requiredAdapters: Object.freeze(["run", "judge"])
});

function knownVerdict(v) {
  return ["AC", "WA", "RE", "TLE", "CE", "MLE"].includes(String(v || "").toUpperCase());
}

export function activityVerdictClass(verdict) {
  const v = String(verdict || "").toUpperCase();
  if (knownVerdict(v)) return `v-${v}`;
  return v === "OK" ? "aw-v-ok" : "verdict-idle";
}

export function activityDiffLabel(diff) {
  if (!diff) return "";
  const line = diff.line != null ? `dòng ${diff.line}` : "khác output";
  const expected = diff.expected != null ? String(diff.expected) : "";
  const actual = diff.actual != null ? String(diff.actual) : "";
  return `${line}: expected “${expected}” · actual “${actual}”`;
}

async function mountActivityEditor(host, initialValue, onChange, { readOnly = false } = {}) {
  const CM = await import(CM_BUNDLE);
  const theme = CM.EditorView.theme({
    "&": { height: "100%", fontSize: "var(--code-fs)", backgroundColor: "transparent", color: "var(--code-fg)" },
    // Keep the activity editor on the exact same appearance contract as the
    // normal editor. Font family alone is not enough: weight and tracking are
    // user-configurable in Editor Appearance too.
    ".cm-scroller": {
      fontFamily: "var(--code-font)", lineHeight: "var(--code-lh)",
      letterSpacing: "var(--code-letter-spacing)", fontWeight: "var(--code-weight)", overflow: "auto"
    },
    ".cm-content": { padding: "12px 4px", caretColor: "var(--ed-cursor)" },
    ".cm-gutters": { backgroundColor: "var(--ed-gutter-bg)", color: "var(--ed-gutter-fg)", border: "none", borderRight: "1px solid var(--border-soft)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--ed-active-gutter)", color: "var(--accent)" },
    ".cm-activeLine": { backgroundColor: "var(--ed-line-highlight)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ed-cursor)" },
    "&.cm-focused": { outline: "none" }
  }, { dark: true });

  const highlight = CM.HighlightStyle.define([
    { tag: CM.t.keyword, color: "var(--syn-kw)" },
    { tag: CM.t.controlKeyword, color: "var(--syn-ctrl)" },
    { tag: CM.t.typeName, color: "var(--syn-type)" },
    { tag: CM.t.number, color: "var(--syn-num)" },
    { tag: CM.t.string, color: "var(--syn-str)" },
    { tag: CM.t.comment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.lineComment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.blockComment, color: "var(--syn-cmt)", fontStyle: "italic" },
    { tag: CM.t.function(CM.t.variableName), color: "var(--syn-fn)" },
    { tag: CM.t.variableName, color: "var(--syn-var)" },
    { tag: CM.t.bool, color: "var(--syn-bool)" },
    { tag: CM.t.meta, color: "var(--syn-meta)" },
    { tag: CM.t.macroName, color: "var(--syn-meta)" },
    { tag: CM.t.operator, color: "var(--syn-operator)" }
  ]);

  const state = CM.EditorState.create({
    doc: initialValue || "",
    extensions: [
      CM.lineNumbers(),
      CM.highlightActiveLineGutter(),
      CM.history(),
      CM.drawSelection(),
      CM.indentOnInput(),
      CM.bracketMatching(),
      CM.closeBrackets(),
      CM.highlightActiveLine(),
      CM.syntaxHighlighting(highlight, { fallback: true }),
      CM.cpp(),
      // Activity-workspace editors have no wrap-toggle control (unlike the
      // main IDE, which exposes one) and their column is narrower — a long
      // line here needs a horizontal scrollbar to even be seen. Wrap by
      // default so nothing requires scrolling sideways to read.
      CM.EditorView.lineWrapping,
      CM.keymap.of([CM.indentWithTab, ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.historyKeymap]),
      CM.EditorView.updateListener.of((update) => {
        if (update.docChanged && typeof onChange === "function") onChange(update.state.doc.toString());
      }),
      // Contract files (.hpp, tests) mount read-only: the student edits the
      // implementation, never the spec the verifier judges against.
      ...(readOnly ? [CM.EditorState.readOnly.of(true), CM.EditorView.editable.of(false)] : []),
      theme
    ]
  });
  const view = new CM.EditorView({ state, parent: host });
  return {
    getValue: () => view.state.doc.toString(),
    setValue: (value) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(value || "") } }),
    focus: () => view.focus(),
    selectRange: (from, to) => view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }),
    destroy: () => view.destroy()
  };
}

function normalizeEditors(config) {
  const raw = Array.isArray(config.editors) && config.editors.length
    ? config.editors
    : [{
        id: "main",
        fileName: config.fileName || "main.cpp",
        label: config.fileName || "main.cpp",
        code: config.code || "",
        taskNote: config.taskNote || "",
        saveCode: config.saveCode
      }];
  const seen = new Set();
  return raw.map((item, index) => {
    const base = String((item && item.id) || `editor-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
    let id = base || `editor-${index + 1}`;
    while (seen.has(id)) id += "-copy";
    seen.add(id);
    return {
      id,
      fileName: String((item && (item.fileName || item.label)) || `${id}.cpp`),
      label: String((item && (item.label || item.fileName)) || `${id}.cpp`),
      shortLabel: String((item && item.shortLabel) || ""),
      code: String((item && item.code) || ""),
      taskNote: String((item && item.taskNote) || ""),
      saveCode: item && item.saveCode,
      readOnly: Boolean(item && item.readOnly)
    };
  });
}

function statusHtml(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const tone = item && item.tone ? ` data-tone="${escapeHtml(item.tone)}"` : "";
    return `<span class="aw-status-item"${tone}><span>${escapeHtml(item.label || "")}</span><b>${escapeHtml(item.value == null ? "" : String(item.value))}</b></span>`;
  }).join("");
}

function outputBlock(label, value, className = "") {
  if (!String(value || "").trim()) return "";
  return `<section class="aw-output-block ${className}"><div class="aw-output-label">${escapeHtml(label)}</div><pre>${escapeHtml(String(value))}</pre></section>`;
}

function statementHasExamples(statement) {
  const text = String(statement || "");
  return /(^|\n)\s*(#{1,6}\s*)?(ví\s*dụ|vi\s*du|example|examples|sample|samples|test\s+ví\s*dụ|test\s+vi\s+du)\b/i.test(text);
}

function normalizeSamples(config = {}) {
  const raw = Array.isArray(config.samples) ? config.samples : [];
  const samples = raw.map((sample) => ({
    input: sample && (sample.input ?? sample.stdin ?? sample.in),
    output: sample && (sample.output ?? sample.expected ?? sample.stdout ?? sample.out)
  })).filter((sample) => String(sample.input ?? "").trim() || String(sample.output ?? "").trim());
  if (!samples.length && (String(config.input || "").trim() || String(config.expected || "").trim())) {
    samples.push({ input: config.input || "", output: config.expected || "" });
  }
  return samples.slice(0, 3);
}

function statementWithSamples(config = {}) {
  const statement = String(config.statement || "");
  const samples = normalizeSamples(config);
  if (!samples.length || statementHasExamples(statement)) return statement;
  const body = samples.map((sample, index) => {
    const n = String(index + 1).padStart(2, "0");
    return `Input ${n}\n${String(sample.input || "").trim() || "—"}\n\nOutput ${n}\n${String(sample.output || "").trim() || "—"}`;
  }).join("\n\n");
  return `${statement.trim()}\n\n## Ví dụ\n\n${body}`;
}

function sourceTitle(statement) {
  const heading = String(statement || "").match(/^#{1,2}\s+(.+)$/m);
  return heading ? heading[1].replace(/[*_`]/g, "").trim().slice(0, 120) : "Bài mới từ đề dán";
}

function activityProfile(config = {}) {
  const kind = String(config.kind || "activity");
  if (kind === "corefill") return {
    label: "ĐIỀN LÕI",
    title: "Điền đúng phần lõi còn thiếu",
    body: "Các đoạn còn thiếu được khoanh trong code. Bấm một đoạn ở rail bên phải để nhảy tới đúng dòng.",
    guideRows: [["01", "Chọn đoạn lõi", "Bấm hàng TODO ở rail phải để nhảy tới vị trí cần điền."], ["02", "Giữ nguyên khung", "Không đổi input/output; chỉ thay phần marker TODO."], ["03", "Kiểm tra ẩn", "Run thử input riêng, Judge để chấm toàn bộ test đã xác minh."]],
    railTitle: "Bảng đoạn lõi",
    railBody: "Theo dõi đoạn nào đã điền và nhảy tới đúng TODO.",
    readyRows: [["Đoạn TODO", "Bấm để nhảy"], ["Input riêng", "Run không tính"], ["Test ẩn", "Judge để kiểm tra"]],
    readyText: "Ví dụ: chọn TODO [01], hoàn thiện một đoạn nhỏ, dán case mẫu vào STDIN rồi Run trước khi Judge."
  };
  if (kind === "rush") return {
    label: "DEBUG TỐC ĐỘ",
    title: "Săn đúng một lỗi logic",
    body: "Mục tiêu là tìm bug trong chương trình đã biên dịch được mà không lộ đáp án trước khi em tự sửa.",
    guideRows: [["01", "Run miễn phí", "Thử input riêng để khoanh vùng; Run không trừ mạng."], ["02", "Gợi ý có chủ đích", "Gợi ý 1 khoanh vùng miễn phí, gợi ý 2 gọi tên kỹ thuật và trừ điểm."], ["03", "Judge quyết định", "Sai mất một mạng nhưng giữ nguyên bài và đồng hồ để sửa tiếp."]],
    railTitle: "Bảng săn bug",
    railBody: "Dùng hint khi bí, nhưng lỗi cụ thể chỉ lộ khi lượt kết thúc.",
    readyRows: [["Run", "Không trừ mạng"], ["Hint", "Khoanh vùng / kỹ thuật"], ["Judge", "Sửa đúng để qua bài"]],
    readyText: "Ví dụ: đặt một case biên vào STDIN, Run để quan sát sai lệch; Hint chỉ dùng khi đã có giả thuyết."
  };
  if (kind === "stress") return {
    label: "SINH TEST · STRESS",
    title: "Bắt test làm lộ sai khác",
    body: "Tool chạy đúng pipeline Generator → Brute → Solution. Em chỉnh ba file ở các tab phía trên.",
    guideRows: [["01", "Viết Generator", "Sinh input nhỏ, đa dạng; argv[1] là seed để replay."], ["02", "Viết Brute", "Lời giải chậm nhưng chắc chắn đúng trên dữ liệu nhỏ."], ["03", "Đọc seed lỗi", "Replay seed cố định, copy input hoặc chuyển sang Custom Test."]],
    railTitle: "Bảng stress test",
    railBody: "Chọn mode, seed và số test ở các control phía trên rail.",
    readyRows: [["Correctness", "Gen + Brute + Solution"], ["Performance", "Gen + Solution"], ["Thi đấu", "Batch theo subtask"]],
    readyText: "Ví dụ: để STDIN trống rồi Run để kiểm tra một seed; dán STDIN để chạy riêng Solution trên một case cụ thể."
  };
  if (kind === "contest") return {
    label: "CONTEST",
    title: "Làm từng bài trong bộ đề",
    body: "Contest giữ tiến độ, rating và test riêng cho từng bài. Dùng điều hướng trên thanh bài để chuyển bài.",
    guideRows: [["01", "Đọc constraint", "Kiểm tra format và ví dụ trước khi chạm vào code."], ["02", "Lưu bài", "Code và input được lưu riêng cho bài hiện tại."], ["03", "Chuyển bài", "AC xong dùng Bài sau; Bài trước để quay lại kiểm tra."]],
    railTitle: "Tiến độ contest",
    railBody: "Theo dõi bài hiện tại và trạng thái chấm ở header.",
    readyRows: [["Bài hiện tại", "Statement + code"], ["Input", "Run thử riêng"], ["Bộ test", "Judge toàn bài"]],
    readyText: "Ví dụ: copy Input 01 dưới đề sang STDIN, kiểm tra Expected output, rồi Submit khi lời giải ổn định."
  };
  if (kind === "xuong") return {
    label: "XƯỞNG",
    title: "Build project từ lời giải của em",
    body: "Đề bên trái là project brief. Em hoàn thiện file triển khai; file 🔒 là hợp đồng interface + test, chỉ đọc.",
    guideRows: [["01", "Đọc brief", "Xây gì, cần đạt gì, kiểm chứng bằng gì — tất cả ở cột trái."], ["02", "Sửa file triển khai", "Chỉ file không có 🔒; hợp đồng và bộ test giữ nguyên."], ["03", "Verify quyết định", "Fail đưa bằng chứng đọc được; đạt hết thì Tiến hóa để nhận yêu cầu mới."]],
    railTitle: "Yêu cầu & bằng chứng",
    railBody: "Trạng thái từng yêu cầu chỉ đổi khi có một lần verify thật đứng sau.",
    readyRows: [["Brief", "Xây gì · cần đạt gì"], ["Verify", "Compile + test thật"], ["Tiến hóa", "Yêu cầu mới khi đã đạt"]],
    readyText: "Ví dụ: hoàn thiện phần TODO trong file .cpp rồi bấm Verify — bằng chứng pass/fail nằm ở rail phải.",
    guideFoot: "Không có Run/STDIN ở đây — <b>Verify</b> là con đường duy nhất: nó biên dịch cả project và chạy bộ test trong <b>tests/</b>."
  };
  // Unknown kinds get a NEUTRAL shell — never another tool's panel. (The old
  // fallback returned the CONTEST profile for everything, which is exactly how
  // the module workspace ended up wearing a contest costume — README mistake #3.)
  return {
    label: "LUYỆN TẬP",
    title: "Không gian code chuẩn",
    body: "Đề bên trái, code ở giữa, Run/Judge bên phải — cùng một nhịp thao tác cho mọi hoạt động.",
    guideRows: [["01", "Đọc đề", "Kiểm tra format và ví dụ trước khi code."], ["02", "Code và Run thử", "Run với input riêng để quan sát."], ["03", "Judge quyết định", "Verdict + bằng chứng nằm ở cột phải."]],
    railTitle: "Run / Judge",
    railBody: "Kết quả chấm và bằng chứng hiện ở đây.",
    readyRows: [["Run", "Input tự nhập"], ["Judge", "Chấm bộ test"], ["Verdict", "AC/WA + diff"]],
    readyText: "Ví dụ: dán input mẫu vào STDIN rồi Run trước khi Judge."
  };
}

function toolGuideHtml(config) {
  const profile = activityProfile(config);
  return `<aside class="aw-toolguide-rail" aria-label="Cách sử dụng công cụ">
    <div class="aw-guide-head"><span>${escapeHtml(profile.label)}</span><b>CÁCH DÙNG TOOL</b></div>
    <h2>${escapeHtml(profile.title)}</h2>
    <p>${escapeHtml(profile.body)}</p>
    <div class="aw-guide-rows">${profile.guideRows.map(([number, title, copy]) => `<div class="aw-guide-row"><b>${number}</b><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span></div>`).join("")}</div>
    <p class="aw-guide-foot">${activityProfile(config).guideFoot || `Ví dụ thực hành: nhập một case nhỏ ở STDIN, bấm <b>Run</b> để quan sát; chỉ dùng <b>${escapeHtml(config.kind === "contest" ? "Submit" : "Judge")}</b> khi muốn chấm bộ test.`}</p>
  </aside>`;
}

function readyConsoleHtml(config) {
  const profile = activityProfile(config);
  const judgeWord = config.kind === "contest" ? "Submit" : (config.kind === "stress" ? "Run batch" : "Judge");
  return `<div class="aw-console-ready">
    <div class="aw-console-ready-head"><span class="aw-console-icon">▶</span><span><b>${escapeHtml(profile.railTitle)}</b><small>${escapeHtml(profile.railBody)}</small></span></div>
    <div class="aw-console-tools">${profile.readyRows.map(([title, copy]) => `<div><b>${escapeHtml(title)}</b><span>${escapeHtml(copy)}</span></div>`).join("")}</div>
    <div class="aw-console-shortcuts"><kbd>Ctrl·↵</kbd><span>Run input hiện tại</span><kbd>Ctrl·⇧·↵</kbd><span>${escapeHtml(judgeWord)}</span></div>
    <div class="aw-console-output-preview">
      <div><span>OUTPUT / VERDICT</span><b>READY</b></div>
      <p>${escapeHtml(profile.readyText)}</p>
      <section class="aw-output-block is-placeholder"><div class="aw-output-label">STDOUT</div><pre>—</pre></section>
    </div>
  </div>`;
}

function renderStatement(statement, config) {
  // A tool may fully own its left column (config.briefHtml) — Xưởng renders a
  // 3-card project brief, not a problem statement, so it bypasses the generic
  // statement-sheet builder entirely instead of shoehorning cards into
  // Markdown. Everything else still gets the shared reader sheet.
  if (config.briefHtml) {
    statement.innerHTML = `<div class="aw-brief">${config.briefHtml}</div>`;
    renderMath(statement);
    return;
  }
  try {
    statement.innerHTML = buildStatementSheetHtml(statementWithSamples(config), {
      title: (config.sheetMeta && config.sheetMeta.title) || config.title || "Bài luyện",
      elo: config.sheetMeta && config.sheetMeta.elo,
      topic: config.sheetMeta && config.sheetMeta.topic,
      kicker: (config.sheetMeta && config.sheetMeta.kicker) || config.kicker
    });
    highlightTokens(statement);
  } catch {
    statement.innerHTML = renderMarkdown(statementWithSamples(config) || "_Chưa có nội dung đề._");
  }
  renderMath(statement);
}

function sourcePickerHtml(problems) {
  const options = (Array.isArray(problems) ? problems : []).map((problem) =>
    `<option value="${escapeHtml(problem.id)}">${escapeHtml(problem.title || problem.id)}${problem.topic ? ` · ${escapeHtml(problem.topic)}` : ""}</option>`
  ).join("");
  return `<div class="aw-source-backdrop" data-aw-source-modal>
    <section class="aw-source-dialog" role="dialog" aria-modal="true" aria-labelledby="aw-source-title">
      <div class="aw-source-head"><div><span class="aw-kicker">PROBLEM SOURCE</span><h2 id="aw-source-title">Chọn bài tập</h2><p>Đổi đề mà không rời khỏi luồng luyện tập.</p></div><button class="aw-close" data-aw-source-close type="button" aria-label="Đóng">×</button></div>
      <div class="aw-source-grid">
        <section class="aw-source-card"><span class="aw-source-label">Bài đã có</span><select data-aw-source-select ${options ? "" : "disabled"}><option value="">${options ? "Chọn một bài trong thư viện…" : "Chưa có bài nào"}</option>${options}</select><button class="btn btn-ghost" data-aw-source-open type="button" ${options ? "" : "disabled"}>Mở trong IDE chính</button></section>
        <section class="aw-source-card"><span class="aw-source-label">Dán đề và sinh test</span><textarea data-aw-source-paste rows="8" placeholder="Dán Markdown / text đề bài vào đây…"></textarea><button class="btn btn-primary" data-aw-source-paste-action type="button">Chuẩn hóa đề + sinh test</button></section>
        <section class="aw-source-card aw-source-ai"><span class="aw-source-label">API tạo đề</span><h3>Tạo bài cá nhân hóa</h3><p>AI dựa trên lịch sử luyện tập gần đây để tạo một bài mới, kèm test đã kiểm tra.</p><button class="btn btn-ai" data-aw-source-ai type="button">Tạo bài bằng AI</button></section>
      </div>
      <div class="aw-source-status" data-aw-source-status aria-live="polite"></div>
    </section>
  </div>`;
}

function testRows(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return "";
  return `<div class="aw-tests">${list.map((t, index) => `
    <div class="aw-test-row" data-status="${escapeHtml(t.status || "")}">
      <span class="aw-test-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="aw-test-name">${escapeHtml(t.name || `Test ${index + 1}`)}</span>
      <b>${escapeHtml(t.status || "—")}</b>
      <span>${t.timeMs != null ? `${Math.round(t.timeMs)} ms` : ""}</span>
    </div>`).join("")}</div>`;
}

function failureDetails(result) {
  const fail = (result.results || []).find((t) => t && t.status !== "AC");
  if (!fail) return "";
  const diff = activityDiffLabel(fail.diff);
  return `<div class="aw-failure-grid">
    ${outputBlock("Input gây lỗi", fail.input)}
    ${outputBlock("Đáp án chuẩn", fail.expected, "is-expected")}
    ${outputBlock("Output của em", fail.actual, "is-actual")}
    ${diff ? `<div class="aw-diff-note">${escapeHtml(diff)}</div>` : ""}
  </div>`;
}

export function initActivityWorkspace(app) {
  const zone = document.createElement("section");
  zone.id = "activity-workspace";
  zone.className = "activity-workspace hidden";
  zone.setAttribute("aria-label", "Không gian code luyện tập");
  document.body.appendChild(zone);

  let current = null;
  const editorHandles = new Map();
  let editorConfigs = [];
  let activeEditorId = null;
  let currentCleanup = null;
  let lastFocus = null;
  let saveTimer = null;
  let ioTimer = null;
  let activeAbort = null;
  let activeKind = null;
  let lastResult = null;
  let stateTicker = null;
  let epoch = 0;
  const savedCodes = new Map();

  const publicApi = {
    open,
    replace,
    openLoading,
    showError,
    close,
    setStatus,
    execute,
    getCode: (id) => {
      const key = id || activeEditorId;
      const handle = key && editorHandles.get(key);
      return handle ? handle.getValue() : "";
    },
    getEditorValues: () => Object.fromEntries(editorConfigs.map((entry) => [entry.id, editorHandles.get(entry.id)?.getValue() ?? entry.code])),
    setEditorValue: (id, value) => {
      const handle = editorHandles.get(id);
      if (!handle) return false;
      handle.setValue(value);
      return true;
    },
    selectRange: (from, to, id) => {
      const handle = editorHandles.get(id || activeEditorId);
      if (!handle) return false;
      handle.selectRange(from, to == null ? from : to);
      handle.focus();
      return true;
    },
    setProgress,
    get isOpen() { return !zone.classList.contains("hidden"); }
  };
  app.activityWorkspace = publicApi;
  zone.addEventListener("keydown", onWorkspaceKey, true);
  // Sample-box copy buttons (the sheet renders the same .stmt-copy chrome as
  // the main reader, whose own delegate only covers #statement-rendered).
  zone.addEventListener("click", (event) => {
    const btn = event.target.closest(".stmt-copy");
    if (!btn) return;
    const col = btn.closest(".stmt-sample-col");
    const pre = col && col.querySelector(".stmt-sample-pre");
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "Copy"; }, 1200);
    }).catch(() => { if (app.toast) app.toast("Không copy được", "err"); });
  });

  function clearTimers() {
    clearTimeout(saveTimer);
    clearTimeout(ioTimer);
    saveTimer = null;
    ioTimer = null;
  }

  function teardownSurface() {
    clearTimers();
    clearInterval(stateTicker);
    stateTicker = null;
    if (activeAbort) activeAbort.abort();
    activeAbort = null;
    activeKind = null;
    if (currentCleanup) { try { currentCleanup(); } catch { /* best effort */ } }
    currentCleanup = null;
    for (const handle of editorHandles.values()) { try { handle.destroy(); } catch { /* best effort */ } }
    editorHandles.clear();
    editorConfigs = [];
    activeEditorId = null;
    savedCodes.clear();
  }

  function close({ notify = true } = {}) {
    const closing = current;
    epoch += 1;
    teardownSurface();
    current = null;
    lastResult = null;
    zone.classList.add("hidden");
    zone.innerHTML = "";
    if (notify && closing && typeof closing.onClose === "function") {
      try { closing.onClose(); } catch { /* best effort */ }
    }
    const focus = lastFocus;
    lastFocus = null;
    if (focus && focus.isConnected && typeof focus.focus === "function") focus.focus();
  }

  function shellState({ kind = "activity", title, kicker, message, error, retry, onClose } = {}) {
    if (zone.classList.contains("hidden")) lastFocus = document.activeElement;
    teardownSurface();
    current = { kind, title, onClose };
    zone.dataset.kind = kind;
    zone.classList.remove("hidden");
    // The preparation steps every activity really goes through (fetch/build the
    // task, mount CodeMirror, arm the verifier). During loading a JS interval —
    // never a CSS infinite animation (screenshot-wedge rule) — walks the steps
    // and eases a progress bar so a 15–40s AI generation reads as work
    // happening, not a frozen app.
    const steps = ["Chuẩn bị đề", "Editor C++", "Bộ chấm"];
    zone.innerHTML = `
      <div class="aw-state-shell${error ? " is-error" : ""}">
        <button class="aw-close" type="button" aria-label="Đóng">×</button>
        <div class="aw-state-card">
          <span class="aw-kicker">${escapeHtml(kicker || "Không gian luyện tập")}</span>
          <h1>${escapeHtml(title || "Đang tải")}</h1>
          <p class="${error ? "aw-state-error" : "muted"}">${escapeHtml(message || "")}</p>
          ${error ? "" : `
          <div class="aw-state-steps" aria-hidden="true">${steps.map((s, i) => `<span data-aw-step="${i}">${escapeHtml(s)}</span>`).join("<i>→</i>")}</div>
          <div class="aw-state-progress" role="progressbar" aria-label="Đang chuẩn bị"><i data-aw-state-bar></i></div>`}
          <div class="aw-state-actions">
            ${retry ? `<button class="btn btn-primary" data-aw-retry type="button">Thử lại</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-aw-state-close type="button">${error ? "Đóng" : "Hủy"} <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>`;
    zone.querySelector(".aw-close").addEventListener("click", () => close());
    zone.querySelector("[data-aw-state-close]").addEventListener("click", () => close());
    const retryBtn = zone.querySelector("[data-aw-retry]");
    if (retryBtn) retryBtn.addEventListener("click", retry);
    if (!error) {
      const bar = zone.querySelector("[data-aw-state-bar]");
      const stepEls = zone.querySelectorAll("[data-aw-step]");
      let pct = 4;
      let tick = 0;
      stateTicker = setInterval(() => {
        tick += 1;
        pct += Math.max(0.4, (92 - pct) * 0.06); // ease toward 92%, never claim done
        if (bar) bar.style.width = `${Math.min(92, pct)}%`;
        const stage = Math.min(steps.length - 1, Math.floor(pct / 34));
        stepEls.forEach((el, i) => el.classList.toggle("on", i <= stage));
      }, 350);
    }
  }

  function openLoading(options = {}) {
    shellState({ ...options, message: options.message || "Đang chuẩn bị đề, editor và môi trường chấm…" });
  }

  function showError(options = {}) {
    shellState({ ...options, error: true, message: options.message || "Không mở được bài luyện này." });
  }

  async function open(config) {
    return openInternal(config, { preserveResult: false, keepFocusOwner: false });
  }

  async function replace(config, { preserveResult = false } = {}) {
    return openInternal(config, { preserveResult, keepFocusOwner: true });
  }

  async function openInternal(config, { preserveResult, keepFocusOwner }) {
    // A tool that hides the judge button owns verification in its own panel
    // (Xưởng: Checks tab), so it must not be forced to register a judge
    // adapter that nothing can reach.
    if (!config || typeof config.run !== "function" || (!config.hideJudge && typeof config.judge !== "function")) {
      throw new Error("Activity workspace requires run and judge adapters.");
    }
    const myEpoch = ++epoch;
    if (!keepFocusOwner && zone.classList.contains("hidden")) lastFocus = document.activeElement;
    teardownSurface();
    current = config;
    if (!preserveResult) lastResult = null;
    editorConfigs = normalizeEditors(config);
    // config.activeEditorId travels as the caller's raw file id (e.g. a path
    // with dots); normalizeEditors sanitizes entry.id for DOM use, so match on
    // fileName too or a dotted path never resolves and silently falls back to
    // editorConfigs[0] — which reopened Xưởng on the locked contract tab.
    const requestedActiveId = String(config.activeEditorId || editorConfigs[0].id);
    const requestedActive = editorConfigs.find((entry) => entry.id === requestedActiveId || entry.fileName === requestedActiveId);
    activeEditorId = requestedActive ? requestedActive.id : editorConfigs[0].id;
    for (const entry of editorConfigs) savedCodes.set(entry.id, entry.code);
    zone.dataset.kind = config.kind || "activity";
    zone.classList.remove("hidden");
    zone.innerHTML = `
      <div class="aw-shell">
        <header class="aw-topbar">
          <div class="aw-brand" aria-label="USACO IDE 2.0">
            <span class="aw-brand-mark">‹/›</span>
            <span class="aw-brand-name">USACO IDE <b>2.0</b></span>
          </div>
          <div class="aw-topbar-center">
            <span class="aw-topbar-title">${escapeHtml(config.title || "Bài luyện")}</span>
            <span class="aw-topbar-context">${escapeHtml(config.kicker || "Luyện tập")}</span>
          </div>
          <div class="aw-topbar-actions">
            <span class="aw-local-badge"><i></i> Local Judge</span>
            ${config.hideRun ? "" : `<button class="btn btn-run" id="aw-run" type="button">${escapeHtml(config.runLabel || "Run")} <kbd>Ctrl·↵</kbd></button>`}
            ${config.hideJudge ? "" : `<button class="btn btn-judge" id="aw-judge" type="button">${escapeHtml(config.judgeLabel || (config.kind === "contest" ? "Submit" : "Judge"))} <kbd>Ctrl·⇧·↵</kbd></button>`}
            <button class="aw-topbar-close" data-aw-close type="button" aria-label="Đóng">×</button>
          </div>
        </header>
        <header class="aw-head">
          <div class="aw-heading">
            <span class="aw-kicker">${escapeHtml(config.kicker || "Luyện tập")}</span>
            <h1>${escapeHtml(config.title || "Bài luyện")}</h1>
            <div class="aw-status" id="aw-status">${statusHtml(config.status)}</div>
          </div>
          <div class="aw-head-actions">
            <div class="aw-nav-actions">${(config.headerActions || []).map((a, i) => `<button class="btn btn-ghost btn-sm" data-aw-head="${i}" type="button"${a.disabled ? " disabled" : ""}>${escapeHtml(a.label)}</button>`).join("")}</div>
            ${config.sourceSwitch ? `<button class="btn btn-ghost btn-sm aw-source-trigger" data-aw-source-open-dialog type="button">Đổi đề</button>` : ""}
          </div>
        </header>
        <div class="aw-body">
          <section class="aw-statement-col" aria-label="Đề bài">
            <div class="aw-col-head"><span>${config.briefHtml ? "Project Brief" : "Statement"}</span>${config.briefHtml ? "" : `<button class="aw-statement-edit" id="aw-statement-edit" type="button">Chỉnh đề</button>`}</div>
            <article class="statement-page aw-statement" id="aw-statement"></article>
          </section>
          <section class="aw-code-col" aria-label="Code">
            <div class="aw-code-toolbar">
              <div class="aw-file-tabs-scroll"><div class="aw-file-tabs" role="tablist" aria-label="Tệp C++">${editorConfigs.map((entry) => `<button class="aw-file-tab ${entry.id === activeEditorId ? "active" : ""} ${entry.readOnly ? "is-locked" : ""}" type="button" role="tab" aria-selected="${entry.id === activeEditorId ? "true" : "false"}" data-aw-editor="${escapeHtml(entry.id)}" title="${escapeHtml(entry.fileName || entry.label)}">${entry.readOnly ? `<i class="aw-file-tab-lock" aria-hidden="true"></i>` : ""}<span>${escapeHtml(entry.shortLabel || entry.label)}</span></button>`).join("")}</div></div>
              <span class="aw-task-note" id="aw-task-note">${escapeHtml(editorConfigs.find((entry) => entry.id === activeEditorId)?.taskNote || "")}</span>
              <span class="toolbar-spacer"></span>
              <span class="aw-save-state" id="aw-save-state"></span>
              <button class="btn btn-ghost btn-sm" id="aw-save" type="button">Save</button>
            </div>
            <div class="aw-editor-stack" id="aw-editor-stack">${editorConfigs.map((entry) => `<div class="aw-editor-host ${entry.id === activeEditorId ? "" : "hidden"}" data-aw-editor-host="${escapeHtml(entry.id)}"><div class="aw-editor-loading"><span class="spinner"></span> Đang mở CodeMirror…</div></div>`).join("")}</div>
          </section>
          <aside class="aw-result-col" aria-label="Run và kết quả chấm">
            <div class="aw-col-head"><span>${escapeHtml(config.resultColTitle || "Run / Judge")}</span><span class="verdict-chip verdict-idle" id="aw-verdict">READY</span></div>
            <div class="aw-controls" id="aw-controls"></div>
            <section class="aw-io-stack ${config.hideIo ? "hidden" : ""}" aria-label="Custom test">
              <div class="aw-io-title"><span>Custom test</span><small>Case em tự nhập</small></div>
              <label class="aw-io-field"><span>STDIN</span><textarea id="aw-input" spellcheck="false" placeholder="Nhập input cho chương trình…"></textarea></label>
              <label class="aw-io-field ${config.expectedEnabled ? "" : "hidden"}"><span>EXPECTED OUTPUT <em>(tuỳ chọn)</em></span><textarea id="aw-expected" spellcheck="false" placeholder="Dán output để đối chiếu khi Run…"></textarea></label>
            </section>
            ${config.hideToolGuide ? "" : toolGuideHtml(config)}
            <div class="aw-result" id="aw-result">${config.hideReadyConsole ? "" : readyConsoleHtml(config)}</div>
          </aside>
        </div>
      </div>`;

    const statement = zone.querySelector("#aw-statement");
    renderStatement(statement, config);
    zone.querySelector("#aw-statement-edit")?.addEventListener("click", () => openStatementEditor(statement));
    zone.querySelectorAll("[data-aw-close]").forEach((button) => button.addEventListener("click", () => close()));
    const sourceTrigger = zone.querySelector("[data-aw-source-open-dialog]");
    if (sourceTrigger) sourceTrigger.addEventListener("click", openSourceDialog);
    zone.querySelectorAll("[data-aw-head]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = (config.headerActions || [])[Number(button.dataset.awHead)];
        if (action && typeof action.onClick === "function") action.onClick();
      });
    });
    zone.querySelectorAll("[data-aw-editor]").forEach((button) => {
      button.addEventListener("click", () => switchEditor(button.dataset.awEditor));
    });
    if (typeof config.mountControls === "function") {
      const cleanup = config.mountControls(zone.querySelector("#aw-controls"), publicApi);
      if (typeof cleanup === "function") currentCleanup = cleanup;
    }

    const inputEl = zone.querySelector("#aw-input");
    const expectedEl = zone.querySelector("#aw-expected");
    inputEl.value = config.input || "";
    expectedEl.value = config.expected || "";
    const scheduleIoSave = () => {
      clearTimeout(ioTimer);
      ioTimer = setTimeout(() => flushIo(true), SAVE_DELAY_MS);
    };
    inputEl.addEventListener("input", scheduleIoSave);
    expectedEl.addEventListener("input", scheduleIoSave);

    const runBtn = zone.querySelector("#aw-run");
    if (runBtn) runBtn.addEventListener("click", () => execute("run"));
    zone.querySelector("#aw-judge")?.addEventListener("click", () => execute("judge"));
    zone.querySelector("#aw-save").addEventListener("click", () => persistCode(false));

    try {
      for (const entry of editorConfigs) {
        const host = zone.querySelector(`[data-aw-editor-host="${entry.id}"]`);
        host.innerHTML = "";
        const handle = await mountActivityEditor(host, entry.code, (code) => {
          if (myEpoch !== epoch) return;
          const saveState = zone.querySelector("#aw-save-state");
          if (saveState) saveState.textContent = code === savedCodes.get(entry.id) ? "Saved" : "Editing…";
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => persistCode(true), SAVE_DELAY_MS);
        });
        editorHandles.set(entry.id, handle);
      }
    } catch (error) {
      if (myEpoch !== epoch) return;
      const stack = zone.querySelector("#aw-editor-stack");
      stack.innerHTML = `<div class="aw-editor-error">CodeMirror không tải được. Run/Judge đã khoá để tránh sửa code bằng editor sai chuẩn.<br><span>${escapeHtml(error.message || "")}</span></div>`;
      const brokenRun = zone.querySelector("#aw-run");
      if (brokenRun) brokenRun.disabled = true;
      const brokenJudge = zone.querySelector("#aw-judge");
      if (brokenJudge) brokenJudge.disabled = true;
    }
    if (myEpoch !== epoch) return;
    if (lastResult) renderResult(lastResult);
    if (typeof config.onActivate === "function") {
      const cleanup = config.onActivate(publicApi);
      if (typeof cleanup === "function") {
        const previousCleanup = currentCleanup;
        currentCleanup = () => { if (previousCleanup) previousCleanup(); cleanup(); };
      }
    }
    const activeEditor = editorHandles.get(activeEditorId);
    if (activeEditor) {
      if (config.selectRange && Number.isFinite(config.selectRange.from)) {
        activeEditor.selectRange(config.selectRange.from, config.selectRange.to == null ? config.selectRange.from : config.selectRange.to);
      } else activeEditor.focus();
    }
  }

  function openStatementEditor(host) {
    if (!current || !host) return;
    const original = String(current.statement || "");
    host.innerHTML = `<section class="aw-statement-editor">
      <div><b>Chỉnh diễn giải bài</b><span>Thay đổi này chỉ phục vụ lượt luyện hiện tại, không làm đổi bộ test chấm.</span></div>
      <textarea id="aw-statement-draft" spellcheck="false"></textarea>
      <footer><button class="btn btn-ghost btn-sm" data-aw-statement-cancel type="button">Huỷ</button><button class="btn btn-primary btn-sm" data-aw-statement-save type="button">Lưu diễn giải</button></footer>
    </section>`;
    const draft = host.querySelector("#aw-statement-draft");
    draft.value = original;
    draft.focus();
    host.querySelector("[data-aw-statement-cancel]").addEventListener("click", () => renderStatement(host, current));
    host.querySelector("[data-aw-statement-save]").addEventListener("click", async () => {
      const next = draft.value.trim();
      if (!next) { draft.focus(); return; }
      current.statement = next;
      try {
        if (typeof current.saveStatement === "function") await current.saveStatement(next);
        renderStatement(host, current);
        app.toast?.("Đã lưu diễn giải cho lượt luyện này", "ok");
      } catch (error) {
        app.toast?.(error?.message || "Không lưu được diễn giải.", "err");
      }
    });
  }

  function switchEditor(id) {
    if (!editorHandles.has(id)) return;
    activeEditorId = id;
    zone.querySelectorAll("[data-aw-editor]").forEach((button) => {
      const active = button.dataset.awEditor === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    zone.querySelectorAll("[data-aw-editor-host]").forEach((host) => host.classList.toggle("hidden", host.dataset.awEditorHost !== id));
    const note = zone.querySelector("#aw-task-note");
    const config = editorConfigs.find((entry) => entry.id === id);
    if (note) note.textContent = config ? config.taskNote : "";
    const saveState = zone.querySelector("#aw-save-state");
    const handle = editorHandles.get(id);
    if (saveState && handle) saveState.textContent = handle.getValue() === savedCodes.get(id) ? "Saved" : "Editing…";
    handle.focus();
  }

  function onWorkspaceKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (activeAbort) activeAbort.abort(); else close();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    // A hidden judge button means the tool drives checks from its own panel;
    // the shortcut must not reach an action the UI does not offer.
    if (event.shiftKey && current && current.hideJudge) return;
    event.preventDefault();
    execute(event.shiftKey ? "judge" : "run");
  }

  async function persistCode(quiet) {
    if (!current || !editorHandles.size) return;
    const saveState = zone.querySelector("#aw-save-state");
    const changed = editorConfigs.filter((entry) => editorHandles.get(entry.id)?.getValue() !== savedCodes.get(entry.id));
    if (!changed.length) {
      if (saveState) saveState.textContent = "Saved";
      return;
    }
    if (saveState) saveState.textContent = "Saving…";
    try {
      for (const entry of changed) {
        const code = editorHandles.get(entry.id).getValue();
        if (typeof entry.saveCode === "function") await entry.saveCode(code);
        else if (editorConfigs.length === 1 && typeof current.saveCode === "function") await current.saveCode(code);
        savedCodes.set(entry.id, code);
      }
      if (saveState) saveState.textContent = "Saved";
      if (!quiet && app.toast) app.toast("Đã lưu code", "ok");
    } catch (error) {
      if (saveState) saveState.textContent = "Save failed";
      if (!quiet && app.toast) app.toast(error.message || "Không lưu được code.", "err");
    }
  }

  async function flushIo(quiet) {
    if (!current) return;
    const input = zone.querySelector("#aw-input")?.value || "";
    const expected = zone.querySelector("#aw-expected")?.value || "";
    try {
      const jobs = [];
      if (typeof current.saveInput === "function") jobs.push(current.saveInput(input));
      if (current.expectedEnabled && typeof current.saveExpected === "function") jobs.push(current.saveExpected(expected));
      await Promise.all(jobs);
    } catch (error) {
      if (!quiet && app.toast) app.toast(error.message || "Không lưu được input.", "err");
    }
  }

  function setBusy(kind) {
    activeKind = kind;
    const run = zone.querySelector("#aw-run"); // absent when config.hideRun
    const judge = zone.querySelector("#aw-judge"); // absent when config.hideJudge
    if (!run && !judge) return;
    if (!kind) {
      if (run) {
        run.disabled = false;
        run.innerHTML = `${escapeHtml(current?.runLabel || "Run")} <kbd>Ctrl·↵</kbd>`;
        run.classList.remove("btn-stop");
      }
      if (judge) {
        judge.disabled = false;
        judge.innerHTML = `${escapeHtml(current?.judgeLabel || (current?.kind === "contest" ? "Submit" : "Judge"))} <kbd>Ctrl·⇧·↵</kbd>`;
        judge.classList.remove("btn-stop");
      }
      return;
    }
    if (run) run.disabled = kind !== "run";
    if (judge) judge.disabled = kind !== "judge";
    const live = kind === "run" && run ? run : (judge || run);
    live.disabled = false;
    live.textContent = "■ Stop";
    live.classList.add("btn-stop");
  }

  async function execute(kind) {
    if (!current || !editorHandles.size) return;
    if (activeAbort) { activeAbort.abort(); return; }
    const configAtStart = current;
    const requestEpoch = epoch;
    clearTimers();
    await Promise.all([persistCode(true), flushIo(true)]);
    const editors = Object.fromEntries(editorConfigs.map((entry) => [entry.id, editorHandles.get(entry.id).getValue()]));
    const code = editors.solution ?? editors.main ?? editors[editorConfigs[0].id] ?? "";
    const input = zone.querySelector("#aw-input")?.value || "";
    const expected = zone.querySelector("#aw-expected")?.value || "";
    activeAbort = new AbortController();
    setBusy(kind);
    const verdict = zone.querySelector("#aw-verdict");
    verdict.className = "verdict-chip verdict-idle";
    const submitVerb = configAtStart.kind === "contest" ? "SUBMITTING…" : "JUDGING…";
    verdict.textContent = kind === "run" ? "RUNNING…" : submitVerb;
    zone.querySelector("#aw-result").innerHTML = `<div class="aw-result-loading"><span class="spinner"></span> ${kind === "run" ? "Đang biên dịch và chạy…" : (configAtStart.kind === "contest" ? "Đang nộp bài và chấm bộ test…" : "Đang chấm toàn bộ test…")}</div>`;
    try {
      const fn = kind === "run" ? configAtStart.run : configAtStart.judge;
      const result = await fn({ code, editors, input, expected, signal: activeAbort.signal });
      if (requestEpoch !== epoch || current !== configAtStart) return;
      lastResult = { ...(result || {}), _kind: kind };
      renderResult(lastResult);
      if (typeof configAtStart.onResult === "function") await configAtStart.onResult(lastResult, publicApi);
      if (lastResult.nextConfig && requestEpoch === epoch && current === configAtStart) {
        await replace(lastResult.nextConfig, { preserveResult: true });
      }
    } catch (error) {
      if (requestEpoch !== epoch) return;
      if (error && error.aborted) {
        lastResult = { verdict: "STOPPED", message: "Đã dừng tác vụ.", _kind: kind };
        renderResult(lastResult);
      } else {
        lastResult = { verdict: "ERROR", message: error && error.message ? error.message : "Không chạy được.", _kind: kind };
        renderResult(lastResult);
      }
    } finally {
      if (requestEpoch === epoch) {
        activeAbort = null;
        activeKind = null;
        setBusy(null);
      }
    }
  }

  function renderResult(result) {
    const box = zone.querySelector("#aw-result");
    const verdict = zone.querySelector("#aw-verdict");
    if (!box || !verdict) return;
    const v = String(result.verdict || "—").toUpperCase();
    verdict.className = `verdict-chip ${activityVerdictClass(v)}`;
    verdict.textContent = v;

    const summary = result.summary
      ? `${result.summary.passed || 0}/${result.summary.total || 0} test AC · ${Math.round(result.summary.timeMs || 0)} ms`
      : (result.timeMs != null ? `${Math.round(result.timeMs)} ms` : "");
    const stderr = result.stderr || (result.compile && result.compile.stderr) || "";
    const diff = activityDiffLabel(result.diff);
    const stdoutText = result.stdout != null && String(result.stdout).length ? result.stdout : "—";
    box.innerHTML = `
      ${result.feedback ? `<div class="aw-feedback">${escapeHtml(result.feedback)}</div>` : ""}
      <div class="aw-result-summary"><b>${escapeHtml(v)}</b><span>${escapeHtml(summary || result.message || "")}</span></div>
      ${testRows(result.results)}
      ${failureDetails(result)}
      ${outputBlock("STDOUT", stdoutText, String(stdoutText) === "—" ? "is-placeholder" : "")}
      ${outputBlock("STDERR", stderr, "is-stderr")}
      ${diff ? `<div class="aw-diff-note">${escapeHtml(diff)}</div>` : ""}
      <div class="aw-followup"></div>`;
    const actions = Array.isArray(result.actions)
      ? result.actions
      : (result.followup ? [result.followup] : []);
    for (const action of actions) {
      if (!action || typeof action.onClick !== "function") continue;
      const host = box.querySelector(".aw-followup");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn ${action.primary ? "btn-primary" : "btn-ghost"} btn-sm`;
      button.textContent = action.label || "Tiếp tục";
      button.addEventListener("click", action.onClick);
      host.appendChild(button);
    }
  }

  function setProgress({ verdict = "RUNNING", summary = "", frames = [] } = {}) {
    const box = zone.querySelector("#aw-result");
    const chip = zone.querySelector("#aw-verdict");
    if (!box || !chip) return;
    chip.className = `verdict-chip ${activityVerdictClass(verdict)}`;
    chip.textContent = String(verdict).toUpperCase();
    const rows = (Array.isArray(frames) ? frames : []).slice(-120);
    box.innerHTML = `
      <div class="aw-result-summary"><b>${escapeHtml(String(verdict).toUpperCase())}</b><span>${escapeHtml(summary)}</span></div>
      <div class="aw-live-log" aria-live="polite">${rows.map((frame) => `
        <div class="aw-live-row" data-status="${escapeHtml(frame.status || "")}">
          <span>${escapeHtml(frame.label || "")}</span>
          <b>${escapeHtml(frame.status || "")}</b>
          <span>${frame.timeMs == null ? "" : `${Math.round(frame.timeMs)} ms`}</span>
        </div>`).join("")}</div>`;
  }

  function setStatus(items) {
    const host = zone.querySelector("#aw-status");
    if (host) host.innerHTML = statusHtml(items);
  }

  function openSourceDialog() {
    if (zone.querySelector("[data-aw-source-modal]")) return;
    zone.insertAdjacentHTML("beforeend", sourcePickerHtml(app.state.problems || []));
    const modal = zone.querySelector("[data-aw-source-modal]");
    const status = modal.querySelector("[data-aw-source-status]");
    const closeModal = () => modal.remove();
    modal.querySelector("[data-aw-source-close]").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
    modal.querySelector("[data-aw-source-open]").addEventListener("click", async () => {
      const id = modal.querySelector("[data-aw-source-select]").value;
      if (!id) return;
      closeModal();
      close({ notify: false });
      await app.selectProblem(id);
    });
    modal.querySelector("[data-aw-source-paste-action]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const statement = modal.querySelector("[data-aw-source-paste]").value.trim();
      if (!statement) { status.textContent = "Hãy dán đề bài trước."; return; }
      button.disabled = true;
      status.textContent = "AI đang chuẩn hóa đề và sinh test…";
      try {
        const processed = await api.aiProcess({ statement, code: "" });
        const first = (processed.tests || [])[0] || { input: "", expected: "" };
        const created = await api.createProblem({
          title: sourceTitle(processed.statement || statement), source: "Đề dán từ workspace",
          topic: processed.analysis?.tags?.[0] || "", difficulty: processed.analysis?.difficulty || "unrated",
          status: "learning", statement: processed.statement || statement, input: first.input || "", expected: first.expected || "",
          tests: processed.tests || [], notes: (processed.notes || []).join("\n")
        });
        await app.refreshProblems();
        closeModal();
        close({ notify: false });
        await app.selectProblem(created.problem.id);
        app.toast?.("Đã tạo bài từ đề dán và mở trong IDE.", "ok");
      } catch (error) {
        button.disabled = false;
        status.textContent = error?.message || "Không tạo được bài từ đề dán.";
      }
    });
    modal.querySelector("[data-aw-source-ai]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      status.textContent = "AI đang tạo bài cá nhân hóa…";
      try {
        const created = await api.personalizedProblem(8);
        await app.refreshProblems();
        closeModal();
        close({ notify: false });
        await app.selectProblem(created.problem.id);
        app.toast?.("Đã tạo bài mới bằng AI và mở trong IDE.", "ok");
      } catch (error) {
        button.disabled = false;
        status.textContent = error?.message || "Không tạo được bài bằng AI.";
      }
    });
  }
}
