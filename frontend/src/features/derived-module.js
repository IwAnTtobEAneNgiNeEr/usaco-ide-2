// derived-module.js — "Phát triển thành module" (Verified Artifact Loop, Phase 4).
//
// GridPathfinder is the one approved derived artifact (docs/VERIFIED-ARTIFACT-API.md
// §Derived GridPathfinder). It lives under the ORIGINAL problem's own folder
// (`derived/grid-pathfinder/`) — not a new Library entry. The backend scaffolds
// a fixed interface + reference source; the ONLY writable file is
// GridPathfinder.cpp (PUT /derived/:id/source). The student's original main.cpp
// is never touched. Everything shown (requirement, files, pass/fail, derivedFrom)
// is read straight from the derived-artifact API; nothing is fabricated here.
//
// The edit surface is a minimal monospace textarea bound to the same modal —
// deliberately NOT a second CodeMirror IDE. Work → Save (PUT) → Verify (run the
// current suite) → pass/fail, all on real check runs.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const ARTIFACT_ID = "grid-pathfinder";
const SOURCE_FILE = "GridPathfinder.cpp";
const CHANGE_REQUIREMENT = "allow-diagonal-v2";

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// The suite whose requirement is currently active (backend deriveStatus uses
// the same mapping): baseline until the diagonal change is activated.
function currentSuite(artifact) {
  return artifact && artifact.currentRequirementId === CHANGE_REQUIREMENT
    ? "requirement-change" : "baseline";
}

function suiteLabel(suite) {
  return suite === "requirement-change" ? "Requirement đổi (đi chéo)" : "Baseline (4 hướng)";
}

function renderRequirement(artifact) {
  const req = (artifact.requirements || []).find((r) => r.id === artifact.currentRequirementId);
  if (!req) return "";
  return `
    <div class="dm-requirement">
      <div class="dm-req-head">Requirement hiện hành: <b>${escapeHtml(req.id)}</b> <span class="an-dim">v${req.version} · ${escapeHtml(req.status)}</span></div>
      <p class="dm-req-brief">${escapeHtml(req.brief || "")}</p>
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
      <td>${escapeHtml(suiteLabel(r.suite))}</td>
      <td>${Math.round(r.timeMs || 0)}ms</td>
      <td>${escapeHtml(new Date(r.at).toLocaleString("vi-VN"))}</td>
    </tr>`).join("");
  return `<table class="an-trace-table dm-runs"><thead><tr><th>verdict</th><th>suite</th><th>time</th><th>lúc</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDerivedFrom(artifact) {
  const d = artifact.derivedFrom || {};
  return `<div class="dm-derived-from">
    <span class="an-dim">Phát triển từ:</span> <b>${escapeHtml(artifact.collection || d.problemId || "")}</b>
    <span class="an-dim">(evidence ${escapeHtml(d.evidenceId || "")}, verdict ${escapeHtml(d.verdict || "")})</span>
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
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Module dẫn xuất</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || "GridPathfinder")}</h2>
      <div class="an-sub"><span class="an-dim">Chỉ GridPathfinder.cpp sửa được; solution gốc (main.cpp) không bao giờ bị đụng.</span></div>
    </div>
    ${renderDerivedFrom(artifact)}
    ${renderRequirement(artifact)}
    ${renderFiles(artifact)}
    <div class="dm-status">Trạng thái: <b class="dm-status-${escapeHtml(artifact.derivedStatus)}">${escapeHtml(artifact.derivedStatus)}</b></div>
    ${renderRuns(artifact)}
    <div class="dm-cta">${renderNextAction(artifact.nextAction)}</div>
    <div class="rail-chips an-actions dm-secondary">
      <button type="button" class="rail-chip" data-dm-action="edit"><span class="rc-g">✎</span><span>Mở module để sửa</span></button>
      <button type="button" class="rail-chip" data-dm-action="verify-current"><span class="rc-g">▶</span><span>Chạy kiểm thử: ${escapeHtml(suiteLabel(suite))}</span></button>
    </div>`;

  body.querySelectorAll(".dm-file-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      body.querySelectorAll(".dm-file-tab").forEach((t) => t.classList.toggle("active", t === tab));
      const out = body.querySelector("#dm-file-body");
      if (out) out.textContent = clip(artifact.files[tab.dataset.file] || "", 2000);
    });
  });
}

// Edit view: minimal textarea for GridPathfinder.cpp only. Save → PUT → back to
// read view; the current-suite verify chip stays reachable for Work→Verify.
function renderEdit(body, artifact, source) {
  const suite = currentSuite(artifact);
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Sửa module — ${escapeHtml(SOURCE_FILE)}</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || "GridPathfinder")}</h2>
      <div class="an-sub"><span class="an-dim">Requirement: ${escapeHtml(suiteLabel(suite))}. main.cpp của bài gốc không thay đổi khi bạn lưu.</span></div>
    </div>
    ${renderRequirement(artifact)}
    <textarea class="dm-edit-area" id="dm-edit-area" spellcheck="false">${escapeHtml(source)}</textarea>
    <div class="dm-cta"><button type="button" class="mo-next" data-dm-action="save">
      <span class="mo-next-kicker">Nước tiếp theo</span>
      <span class="mo-next-title">Lưu &amp; chạy kiểm thử</span>
      <span class="mo-next-why">Ghi GridPathfinder.cpp rồi chấm lại suite ${escapeHtml(suiteLabel(suite))}</span>
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
  let editing = false;

  async function reloadRead(pid) {
    editing = false;
    body.innerHTML = `<div class="an-note an-wait">Đang tải module…</div>`;
    try {
      const { artifact } = await api.getDerivedArtifact(pid, ARTIFACT_ID);
      currentArtifact = artifact;
      if (app.state.currentId !== pid || modal.classList.contains("hidden")) return;
      renderRead(body, artifact);
    } catch (err) {
      body.innerHTML = `<div class="an-note">Không tải được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    }
  }

  async function openEdit(pid) {
    body.innerHTML = `<div class="an-note an-wait">Đang mở ${escapeHtml(SOURCE_FILE)}…</div>`;
    try {
      const src = await api.getDerivedSource(pid, ARTIFACT_ID);
      if (app.state.currentId !== pid || modal.classList.contains("hidden")) return;
      editing = true;
      renderEdit(body, currentArtifact, src.source || "");
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
      await api.saveDerivedSource(pid, ARTIFACT_ID, source);
      if (thenVerify) await api.verifyDerivedArtifact(pid, ARTIFACT_ID, currentSuite(currentArtifact));
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Lưu thất bại.", "err");
    }
    if (app.state.currentId === pid) await reloadRead(pid);
  }

  async function verifyCurrent(pid) {
    try {
      await api.verifyDerivedArtifact(pid, ARTIFACT_ID, currentSuite(currentArtifact));
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
      case "open-derived-work":          // backend "Sửa GridPathfinder" == Work
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
      case "activate-requirement-change":
        try { await api.activateRequirementChange(pid, ARTIFACT_ID, CHANGE_REQUIREMENT); }
        catch (err) { app.toast && app.toast((err && err.message) || "Kích hoạt thất bại.", "err"); }
        if (app.state.currentId === pid) await reloadRead(pid);
        break;
      default:
        actionBtn.disabled = false;
    }
  });

  // evidenceRef: `.evidence` from a full Judge AC response ({ id, href, ... }).
  app.openDerivedModule = async (evidenceRef) => {
    const pid = app.state.currentId;
    if (!pid || !evidenceRef || !evidenceRef.id) return;
    modal.classList.remove("hidden");
    body.innerHTML = `<div class="an-note an-wait">Đang mở module…</div>`;
    try {
      const { artifacts } = await api.derivedArtifacts(pid);
      const exists = artifacts.find((a) => a.id === ARTIFACT_ID);
      if (!exists) {
        await api.createGridPathfinder(pid, evidenceRef.id);
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
    await reloadRead(pid);
  };
}
