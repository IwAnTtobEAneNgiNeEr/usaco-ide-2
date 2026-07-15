// derived-module.js — "Phát triển thành module" (Verified Artifact Loop, Phase 4 + B4).
//
// Three contract modules, one per concept (core/concept-detect.js):
//   bfs        → grid-pathfinder        (GridPathfinder)
//   dijkstra   → weighted-graph-router  (WeightedGraphRouter)
//   prefix-sum → range-sum-module       (RangeSum)
// Each lives under the ORIGINAL problem's own folder (`derived/<module>/`) —
// not a new Library entry. The backend scaffolds a fixed interface; the ONLY
// writable file is the module source (PUT /derived/:id/source — the response's
// own `file` field names it). The student's original main.cpp is never touched.
// Everything shown (requirement, files, pass/fail, derivedFrom) is read
// straight from the derived-artifact API; nothing is fabricated here.
//
// The edit surface is a minimal monospace textarea bound to the same modal —
// deliberately NOT a second CodeMirror IDE. Work → Save (PUT) → Verify (run the
// current suite) → pass/fail, all on real check runs. One primary CTA per
// state, always the backend's own `nextAction`.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";
import { detectConcept, moduleForConcept, conceptInfo } from "../core/concept-detect.js";

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// ---- requirement / suite helpers (generic over the artifact's own data) ------

// The artifact's FIRST requirement is its baseline; any activated requirement
// beyond it runs as the "requirement-change" suite (same mapping the backend's
// verify route uses).
function baselineId(artifact) {
  const reqs = (artifact && artifact.requirements) || [];
  return reqs.length ? reqs[0].id : null;
}

function currentSuite(artifact) {
  const base = baselineId(artifact);
  return artifact && base && artifact.currentRequirementId && artifact.currentRequirementId !== base
    ? "requirement-change" : "baseline";
}

// The next requirement change that can be activated (proposed, not current).
function pendingChange(artifact) {
  const reqs = (artifact && artifact.requirements) || [];
  return reqs.find((r) => r.id !== artifact.currentRequirementId && r.status !== "retired" && r.id !== baselineId(artifact)) || null;
}

function suiteLabel(artifact, suite) {
  if (suite !== "requirement-change") return "Baseline";
  const req = ((artifact && artifact.requirements) || []).find((r) => r.id === artifact.currentRequirementId);
  return req ? `Requirement đổi (${req.id})` : "Requirement đổi";
}

// The one editable source file — read from the artifact's own file list (the
// .cpp that is not a test/harness file), confirmed by GET /source's `file`.
function sourceFileOf(artifact) {
  const names = Object.keys((artifact && artifact.files) || {});
  return names.find((n) => /\.(cpp|cc)$/i.test(n) && !/test/i.test(n)) || names[0] || "module.cpp";
}

function renderRequirement(artifact) {
  const req = (artifact.requirements || []).find((r) => r.id === artifact.currentRequirementId);
  if (!req) return "";
  // GridPathfinder manifests carry brief/version/acceptanceCriteria; the newer
  // WeightedGraphRouter/RangeSum manifests carry summary — read both shapes.
  return `
    <div class="dm-requirement">
      <div class="dm-req-head">Requirement hiện hành: <b>${escapeHtml(req.id)}</b> <span class="an-dim">${req.version ? `v${req.version} · ` : ""}${escapeHtml(req.status)}</span></div>
      <p class="dm-req-brief">${escapeHtml(req.brief || req.summary || "")}</p>
      ${req.acceptanceCriteria && req.acceptanceCriteria.length ? `<ul class="dm-req-ac">${req.acceptanceCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
    </div>`;
}

function renderFiles(artifact) {
  const names = Object.keys(artifact.files || {});
  const active = names[0];
  return `
    <div class="dm-files">
      <div class="dm-file-tabs">${names.map((n, i) => `<button type="button" class="dm-file-tab${i === 0 ? " active" : ""}" data-file="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div>
      <pre class="mo-pre dm-file-body" id="dm-file-body">${escapeHtml(clip(artifact.files[active] || "", 2000))}</pre>
    </div>`;
}

function renderRuns(artifact) {
  const runs = artifact.runs || [];
  if (!runs.length) return `<div class="an-note">Chưa có lần verify nào.</div>`;
  const rows = runs.slice(0, 6).map((r) => `
    <tr>
      <td><span class="vbadge v-${escapeHtml(r.verdict)}">${escapeHtml(r.verdict)}</span></td>
      <td>${escapeHtml(r.suite === "requirement-change" ? "Requirement đổi" : "Baseline")}</td>
      <td>${Math.round(r.timeMs || 0)}ms</td>
      <td>${escapeHtml(new Date(r.at).toLocaleString("vi-VN"))}</td>
    </tr>`).join("");
  return `<table class="an-trace-table dm-runs"><thead><tr><th>verdict</th><th>suite</th><th>time</th><th>lúc</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDerivedFrom(artifact) {
  const d = artifact.derivedFrom || {};
  return `<div class="dm-derived-from">
    <span class="an-dim">Phát triển từ:</span> <b>${escapeHtml(d.sourceTitle || d.problemId || artifact.collection || "")}</b>
    <span class="an-dim">(evidence ${escapeHtml(d.evidenceId || "")}${d.verdict ? `, verdict ${escapeHtml(d.verdict)}` : ""})</span>
    <button type="button" class="rail-chip" id="dm-open-original"><span class="rc-g">‹/›</span><span>Mở bản gốc</span></button>
  </div>`;
}

function renderNextAction(nextAction) {
  if (!nextAction) return "";
  return `<button type="button" class="mo-next" data-dm-action="${escapeHtml(nextAction.id || "")}">
      <span class="mo-next-kicker">Nước tiếp theo</span>
      <span class="mo-next-title">${escapeHtml(nextAction.label || "")}</span>
      <span class="mo-next-why">${escapeHtml(nextAction.reason || "")}</span>
    </button>`;
}

// Read view: requirement + files + status + runs + ONE primary CTA (backend
// nextAction) + two quiet secondaries (edit, verify current suite).
function renderRead(body, artifact) {
  const suite = currentSuite(artifact);
  const srcFile = sourceFileOf(artifact);
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Module dẫn xuất</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || artifact.id || "Module")}</h2>
      <div class="an-sub"><span class="an-dim">Chỉ ${escapeHtml(srcFile)} sửa được; solution gốc (main.cpp) không bao giờ bị đụng.</span></div>
    </div>
    ${renderDerivedFrom(artifact)}
    ${renderRequirement(artifact)}
    ${renderFiles(artifact)}
    <div class="dm-status">Trạng thái: <b class="dm-status-${escapeHtml(artifact.derivedStatus)}">${escapeHtml(artifact.derivedStatus)}</b></div>
    ${renderRuns(artifact)}
    <div class="dm-cta">${renderNextAction(artifact.nextAction)}</div>
    <div class="rail-chips an-actions dm-secondary">
      <button type="button" class="rail-chip" data-dm-action="edit"><span class="rc-g">✎</span><span>Mở module để sửa</span></button>
      <button type="button" class="rail-chip" data-dm-action="verify-current"><span class="rc-g">▶</span><span>Chạy kiểm thử: ${escapeHtml(suiteLabel(artifact, suite))}</span></button>
    </div>`;

  body.querySelectorAll(".dm-file-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      body.querySelectorAll(".dm-file-tab").forEach((t) => t.classList.toggle("active", t === tab));
      const out = body.querySelector("#dm-file-body");
      if (out) out.textContent = clip(artifact.files[tab.dataset.file] || "", 2000);
    });
  });
}

// Edit view: minimal textarea for the module source only. Save → PUT → back to
// read view; the current-suite verify chip stays reachable for Work→Verify.
function renderEdit(body, artifact, source, srcFile) {
  const suite = currentSuite(artifact);
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Sửa module — ${escapeHtml(srcFile)}</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || artifact.id || "Module")}</h2>
      <div class="an-sub"><span class="an-dim">Requirement: ${escapeHtml(suiteLabel(artifact, suite))}. main.cpp của bài gốc không thay đổi khi bạn lưu.</span></div>
    </div>
    ${renderRequirement(artifact)}
    <textarea class="dm-edit-area" id="dm-edit-area" spellcheck="false">${escapeHtml(source)}</textarea>
    <div class="dm-cta"><button type="button" class="mo-next" data-dm-action="save">
      <span class="mo-next-kicker">Nước tiếp theo</span>
      <span class="mo-next-title">Lưu &amp; chạy kiểm thử</span>
      <span class="mo-next-why">Ghi ${escapeHtml(srcFile)} rồi chấm lại suite ${escapeHtml(suiteLabel(artifact, suite))}</span>
    </button></div>
    <div class="rail-chips an-actions dm-secondary">
      <button type="button" class="rail-chip" data-dm-action="save-only"><span class="rc-g">⭑</span><span>Chỉ lưu</span></button>
      <button type="button" class="rail-chip" data-dm-action="cancel-edit"><span class="rc-g">✕</span><span>Hủy sửa</span></button>
    </div>`;
}

export function initDerivedModule(app) {
  const modal = document.getElementById("derived-module-modal");
  const body = document.getElementById("derived-module-body");
  if (!modal || !body) return;

  const close = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  const closeBtn = document.getElementById("derived-module-close");
  if (closeBtn) closeBtn.addEventListener("click", close);

  let currentArtifact = null;
  let currentModuleId = null;
  let currentSrcFile = null;

  async function reloadRead(pid) {
    body.innerHTML = `<div class="an-note an-wait">Đang tải module…</div>`;
    try {
      const { artifact } = await api.getDerivedArtifact(pid, currentModuleId);
      currentArtifact = artifact;
      if (app.state.currentId !== pid || modal.classList.contains("hidden")) return;
      renderRead(body, artifact);
    } catch (err) {
      body.innerHTML = `<div class="an-note">Không tải được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    }
  }

  async function openEdit(pid) {
    body.innerHTML = `<div class="an-note an-wait">Đang mở source module…</div>`;
    try {
      const src = await api.getDerivedSource(pid, currentModuleId);
      if (app.state.currentId !== pid || modal.classList.contains("hidden")) return;
      currentSrcFile = src.file || sourceFileOf(currentArtifact);
      renderEdit(body, currentArtifact, src.source || "", currentSrcFile);
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Không mở được source.", "err");
      await reloadRead(pid);
    }
  }

  // Save the textarea, optionally run the current suite, then return to read.
  async function save(pid, thenVerify) {
    const area = body.querySelector("#dm-edit-area");
    if (!area) return;
    const source = area.value;
    body.innerHTML = `<div class="an-note an-wait">Đang lưu & ${thenVerify ? "chạy kiểm thử" : "tải lại"}…</div>`;
    try {
      await api.saveDerivedSource(pid, currentModuleId, source);
      if (thenVerify) await api.verifyDerivedArtifact(pid, currentModuleId, currentSuite(currentArtifact));
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Lưu thất bại.", "err");
    }
    if (app.state.currentId === pid) await reloadRead(pid);
  }

  async function verifyCurrent(pid) {
    try {
      await api.verifyDerivedArtifact(pid, currentModuleId, currentSuite(currentArtifact));
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Chạy kiểm thử thất bại.", "err");
    }
    if (app.state.currentId === pid) await reloadRead(pid);
  }

  body.addEventListener("click", async (e) => {
    if (e.target.closest("#dm-open-original")) {
      const pid = app.state.currentId;
      close();
      if (app.selectProblem && currentArtifact && currentArtifact.derivedFrom) {
        app.selectProblem(currentArtifact.derivedFrom.problemId || pid);
      }
      return;
    }
    const actionBtn = e.target.closest("[data-dm-action]");
    if (!actionBtn) return;
    const pid = app.state.currentId;
    const action = actionBtn.dataset.dmAction;
    actionBtn.disabled = true;
    switch (action) {
      case "edit":
      case "open-derived-work":          // backend "Sửa <module>" == Work
        await openEdit(pid); break;
      case "save":                        // Save + verify current suite
        await save(pid, true); break;
      case "save-only":
        await save(pid, false); break;
      case "cancel-edit":
        await reloadRead(pid); break;
      case "verify-current":
      case "verify-derived-baseline":
      case "continue-from-derived":
        await verifyCurrent(pid); break;
      case "activate-requirement-change": {
        // The changeId comes from the artifact's OWN requirement list — never a
        // hard-coded id, so every contract module reuses this path.
        const change = pendingChange(currentArtifact);
        if (!change) { app.toast && app.toast("Không có requirement change nào để kích hoạt.", "err"); break; }
        try { await api.activateRequirementChange(pid, currentModuleId, change.id); }
        catch (err) { app.toast && app.toast((err && err.message) || "Kích hoạt thất bại.", "err"); }
        if (app.state.currentId === pid) await reloadRead(pid);
        break;
      }
      default:
        actionBtn.disabled = false;
    }
  });

  // evidenceRef: `.evidence` from a full Judge AC response ({ id, href, ... }),
  // or null to only OPEN an already-created module (Tools menu / after reload).
  // moduleId (optional): explicit target; otherwise the problem's concept picks
  // it (bfs → grid-pathfinder, dijkstra → weighted-graph-router, prefix-sum →
  // range-sum-module). Unknown concept + no existing artifact = honest no.
  app.openDerivedModule = async (evidenceRef, moduleId) => {
    const pid = app.state.currentId;
    if (!pid) return;
    modal.classList.remove("hidden");
    body.innerHTML = `<div class="an-note an-wait">Đang mở module…</div>`;

    const concept = detectConcept(app.state.meta || {});
    const conceptModule = moduleForConcept(concept);
    let target = moduleId || (conceptModule && conceptModule.id) || null;

    try {
      const { artifacts } = await api.derivedArtifacts(pid);
      const existing = (artifacts || []).find((a) => a.id === target) || (artifacts || [])[0] || null;
      if (existing) {
        target = existing.id;
      } else if (!evidenceRef || !evidenceRef.id) {
        // No stored artifact and no fresh AC evidence in this session — creating
        // one REQUIRES full Judge AC evidence (backend enforces it), so say so.
        close();
        app.toast && app.toast("Bài này chưa có module dẫn xuất — Judge đạt AC rồi bấm “Phát triển thành module”.", "err");
        return;
      } else {
        if (!target) {
          close();
          app.toast && app.toast("Chưa có module dẫn xuất cho dạng bài này — gắn topic (bfs / dijkstra / prefix sum) để mở khóa.", "err");
          return;
        }
        await api.createDerivedModule(pid, target, evidenceRef.id);
      }
    } catch (err) {
      // 409 = already exists (race) — fall through to reload, which surfaces
      // any OTHER real error via its own catch.
      if (!(err && err.status === 409)) {
        body.innerHTML = `<div class="an-note">Không tạo được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
        return;
      }
    }
    if (app.state.currentId !== pid) return;
    currentModuleId = target;
    await reloadRead(pid);
  };

  // Tools ▾ → "⑂ Module dẫn xuất": the persistent way back into a module after
  // reload (the moment-card chip only exists right after a judge).
  const toolsBtn = document.getElementById("btn-derived-module");
  if (toolsBtn) toolsBtn.addEventListener("click", () => {
    const ev = app.state.lastJudge && app.state.lastJudge.evidence;
    app.openDerivedModule(ev && app.state.lastJudge.verdict === "AC" ? ev : null);
  });

  // The moment card asks this to label its secondary chip honestly.
  app.derivedModuleLabelFor = (meta) => {
    const m = moduleForConcept(detectConcept(meta || {}));
    return m ? `Phát triển thành module ${m.label}` : "Phát triển thành module";
  };
}
