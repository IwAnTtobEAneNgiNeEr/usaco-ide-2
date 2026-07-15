// derived-module.js — "Phát triển thành module" (Verified Artifact Loop, Phase 4).
//
// GridPathfinder is the one approved derived artifact (docs/VERIFIED-ARTIFACT-API.md
// §Derived GridPathfinder). It lives under the ORIGINAL problem's own folder
// (`derived/grid-pathfinder/`) — not a new Library entry — and the backend
// scaffolds a fixed interface/reference source; there is no write endpoint for
// it, so this surface never edits GridPathfinder.cpp or the student's main.cpp.
// Everything shown (requirement text, files, pass/fail, derivedFrom) is read
// straight from `GET/POST /derived/grid-pathfinder*`.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const ARTIFACT_ID = "grid-pathfinder";

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
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

function suiteLabel(suite) {
  return suite === "requirement-change" ? "Requirement đổi (đi chéo)" : "Baseline (4 hướng)";
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
  return `<div class="rail-chips an-actions">
    <button type="button" class="mo-next" data-dm-action="${escapeHtml(nextAction.id || "")}">
      <span class="mo-next-kicker">Nước tiếp theo</span>
      <span class="mo-next-title">${escapeHtml(nextAction.label || "")}</span>
      <span class="mo-next-why">${escapeHtml(nextAction.reason || "")}</span>
    </button>
  </div>`;
}

function render(app, body, artifact) {
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Module dẫn xuất</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || "GridPathfinder")}</h2>
      <div class="an-sub"><span class="an-dim">Interface cố định + reference đúng — không sinh bởi AI, không ghi đè solution gốc.</span></div>
    </div>
    ${renderDerivedFrom(artifact)}
    ${renderRequirement(artifact)}
    ${renderFiles(artifact)}
    <div class="dm-status">Trạng thái: <b>${escapeHtml(artifact.derivedStatus)}</b></div>
    ${renderRuns(artifact)}
    ${renderNextAction(artifact.nextAction)}`;

  body.querySelectorAll(".dm-file-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      body.querySelectorAll(".dm-file-tab").forEach((t) => t.classList.toggle("active", t === tab));
      const out = body.querySelector("#dm-file-body");
      if (out) out.textContent = clip(artifact.files[tab.dataset.file] || "", 2000);
    });
  });
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

  async function reload(pid) {
    body.innerHTML = `<div class="an-note an-wait">Đang tải module…</div>`;
    try {
      const { artifact } = await api.getDerivedArtifact(pid, ARTIFACT_ID);
      currentArtifact = artifact;
      if (app.state.currentId !== pid || !modal.isConnected) return;
      render(app, body, artifact);
    } catch (err) {
      body.innerHTML = `<div class="an-note">Không tải được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    }
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
    try {
      if (action === "verify-derived-baseline" || action === "open-derived-work" || action === "continue-from-derived") {
        // "continue-from-derived" and "open-derived-work" both mean "run the
        // current requirement's suite" — the manifest's currentRequirementId
        // already encodes which one that is (gridPathfinder.deriveStatus).
        const suite = currentArtifact && currentArtifact.currentRequirementId === "allow-diagonal-v2"
          ? "requirement-change" : "baseline";
        await api.verifyDerivedArtifact(pid, ARTIFACT_ID, suite);
      } else if (action === "activate-requirement-change") {
        await api.activateRequirementChange(pid, ARTIFACT_ID, "allow-diagonal-v2");
      }
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Thao tác thất bại.", "err");
    }
    if (app.state.currentId === pid) await reload(pid);
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
      // 409 = already exists (race) — fall through to reload, which will
      // surface any OTHER real error via its own catch.
      if (!(err && err.status === 409)) {
        body.innerHTML = `<div class="an-note">Không tạo được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
        return;
      }
    }
    if (app.state.currentId !== pid) return;
    await reload(pid);
  };
}
