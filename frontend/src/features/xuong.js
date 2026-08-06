// xuong.js — Xưởng v2 (Preview Runtime). Three surfaces, one shell:
//
//   S6  project list            (journey host)
//   S4  decision sheet          → inert reference storyboard → enter workbench
//   S5  workbench               focus rail · CodeMirror + mapping ribbon ·
//                               Preview "Bản của em" (Checks/Logs secondary)
//
// Doctrine enforced here (README §6.4, contract §1/§7):
//   · build console = compile/runtime ONLY. Behaviour lives in Preview,
//     requirement verdicts live in Checks. The judge button is hidden so the
//     same verdict can never appear twice.
//   · reference ≠ user run: different type, different badge, no controls.
//   · no fixture fallback. A 4xx/5xx is shown as itself.
//   · Run/Replay/Checks never call AI.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";
import {
  normalizeSession, normalizeProject, normalizeReference, normalizeRun,
  normalizeObservable, normalizeRecipe, normalizeReplay, normalizeEvidenceList,
  normalizeRunEnvelope, normalizeReplayEnvelope, normalizeReferenceEnvelope,
  previewModel, replayModel, decisionSheetModel, referenceModel,
  focusRailModel, mappingRibbonModel, growthModel, requirementsModel,
  statusStripModel, buildOutputModel, anchorTargets, editorIdsForPaths, spanToRange,
  scenarioPickerModel, evolveActionModel,
} from "../core/xuong-v2-model.js";
// The Preview Surface carries every base projection and is only ever needed
// once a student opens a Xưởng project — a Luyện tập session must not pay for
// it. It is fetched on the way into S4/S5 and cached for the rest of the
// session; painting is synchronous after that, so no panel ever flickers.
let renderPreviewFn = null;
export async function ensurePreviewSurface() {
  if (!renderPreviewFn) ({ renderPreview: renderPreviewFn } = await import("./xuong-preview.js?v=2.1.10"));
  return renderPreviewFn;
}
function renderPreview(model) {
  if (renderPreviewFn) return renderPreviewFn(model);
  // Only reachable if a paint races the import; says what is true, nothing more.
  return `<div class="xp-empty" data-xp-state="loading"><b>Đang mở khung quan sát…</b></div>`;
}

const BUILD_VERDICT = Object.freeze({ ok: "OK", "compile-error": "CE", "runtime-error": "RE", "timed-out": "TLE", none: "—" });

const rel = (iso) => {
  const t = new Date(iso || "").getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
};

// ---------------------------------------------------------------------------
// S6 — project list
// ---------------------------------------------------------------------------

function projectCard(project, index) {
  const growth = growthModel(project).items.find((g) => g.state === "current");
  return `
    <button type="button" class="jh-practice-card xg-card" data-xg-project="${escapeHtml(project.id)}">
      <span class="jh-practice-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="jh-practice-label">${escapeHtml(growth ? growth.label : "Đang build")}</span>
      <strong>${escapeHtml(project.display.label)}</strong>
      <span class="jh-practice-copy">${escapeHtml(project.brief.context)}</span>
      <span class="jh-practice-meta">${escapeHtml(project.nextAction.reason || project.transformation.newCapability)}</span>
      <span class="jh-practice-go" aria-hidden="true">${escapeHtml(project.nextAction.label || "Mở xưởng")} →</span>
    </button>`;
}

function listMarkup(projects) {
  return `
    <section class="xg-list" aria-label="Dự án trong Xưởng">
      <div class="xg-intro">
        <div>
          <span class="jh-card-sub">Biến lời giải đã AC thành một sản phẩm nhỏ có người dùng</span>
          <p class="xg-intro-copy"><b>Bản khó hơn</b> cho em một đề mới để giải. <b>Xưởng</b> giữ nguyên code của em, thêm một tình huống làm giả định cũ sai, rồi để em sửa cho tới khi sản phẩm chạy đúng — em nhìn thấy hành vi thay đổi ngay trong Preview.</p>
        </div>
        <button type="button" class="btn btn-primary" data-xg-start>Bắt đầu từ bài đã giải →</button>
      </div>
      ${projects.length
        ? `<div class="xg-grid">${projects.map(projectCard).join("")}</div>`
        : `<div class="xg-empty"><b>Chưa có sản phẩm nào</b><span>AC một bài bên Luyện tập rồi bấm “Phát triển lời giải” trên thanh verdict — hoặc bắt đầu ngay từ một bài đã giải ở nút phía trên.</span></div>`}
    </section>`;
}

// ---------------------------------------------------------------------------
// S4 — decision sheet (NOT a card gallery) + inert reference
// ---------------------------------------------------------------------------

function sheetShell(inner, { title, sub, cta }) {
  return `
    <div class="xg-sheet" role="dialog" aria-modal="true" aria-labelledby="xg-sheet-title">
      <header class="xg-sheet-head">
        <div>
          <span class="aw-kicker">Phát triển lời giải</span>
          <h2 id="xg-sheet-title">${escapeHtml(title)}</h2>
          ${sub ? `<p class="xg-sheet-sub">${escapeHtml(sub)}</p>` : ""}
        </div>
        <button type="button" class="aw-close" data-xg-close aria-label="Đóng">×</button>
      </header>
      <div class="xg-sheet-body">${inner}</div>
      ${cta ? `<footer class="xg-sheet-foot">
        <span class="xg-cta-reason">${escapeHtml(cta.reason || "")}</span>
        <button type="button" class="btn btn-primary" data-xg-cta ${cta.disabled ? "disabled" : ""}>${escapeHtml(cta.label)}</button>
      </footer>` : ""}
    </div>`;
}

// Every direction answers the SAME five questions, on one row, so the choice is
// a comparison — not a gallery of posters.
function decisionRow(row) {
  return `
    <label class="xg-row${row.selected ? " is-selected" : ""}${row.buildable ? "" : " is-inert"}">
      <input type="radio" name="xg-pathway" value="${escapeHtml(row.id)}" ${row.selected ? "checked" : ""} ${row.buildable ? "" : "disabled"}>
      <div class="xg-row-body">
        <div class="xg-row-head">
          <b>${escapeHtml(row.title)}</b>
          <span>${escapeHtml(row.goal)}</span>
        </div>
        <dl class="xg-row-axes">
          <div><dt>${escapeHtml(row.oldAssumption.label)}</dt><dd>${escapeHtml(row.oldAssumption.text)}</dd></div>
          <div class="is-break"><dt>${escapeHtml(row.breakingEvent.label)}</dt><dd>${escapeHtml(row.breakingEvent.text)}</dd></div>
          <div><dt>${escapeHtml(row.newCapability.label)}</dt><dd>${escapeHtml(row.newCapability.text)}</dd></div>
          <div><dt>${escapeHtml(row.observableOutcome.label)}</dt><dd>${escapeHtml(row.observableOutcome.text)}</dd></div>
        </dl>
        ${row.note ? `<p class="xg-row-note">${escapeHtml(row.note)}</p>` : ""}
      </div>
    </label>`;
}

function decisionSheetHtml(sheet) {
  if (sheet.empty) {
    return `<div class="xg-empty"><b>Chưa có hướng nào đủ điều kiện</b><span>AI chỉ đề xuất hướng làm lời giải cũ thật sự sai ở một tình huống mới. Lần này chưa tìm được hướng như vậy — thử một bài khác.</span></div>`;
  }
  return `
    ${sheet.summary ? `<p class="xg-analysis-summary">${escapeHtml(sheet.summary)}</p>` : ""}
    <div class="xg-rows">${sheet.rows.map(decisionRow).join("")}</div>`;
}

function referenceHtml(model) {
  return `
    <div class="xg-reference" data-provenance="reference">
      <div class="xg-prov-badge" data-provenance="reference">${escapeHtml(model.provenanceLabel)}</div>
      <h3 class="xg-reference-title">${escapeHtml(model.title)}</h3>
      ${model.description ? `<p class="xg-reference-sub">${escapeHtml(model.description)}</p>` : ""}
      ${model.frames.map((frame) => `
        <figure class="xg-frame">
          ${renderPreview(frame.preview)}
          <figcaption>${escapeHtml(frame.caption)}</figcaption>
        </figure>`).join("")}
    </div>`;
}

// ---------------------------------------------------------------------------
// S5 — workbench panels
// ---------------------------------------------------------------------------

// The narrative column: one headline the student can act on, then the three
// facts that bound the work. The growth spine is NOT here — it is a horizontal
// rail across the workbench (paintSpine), so this column stays a single column
// of reading matter instead of a second dashboard.
// The plain function name, which is what a student looks for in the editor —
// `Class::method` is how C++ writes a definition, not how anyone says it.
function editableSymbolOf(project) {
  const editable = (project.sourceMappings || []).find((mapping) => mapping.role === "editable");
  return editable ? `${String(editable.symbol).split("::").at(-1)}()` : "hàm đang mở";
}

// Role first, filename second. The roles come from the trusted learning bridge,
// so a project that never declared them still gets its filename rather than an
// invented label.
function tabLabelFor(project, file) {
  if (file.editable) return "★ Em sửa";
  // Longest suffix first: `MemoryPool.requirement-change.test.cpp` also ends
  // with `.cpp`, so a naive match labelled the test file "File em sửa".
  const role = (project.learningBridge?.fileRoles || [])
    .slice()
    .sort((a, b) => b.suffix.length - a.suffix.length)
    .find((item) => String(file.path).endsWith(item.suffix));
  if (!role) return file.path;
  return role.label.split("·")[0].trim();
}

function focusRailHtml(project) {
  const rail = focusRailModel(project);
  return `
    <section class="xg-focus">
      <p class="xg-focus-kicker">Việc của build này</p>
      <h3 class="xg-focus-mission">${escapeHtml(rail.mission)}</h3>
      ${rail.why ? `<p class="xg-focus-why"><b>Vì sao bây giờ:</b> ${escapeHtml(rail.why)}</p>` : ""}

      ${rail.editTarget ? `<div class="xg-where">
        <p class="xg-where-lead">Em gõ ở đây</p>
        <p class="xg-where-target">
          <code class="xg-where-symbol">${escapeHtml(rail.editTarget.symbol)}()</code>
          <span class="xg-where-file">trong ${escapeHtml(rail.editTarget.filePath)}</span>
        </p>
        <button type="button" class="xg-where-jump" data-xg-open-origin>Mở đúng vùng cần sửa →</button>
      </div>` : ""}

      ${rail.steps.length ? `<div class="xg-steps">
        <p class="xg-block-lead">Làm ${rail.steps.length} bước</p>
        <ol>${rail.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <p class="xg-steps-note">Ba bước này cũng nằm ngay trên hàm em sửa, trong file.</p>
      </div>` : ""}

      ${rail.files.length ? `<div class="xg-files">
        <p class="xg-block-lead">Ba file, chỉ một file là của em</p>
        <ul>${rail.files.map((file) => `
          <li class="xg-file${file.mine ? " is-mine" : ""}">
            <span class="xg-file-role">${escapeHtml(file.label)}</span>
            <code class="xg-file-path">${escapeHtml(file.path)}</code>
            <span class="xg-file-what">${escapeHtml(file.description)}</span>
          </li>`).join("")}</ul>
        ${rail.callSite ? `<figure class="xg-callsite">
          <figcaption>Bài chạy gọi hàm của em đúng như thế này</figcaption>
          <pre><code>${escapeHtml(rail.callSite)}</code></pre>
        </figure>` : ""}
      </div>` : ""}

      <dl class="xg-focus-list">
        <div class="xg-focus-row">
          <dt>${escapeHtml(rail.input.label)}</dt><dd>${escapeHtml(rail.input.text)}</dd>
        </div>
        <div class="xg-focus-row is-done">
          <dt>${escapeHtml(rail.doneWhen.label)}</dt><dd>${escapeHtml(rail.doneWhen.text)}</dd>
        </div>
      </dl>
    </section>`;
}

// Growth spine: where this build sits in the arc. Non-numeric by contract —
// done / in flight / not opened yet, and nothing else.
function spineHtml(project) {
  const items = growthModel(project).items;
  if (!items.length) return "";
  return `
    <div class="xg-spine" role="list" aria-label="Tiến trình năng lực">
      ${items.map((item) => `
        <span class="xg-spine-step" role="listitem" data-state="${escapeHtml(item.state)}">
          <i class="xg-spine-dot" aria-hidden="true"></i>
          <span class="xg-spine-label">${escapeHtml(item.label)}</span>
        </span>`).join("")}
    </div>`;
}

// The bridge from the AC solution to the new component: which symbol carried
// which capability, and which one the student is editing now.
function mappingRibbonHtml(project, activeFilePath) {
  const ribbon = mappingRibbonModel(project, activeFilePath);
  if (!ribbon.items.length) return "";
  const claims = ribbon.evidence.flatMap((e) => e.claims);
  return `
    <div class="xg-ribbon" aria-label="Mã nguồn cũ trong sản phẩm mới">
      <span class="xg-ribbon-lead">Từ lời giải của em</span>
      ${ribbon.items.map((item) => `
        <button type="button" class="xg-chip${item.active ? " is-active" : ""}${item.editable ? " is-editable" : ""}" data-xg-mapping="${escapeHtml(item.id)}">
          ${escapeHtml(item.label)}${item.editable ? " · đang sửa" : ""}
        </button>`).join("")}
      ${claims.length ? `<span class="xg-ribbon-claim">
        <i>Đã chạy đúng sẵn:</i> ${escapeHtml(claims[0])}
      </span>` : ""}
    </div>`;
}

// The scenario the run addresses. Only shown once a project has actually
// unlocked more than one — a single-scenario project needs no chrome.
function scenarioPickerHtml(project, activeScenarioId) {
  const picker = scenarioPickerModel(project, activeScenarioId);
  if (!picker.multiple) return "";
  return `
    <div class="xg-scenarios" aria-label="Tình huống sẽ chạy">
      ${picker.options.map((option) => `
        <button type="button" class="xg-scenario${option.active ? " is-active" : ""}"
                data-xg-scenario="${escapeHtml(option.id)}" ${option.active ? 'aria-current="true"' : ""}>
          <b>${escapeHtml(option.label)}</b>
          <span>${escapeHtml(option.inputSummary)}</span>
        </button>`).join("")}
    </div>`;
}

// Logs = the build console, and nothing else. Compile and runtime facts only:
// behaviour is Preview's job and requirement verdicts are Checks'. Keeping it
// in a tab is what lets the duplicate console below the rail go away, so the
// same run never reports itself twice on one screen.
function logsHtml(run) {
  const build = buildOutputModel(run);
  if (!run) {
    return `<div class="xg-logs" data-state="idle">
      <p class="xg-logs-empty">Chưa có lần build nào. Bấm <b>Chạy build</b> để xem trình biên dịch nói gì.</p>
    </div>`;
  }
  return `<div class="xg-logs" data-state="${escapeHtml(build.state)}">
      <div class="xg-logs-head">
        <b>${escapeHtml(build.label)}</b>
        ${Number.isFinite(build.durationMs) ? `<span class="xg-logs-time">${escapeHtml(String(build.durationMs))} ms</span>` : ""}
      </div>
      ${build.diagnostics.length
        ? `<ul class="xg-logs-diags">${build.diagnostics.map((d) => `
            <li data-severity="${escapeHtml(d.severity)}">${escapeHtml(d.message)}</li>`).join("")}</ul>`
        : `<p class="xg-logs-empty">Trình biên dịch không báo gì thêm.</p>`}
    </div>`;
}

function checksHtml(project, evidence, busy) {
  const checks = requirementsModel(project, evidence);
  // Growth lives at the END of Checks: it is the one place a requirement
  // verdict is allowed, so it is also the only honest place to offer the next
  // stage — and it appears only when every open requirement has pass evidence.
  const evolve = evolveActionModel(project);
  return `
    <div class="xg-checks">
      <div class="xg-checks-head">
        <b>${checks.met}/${checks.total} yêu cầu đã đạt</b>
        <button type="button" class="btn btn-ghost btn-sm" data-xg-checks ${busy ? "disabled" : ""}>${busy ? "Đang kiểm…" : "Chạy Checks"}</button>
      </div>
      ${checks.items.map((item) => `
        <div class="xg-check" data-state="${escapeHtml(item.state)}">
          <div class="xg-check-head"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.stateLabel)}</b></div>
          ${[...item.failures, ...item.passes].map((ev) => `
            <details class="xg-ev" data-outcome="${escapeHtml(ev.outcome)}" ${ev.outcome === "fail" ? "open" : ""}>
              <summary>${escapeHtml(ev.kindLabel)} · ${escapeHtml(ev.outcome === "pass" ? "đạt" : "chưa đạt")} · ${escapeHtml(rel(ev.at))}</summary>
              ${ev.detailMissing
                ? `<p class="xg-ev-empty">Lần kiểm này không trả về nội dung đọc được — chưa đủ căn cứ để kết luận.</p>`
                : `<pre>${escapeHtml(ev.detail)}</pre>`}
            </details>`).join("")}
        </div>`).join("")}
      ${checks.total ? "" : `<p class="xg-checks-empty">Chưa có yêu cầu nào được mở. Chạy build và quan sát Preview trước.</p>`}
      ${evolve.available ? `
        <div class="xg-evolve">
          <p class="xg-evolve-reason">${escapeHtml(evolve.reason)}</p>
          <button type="button" class="btn btn-primary btn-sm" data-xg-evolve>${escapeHtml(evolve.label)} →</button>
        </div>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export function initXuong(app) {
  const overlay = (() => {
    const existing = document.getElementById("xuong-overlay");
    if (existing) return existing;
    const el = document.createElement("section");
    el.id = "xuong-overlay";
    el.className = "xg-overlay hidden";
    el.setAttribute("aria-label", "Phát triển lời giải");
    document.body.appendChild(el);
    return el;
  })();

  const toast = (message, kind) => { if (app.toast) app.toast(message, kind); };
  const closeOverlay = () => { overlay.classList.add("hidden"); overlay.innerHTML = ""; };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-xg-close]")) closeOverlay();
  });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closeOverlay(); });

  // ---- S4 -----------------------------------------------------------------

  function solvedProblems() {
    return (app.state.problems || []).filter((p) => p.lastVerdict === "AC" || p.status === "solved");
  }

  async function openPathways(problemId) {
    overlay.classList.remove("hidden");
    await ensurePreviewSurface();

    if (!problemId) {
      const solved = solvedProblems().slice(0, 30);
      overlay.innerHTML = sheetShell(
        solved.length
          ? `<div class="xg-picker">${solved.map((p) => `
              <button type="button" class="xg-pick" data-xg-pick="${escapeHtml(p.id)}">
                <b>${escapeHtml(p.title || p.id)}</b>
                <span>${escapeHtml(p.topic || "")}${p.rating ? ` · ${p.rating}` : ""}</span>
              </button>`).join("")}</div>`
          : `<div class="xg-empty"><b>Chưa có bài AC nào</b><span>Giải một bài bên Luyện tập trước — Xưởng phát triển từ chính lời giải của em.</span></div>`,
        { title: "Chọn một bài đã giải", sub: "AI đọc lời giải AC và tìm những tình huống làm nó không còn đủ." }
      );
      return;
    }

    if (app.bus) app.bus.emit("xuong:started", { problemId }); // funnel B (NCKH §5): Xưởng start

    const problem = (app.state.problems || []).find((p) => p.id === problemId) || { id: problemId, title: problemId };
    overlay.innerHTML = sheetShell(
      `<div class="xg-analyzing"><p>AI đang đọc lời giải “<b>${escapeHtml(problem.title || problem.id)}</b>” — tìm năng lực sẵn có và giả định có thể bị phá…</p></div>`,
      { title: "Đang phân tích lời giải", sub: "" }
    );

    let session;
    try {
      const raw = await api.xuongAnalyze({ problemId });
      session = normalizeSession(raw.session);
      if (!session) throw new Error("Phân tích trả về dữ liệu không đọc được.");
    } catch (error) {
      if (error && error.aborted) { closeOverlay(); return; }
      overlay.innerHTML = sheetShell(
        `<div class="xg-empty"><b>Chưa phân tích được</b><span>${escapeHtml(error.message || "Lỗi không rõ.")}</span></div>
         <div class="xg-retry-row"><button type="button" class="btn btn-primary" data-xg-retry>Thử lại</button></div>`,
        { title: "Phân tích thất bại", sub: "" }
      );
      overlay.querySelector("[data-xg-retry]").addEventListener("click", () => openPathways(problemId));
      return;
    }

    let selectedId = null;
    const paintSheet = () => {
      const sheet = decisionSheetModel(session, selectedId);
      overlay.innerHTML = sheetShell(decisionSheetHtml(sheet), {
        title: `Phát triển “${problem.title || problem.id}”`,
        sub: "Mỗi hướng phải phá một giả định của lời giải cũ. Chọn một hướng để xem mẫu hành vi.",
        cta: sheet.empty ? null : { label: sheet.primaryCta.label, disabled: sheet.primaryCta.disabled, reason: sheet.primaryCta.reason },
      });
      overlay.querySelectorAll('input[name="xg-pathway"]').forEach((radio) => {
        radio.addEventListener("change", () => { selectedId = radio.value; paintSheet(); });
      });
      const cta = overlay.querySelector("[data-xg-cta]");
      if (cta) cta.addEventListener("click", () => selectPathway(session.id, selectedId, cta));
    };
    paintSheet();
  }

  async function selectPathway(sessionId, pathwayId, button) {
    button.disabled = true;
    button.textContent = "Đang dựng…";
    try {
      const raw = await api.xuongSelect(sessionId, pathwayId);
      if (!raw || !raw.project || !raw.reference) throw new Error("Phản hồi dựng sản phẩm không đúng hợp đồng.");
      const project = normalizeProject(raw.project);
      const reference = referenceModel(normalizeReference(raw.reference));
      showReferenceStep(project, reference);
    } catch (error) {
      toast(error.message || "Không dựng được sản phẩm.", "err");
      button.disabled = false;
      button.textContent = "Dựng bản của em";
    }
  }

  // Mẫu hành vi: what the product should do — explicitly NOT the student's run.
  function showReferenceStep(project, reference) {
    overlay.innerHTML = sheetShell(
      reference
        ? referenceHtml(reference)
        : `<div class="xg-empty"><b>Chưa có mẫu hành vi</b><span>Vào xưởng và chạy build để xem bản của em.</span></div>`,
      {
        title: "Mẫu hành vi của sản phẩm",
        sub: "Đây là bản tham chiếu để em biết đích đến. Nó không chạy code của em.",
        cta: { label: "Vào xưởng →", disabled: false, reason: "" },
      }
    );
    overlay.querySelector("[data-xg-cta]").addEventListener("click", () => {
      closeOverlay();
      openProject(project.id);
    });
  }

  // ---- S5 -----------------------------------------------------------------

  function workspaceConfig(project, reference) {
    let live = project;
    let run = null;
    let observable = null;
    let recipe = null;
    let evidence = [];
    let controlState = {};
    let scenarioId = (live.scenarios[0] && live.scenarios[0].id) || "";
    let tab = "preview";
    let showReference = false;
    let checksBusy = false;
    let ws = null;

    const visibleFiles = live.files.filter((file) => (
      file.editable
      || /\.hpp$/i.test(file.path)
      || /requirement-change\.test\.cpp$/i.test(file.path)
    ));
    // contract filePath ↔ shell editor id (the shell slugifies ids).
    const editorIds = editorIdsForPaths(visibleFiles.map((f) => f.path));
    const pathById = new Map([...editorIds].map(([path, id]) => [id, path]));
    const editorIdOf = (filePath) => editorIds.get(filePath) || "";

    const activeFilePath = () => {
      const el = document.querySelector(".aw-file-tab.active");
      return el ? (pathById.get(el.dataset.awEditor) || "") : "";
    };

    // traceTotal survives replay: a frame only carries events up to its cursor.
    let traceTotal = null;
    const currentPreview = () => previewModel({ run, observable, recipe, totalEvents: traceTotal ?? undefined });
    // The shared activity shell renders status items as label + value. Keep the
    // v2 model's readable `text` name local to this adapter so the header never
    // shows three empty chips after a successful build.
    const statusItems = () => statusStripModel(live, run, scenarioId).map((item) => ({
      ...item,
      value: item.value == null ? item.text : item.value,
    }));

    // --- right rail ---------------------------------------------------------

    function railHtml() {
      const referenceAvailable = Boolean(reference && reference.frames.length);
      // The tab carries the count so the student can see requirements move
      // without leaving Preview. It is a summary of evidence already computed,
      // never a second verdict — the verdict itself stays inside Checks.
      const checks = requirementsModel(live, evidence);
      const previewBody = showReference && referenceAvailable
        ? `<div class="xg-prov-badge" data-provenance="reference">${escapeHtml(reference.provenanceLabel)}</div>
           ${reference.frames.map((frame) => `<figure class="xg-frame">${renderPreview(frame.preview)}<figcaption>${escapeHtml(frame.caption)}</figcaption></figure>`).join("")}`
        : `<div class="xg-prov-badge" data-provenance="user">Bản của em · chạy source hiện tại</div>
           ${renderPreview(currentPreview())}`;

      return `
        <div class="xg-rail">
          <div class="xg-tabs" role="tablist">
            <button type="button" class="xg-tab${tab === "preview" ? " is-active" : ""}" data-xg-tab="preview" role="tab" aria-selected="${tab === "preview"}">Preview</button>
            <button type="button" class="xg-tab${tab === "checks" ? " is-active" : ""}" data-xg-tab="checks" role="tab" aria-selected="${tab === "checks"}">Checks${checks.total ? `<i class="xg-tab-count">${checks.met}/${checks.total}</i>` : ""}</button>
            <button type="button" class="xg-tab${tab === "logs" ? " is-active" : ""}" data-xg-tab="logs" role="tab" aria-selected="${tab === "logs"}">Logs</button>
          </div>
          ${tab === "preview"
            ? `<div class="xg-panel">
                 ${referenceAvailable ? `<div class="xg-prov-switch">
                   <button type="button" class="xg-prov-btn${showReference ? "" : " is-active"}" data-xg-prov="user">Bản của em</button>
                   <button type="button" class="xg-prov-btn${showReference ? " is-active" : ""}" data-xg-prov="reference">Mẫu hành vi</button>
                 </div>` : ""}
                 ${showReference ? "" : scenarioPickerHtml(live, scenarioId)}
                 ${previewBody}
               </div>`
            : tab === "checks"
              ? `<div class="xg-panel">${checksHtml(live, evidence, checksBusy)}</div>`
              : `<div class="xg-panel">${logsHtml(run)}</div>`}
        </div>`;
    }

    function paintRail(host) {
      if (!host) return;
      host.innerHTML = railHtml();

      host.querySelectorAll("[data-xg-tab]").forEach((button) => button.addEventListener("click", () => {
        tab = button.dataset.xgTab;
        paintRail(host);
      }));
      host.querySelectorAll("[data-xg-prov]").forEach((button) => button.addEventListener("click", () => {
        showReference = button.dataset.xgProv === "reference";
        paintRail(host);
      }));
      host.querySelectorAll("[data-xp-step]").forEach((button) => button.addEventListener("click", () => {
        stepCursor(button.dataset.xpStep === "next" ? 1 : -1);
      }));
      host.querySelectorAll("[data-xp-anchor]").forEach((button) => button.addEventListener("click", () => {
        jumpToAnchor(button.dataset.xpAnchor);
      }));
      // The failing entity IS the error's location, so clicking it in the
      // drawing does what clicking its anchor card does. Entities without an
      // anchor stay inert rather than jumping somewhere arbitrary.
      host.querySelectorAll("[data-xp-entity]").forEach((node) => node.addEventListener("click", () => {
        const anchor = (observable ? observable.anchors : []).find((item) => item.entityId === node.dataset.xpEntity);
        if (anchor) jumpToAnchor(anchor.id);
      }));
      host.querySelectorAll("[data-xp-relation]").forEach((node) => node.addEventListener("click", () => {
        const anchor = (observable ? observable.anchors : []).find((item) => item.entityId === node.dataset.xpRelation);
        if (anchor) jumpToAnchor(anchor.id);
      }));
      host.querySelectorAll("[data-xp-anchor-replay]").forEach((button) => button.addEventListener("click", () => {
        replayTo(Math.min(Number(button.dataset.xpEventIndex) + 1, traceLength()));
      }));
      const scrub = host.querySelector("[data-xp-scrub]");
      if (scrub) scrub.addEventListener("change", () => replayTo(Number(scrub.value)));
      host.querySelectorAll("[data-xg-scenario]").forEach((button) => button.addEventListener("click", () => {
        if (button.dataset.xgScenario === scenarioId) return;
        scenarioId = button.dataset.xgScenario;
        // A different scenario is a different run: drop the old observation
        // instead of showing it under the new scenario's name.
        run = null; observable = null; recipe = null; traceTotal = null;
        repaint();
        if (ws) ws.execute("run");
      }));
      host.querySelectorAll("[data-xp-event]").forEach((row) => row.addEventListener("click", () => {
        replayTo(Number(row.dataset.xpEvent) + 1);
      }));
      host.querySelectorAll("[data-xp-input]").forEach((input) => input.addEventListener("change", () => {
        controlState[input.dataset.xpInput] = input.type === "checkbox" ? input.checked : input.value;
      }));
      const rerun = host.querySelector("[data-xp-rerun]");
      if (rerun) rerun.addEventListener("click", () => ws && ws.execute("run"));
      const checksBtn = host.querySelector("[data-xg-checks]");
      if (checksBtn) checksBtn.addEventListener("click", runChecks);
      const evolveBtn = host.querySelector("[data-xg-evolve]");
      if (evolveBtn) evolveBtn.addEventListener("click", () => runEvolve(evolveBtn));
    }

    const railHost = () => document.querySelector("#aw-controls");
    const repaint = () => {
      paintRail(railHost());
      if (ws && ws.isOpen) ws.setStatus(statusItems());
      paintRibbon();
      paintSpine();
      paintBuildDrawer();
    };

    // --- centre column ribbon ----------------------------------------------

    // The spine spans the whole workbench, so it is mounted above .aw-body
    // rather than inside any one column.
    function paintSpine() {
      const body = document.querySelector("#activity-workspace .aw-body");
      if (!body) return;
      let host = document.querySelector("#activity-workspace .xg-spine-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "xg-spine-host";
        body.insertAdjacentElement("beforebegin", host);
      }
      host.innerHTML = spineHtml(live);
    }

    function paintRibbon() {
      const toolbar = document.querySelector(".aw-code-col .aw-code-toolbar");
      if (!toolbar) return;
      let host = document.querySelector(".xg-ribbon-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "xg-ribbon-host";
        toolbar.insertAdjacentElement("afterend", host);
      }
      host.innerHTML = mappingRibbonHtml(live, activeFilePath());
      host.querySelectorAll("[data-xg-mapping]").forEach((chip) => chip.addEventListener("click", () => {
        const mapping = live.sourceMappings.find((m) => m.id === chip.dataset.xgMapping);
        if (mapping) openMapping(mapping);
      }));
    }

    function toolRailHtml() {
      return `<nav class="xg-toolrail" aria-label="Khu vực Xưởng">
        <button type="button" data-xg-jump="brief" aria-label="Mục tiêu" title="Mục tiêu"><span>M</span></button>
        <button type="button" class="is-active" data-xg-jump="code" aria-label="Code" title="Code"><span>&lt;/&gt;</span></button>
        <button type="button" data-xg-jump="preview" aria-label="Preview" title="Preview"><span>▶</span></button>
        <button type="button" data-xg-jump="checks" aria-label="Checks" title="Checks"><span>✓</span></button>
        <button type="button" data-xg-jump="logs" aria-label="Logs" title="Logs"><span>≡</span></button>
      </nav>`;
    }

    function paintBuildDrawer() {
      const shell = document.querySelector("#activity-workspace .aw-shell");
      if (!shell) return;
      let host = shell.querySelector(".xg-build-drawer");
      if (!host) {
        host = document.createElement("section");
        host.className = "xg-build-drawer";
        shell.append(host);
      }
      const build = buildOutputModel(run);
      const first = build.diagnostics[0];
      host.dataset.state = build.state;
      host.innerHTML = `
        <button type="button" class="xg-build-summary" data-xg-open-logs>
          <span class="xg-build-chevron" aria-hidden="true">⌄</span>
          <b>Build output</b>
          <i aria-hidden="true"></i>
          <strong>${escapeHtml(run ? build.label : "Chưa chạy build")}</strong>
          ${Number.isFinite(build.durationMs) ? `<time>${escapeHtml(String(build.durationMs))} ms</time>` : ""}
        </button>
        ${first ? `<pre>${escapeHtml(first.message)}</pre>` : ""}`;
      host.querySelector("[data-xg-open-logs]")?.addEventListener("click", () => {
        tab = "logs";
        paintRail(railHost());
      });
    }

    function mountWorkbenchChrome() {
      const shell = document.querySelector("#activity-workspace .aw-shell");
      if (!shell) return;
      shell.classList.add("xg-workbench");
      if (!shell.querySelector(".xg-toolrail")) {
        shell.querySelector(".aw-topbar")?.insertAdjacentHTML("afterend", toolRailHtml());
      }
      shell.querySelectorAll("[data-xg-jump]").forEach((button) => button.addEventListener("click", () => {
        const target = button.dataset.xgJump;
        shell.querySelectorAll("[data-xg-jump]").forEach((item) => item.classList.toggle("is-active", item === button));
        if (target === "brief") shell.querySelector(".aw-statement-col")?.scrollIntoView({ block: "nearest" });
        if (target === "code") ws && ws.selectRange(0, 0);
        if (["preview", "checks", "logs"].includes(target)) {
          tab = target;
          paintRail(railHost());
          shell.querySelector(".aw-result-col")?.scrollIntoView({ block: "nearest" });
        }
      }));
      shell.querySelector("[data-xg-open-origin]")?.addEventListener("click", () => {
        const mapping = live.sourceMappings[0];
        if (mapping) openMapping(mapping);
      });
      paintBuildDrawer();
    }

    // --- jump to symbol -----------------------------------------------------

    function openMapping(mapping) {
      if (!ws || !mapping.span) return;
      const editorId = editorIdOf(mapping.filePath);
      if (!editorId) {
        toast("Chỗ cần sửa nằm ở file không mở được ở đây.", "err");
        return;
      }
      const tabButton = document.querySelector(`[data-aw-editor="${CSS.escape(editorId)}"]`);
      if (tabButton && !tabButton.classList.contains("active")) tabButton.click();
      const range = spanToRange(ws.getCode(editorId), mapping.span);
      if (range) ws.selectRange(range.from, range.to, editorId);
      paintRibbon();
    }

    function jumpToAnchor(anchorId) {
      if (!observable) return;
      const target = anchorTargets(observable, live).find((a) => a.anchorId === anchorId);
      if (!target) {
        toast("Điểm lỗi này chưa gắn được vào code — không nhảy bừa.", "err");
        return;
      }
      openMapping({ filePath: target.jump.filePath, span: target.jump.span });
      replayTo(Math.min(target.eventIndex + 1, traceLength()));
    }

    // --- replay -------------------------------------------------------------

    const traceLength = () => (traceTotal ?? (observable ? observable.events.length : 0));

    function stepCursor(delta) {
      if (!observable) return;
      replayTo(Math.max(0, Math.min(traceLength(), observable.cursor + delta)));
    }

    async function replayTo(cursor) {
      if (!run || run.status !== "completed") return;
      try {
        const raw = await api.xuongReplay(live.id, run.id, cursor);
        const envelope = normalizeReplayEnvelope(raw);
        const frame = replayModel(envelope && envelope.replay);
        if (!frame) return;
        observable = frame.observable;
        recipe = frame.recipe;
        traceTotal = frame.totalEvents;
        repaint();
      } catch (error) {
        toast(error.message || "Không phát lại được.", "err");
      }
    }

    // --- run / checks -------------------------------------------------------

    async function runBuild() {
      const raw = await api.xuongRun(live.id, scenarioId, controlState);
      const envelope = normalizeRunEnvelope(raw);
      if (!envelope || !envelope.project || !envelope.run) throw new Error("Lần chạy trả về dữ liệu không đúng hợp đồng.");
      live = envelope.project || live;
      run = envelope.run;
      observable = envelope.observable;
      recipe = envelope.recipe;
      traceTotal = run.eventCount;
      showReference = false;
      tab = "preview";
      repaint();
      if (app.bus) app.bus.emit("xuong:project_ran", { projectId: live.id }); // funnel B (NCKH §5): project runs

      // Build console: compile/runtime only. Behaviour is in Preview.
      const build = buildOutputModel(run);
      return {
        verdict: BUILD_VERDICT[build.state] || "—",
        message: build.label,
        timeMs: build.durationMs,
        feedback: build.diagnostics.map((d) => d.message).join("\n"),
        results: [],
      };
    }

    async function runChecks() {
      checksBusy = true;
      tab = "checks";
      repaint();
      try {
        const raw = await api.xuongChecks(live.id, run ? run.id : undefined);
        live = normalizeProject(raw.project) || live;
        evidence = normalizeEvidenceList(raw.evidence);
      } catch (error) {
        toast(error.message || "Không chạy được Checks.", "err");
      } finally {
        checksBusy = false;
        repaint();
      }
    }

    // Unlocking the next stage is a backend decision: it only succeeds when the
    // registry has a further trusted scenario AND the current requirement has
    // real pass evidence. A refusal is shown as itself.
    async function runEvolve(button) {
      button.disabled = true;
      const previousLabel = button.textContent;
      button.textContent = "Đang mở…";
      try {
        const raw = await api.xuongEvolve(live.id);
        const next = normalizeProject(raw && raw.project);
        if (!next) throw new Error("Phản hồi mở rộng không đúng hợp đồng.");
        const opened = next.scenarios.length > live.scenarios.length;
        live = next;
        if (opened) {
          const editable = live.files.find((file) => file.editable);
          if (editable && ws) ws.setEditorValue(editorIdOf(editable.path), editable.source || "");
          scenarioId = next.scenarios[next.scenarios.length - 1].id;
          run = null; observable = null; recipe = null; traceTotal = null;
          tab = "preview";
          toast("Đã mở tình huống mới — chạy build để xem lời giải hiện tại còn đủ không.", "ok");
        } else {
          toast(next.nextAction.reason || "Chưa có tình huống kế tiếp trong catalog.", "warn");
        }
        repaint();
      } catch (error) {
        if (!(error && error.aborted)) toast(error.message || "Chưa mở được tình huống tiếp theo.", "err");
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }

    return {
      kind: "xuong",
      kicker: "Xưởng",
      title: live.display.label,
      briefHtml: focusRailHtml(live),
      activeEditorId: editorIdOf(((live.files.find((f) => f.editable) || live.files[0]) || {}).path),
      // A tab that says only `MemoryPool.hpp` makes a student guess why three
      // files exist and which one is theirs. The role comes first; the filename
      // stays in the tooltip and in the file map on the rail.
      editors: visibleFiles.map((file) => ({
        id: editorIdOf(file.path),
        fileName: file.path,
        label: file.path,
        shortLabel: tabLabelFor(live, file),
        code: file.source || "",
        readOnly: !file.editable,
        taskNote: file.editable
          ? `Chỉ sửa ${editableSymbolOf(live)} trong file này — hai file kia chỉ để đọc.`
          : file.display.description,
        saveCode: file.editable
          ? async (source) => {
              const raw = await api.xuongSaveFile(live.id, file.path, source, file.contentHash);
              live = normalizeProject(raw.project) || live;
              file.contentHash = (live.files.find((f) => f.path === file.path) || {}).contentHash;
              repaint();
            }
          : undefined,
      })),
      hideIo: true,
      hideToolGuide: true,
      hideReadyConsole: true,
      hideJudge: true,              // Checks lives in its own tab — no second verdict
      runLabel: "Chạy build",
      resultColTitle: "Preview sản phẩm",
      status: statusItems(),
      headerActions: [
        { label: "← Xưởng", onClick: () => { app.activityWorkspace.close({ notify: false }); if (app.openXuongList) app.openXuongList(); } },
      ],
      mountControls: (host, api2) => { ws = api2; paintRail(host); paintSpine(); },
      onActivate: (api2) => {
        ws = api2;
        mountWorkbenchChrome();
        paintRibbon();
        paintSpine();
        const editable = visibleFiles.find((file) => file.editable);
        const todoAt = editable && String(editable.source || "").indexOf("TODO Xưởng");
        if (editable && todoAt >= 0) {
          const lineEnd = String(editable.source).indexOf("\n", todoAt);
          ws.selectRange(todoAt, lineEnd < 0 ? todoAt + 24 : lineEnd, editorIdOf(editable.path));
        }
        const tabs = document.querySelector(".aw-file-tabs");
        const onTabClick = () => setTimeout(paintRibbon, 0);
        if (tabs) tabs.addEventListener("click", onTabClick);
        return () => { if (tabs) tabs.removeEventListener("click", onTabClick); };
      },
      run: runBuild,
    };
  }

  async function openProject(projectId) {
    if (!app.activityWorkspace) { toast("Workspace chưa sẵn sàng.", "err"); return; }
    app.activityWorkspace.openLoading({ kind: "xuong", kicker: "Xưởng", title: "Đang mở sản phẩm", message: "Đang tải brief, file và mẫu hành vi." });
    await ensurePreviewSurface();
    try {
      const raw = await api.xuongProject(projectId);
      const project = normalizeProject(raw.project);
      if (!project) throw new Error("Dữ liệu sản phẩm không đọc được.");
      // The reference is orientation, not a blocker: a missing storyboard must
      // not stop the student from opening the workbench.
      let reference = null;
      try {
        const refRaw = await api.xuongReference(projectId);
        const envelope = normalizeReferenceEnvelope(refRaw);
        reference = referenceModel(envelope && envelope.reference);
      } catch { reference = null; }
      await app.activityWorkspace.open(workspaceConfig(project, reference));
    } catch (error) {
      app.activityWorkspace.showError({
        kind: "xuong", kicker: "Xưởng", title: "Không mở được sản phẩm",
        message: error.message || "Lỗi không rõ.", retry: () => openProject(projectId),
      });
    }
  }

  // ---- S6 mount -----------------------------------------------------------

  async function mountList(host) {
    host.innerHTML = `<div class="xg-empty"><b>Đang tải Xưởng…</b></div>`;
    let projects = [];
    try {
      const raw = await api.xuongProjects();
      projects = (raw.projects || []).map(normalizeProject).filter(Boolean);
    } catch (error) {
      host.innerHTML = `<div class="xg-empty"><b>Không tải được danh sách sản phẩm</b><span>${escapeHtml(error.message || "")}</span></div>`;
      return;
    }
    host.innerHTML = listMarkup(projects);
    host.querySelector("[data-xg-start]")?.addEventListener("click", () => openPathways(null));
    host.querySelectorAll("[data-xg-project]").forEach((button) =>
      button.addEventListener("click", () => openProject(button.dataset.xgProject)));
  }

  overlay.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-xg-pick]");
    if (pick) openPathways(pick.dataset.xgPick);
  });

  app.xuong = { mountList, openPathways, openProject };
  app.openXuongPathways = openPathways;
  app.openXuongProject = openProject;
}
