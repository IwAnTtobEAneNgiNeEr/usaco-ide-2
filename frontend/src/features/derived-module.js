// derived-module.js — the ONE module workspace (Verified Artifact Loop P4 + Applied Algorithms v1).
//
// Two scopes share this surface, one render path, one CTA grammar:
//   • problem-derived — modules under an OJ problem's folder (`derived/<module>/`),
//     reached from the moment card / Tools ▾ after a full Judge AC.
//   • standalone      — the Applied Algorithms catalog modules (/api/modules):
//     grid-pathfinder, weighted-graph-router, range-sum-module — opened straight
//     from the Library, no OJ problem required.
// The scope difference is ONE store adapter (which endpoints back load/save/
// verify/activate); everything rendered comes from the artifact payload itself.
//
// Flow (B3): open → read (requirement + files + history) → edit source → save →
// verify → fail evidence (stdout/stderr) → fix → pass → activate requirement
// change (evolve). One primary CTA per state — always the backend's nextAction.
//
// Route Planner (B4): standalone weighted-graph-router only. It compiles and
// runs the REAL module code on the user's dataset via POST /simulate — no
// simulated output, and it stays gated behind a verified baseline (the server
// enforces this; the UI says so honestly).

import { api } from "../api.js";
import { escapeHtml } from "../md.js";
import { detectConcept, moduleForConcept } from "../core/concept-detect.js";
import {
  currentSuite, pendingChange, buildRouteDataset, normalizeSimulateResult,
} from "../core/module-model.js";

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function suiteLabel(artifact, suite) {
  if (suite !== "requirement-change") return "Baseline";
  const req = ((artifact && artifact.requirements) || []).find((r) => r.id === artifact.currentRequirementId);
  return req ? `Requirement đổi (${req.id})` : "Requirement đổi";
}

// The one editable source file — the .cpp that is not a test/harness file,
// confirmed by GET /source's `file`.
function sourceFileOf(artifact) {
  const names = Object.keys((artifact && artifact.files) || {});
  return names.find((n) => /\.(cpp|cc)$/i.test(n) && !/test/i.test(n)) || names[0] || "module.cpp";
}

// ---- store adapters -----------------------------------------------------------

function problemStore(app, pid, moduleId) {
  return {
    scope: "problem",
    id: moduleId,
    stillCurrent: () => app.state.currentId === pid,
    load: async () => (await api.getDerivedArtifact(pid, moduleId)).artifact,
    source: () => api.getDerivedSource(pid, moduleId),
    save: (source) => api.saveDerivedSource(pid, moduleId, source),
    verify: (suite) => api.verifyDerivedArtifact(pid, moduleId, suite),
    activate: (changeId) => api.activateRequirementChange(pid, moduleId, changeId),
  };
}

function standaloneStore(artifactId) {
  let opened = false; // first load materializes via POST /open (idempotent)
  return {
    scope: "standalone",
    id: artifactId,
    stillCurrent: () => true, // not bound to the open problem
    load: async () => {
      if (!opened) {
        try { const r = await api.openModule(artifactId); opened = true; return r.artifact; }
        catch (err) { if (!(err && err.status === 404)) throw err; /* older backend: fall through to GET */ }
      }
      return (await api.getModule(artifactId)).artifact;
    },
    source: () => api.getModuleSource(artifactId),
    save: (source) => api.saveModuleSource(artifactId, source),
    verify: (suite) => api.verifyModule(artifactId, suite),
    activate: (changeId) => api.activateModuleRequirementChange(artifactId, changeId),
  };
}

// ---- render pieces (shared by both scopes) -------------------------------------

// Brief + interface + test intents (contract ModuleWorkspace) — rendered only
// when the payload carries them; older artifacts simply skip these blocks.
function renderBriefInterface(artifact) {
  const parts = [];
  if (artifact.brief) parts.push(`<p class="dm-brief">${escapeHtml(artifact.brief)}</p>`);
  const iface = artifact.interface;
  if (iface && Array.isArray(iface.entrypoints) && iface.entrypoints.length) {
    parts.push(`<div class="dm-iface"><span class="an-dim">Interface (${escapeHtml(iface.language || "cpp")}):</span> ${iface.entrypoints.map((e) => `<code>${escapeHtml(e)}</code>`).join(" · ")}</div>`);
  }
  const tests = artifact.tests;
  if (tests && (Array.isArray(tests.public) || Array.isArray(tests.hidden))) {
    const rows = [...(tests.public || []).map((t) => ({ ...t, kind: "public" })), ...(tests.hidden || []).map((t) => ({ ...t, kind: "hidden" }))]
      .map((t) => `<li><b>${escapeHtml(t.id)}</b> <span class="an-dim">(${t.kind === "hidden" ? "ẩn" : "công khai"})</span> — ${escapeHtml(t.intent || "")}</li>`).join("");
    if (rows) parts.push(`<div class="dm-tests"><div class="an-dim">Bộ kiểm thử:</div><ul>${rows}</ul></div>`);
  }
  return parts.length ? `<div class="dm-brief-block">${parts.join("")}</div>` : "";
}

function renderRequirement(artifact) {
  const req = (artifact.requirements || []).find((r) => r.id === artifact.currentRequirementId);
  if (!req) return "";
  return `
    <div class="dm-requirement">
      <div class="dm-req-head">Requirement hiện hành: <b>${escapeHtml(req.id)}</b> <span class="an-dim">${req.version ? `v${req.version} · ` : ""}${escapeHtml(req.status)}</span></div>
      <p class="dm-req-brief">${escapeHtml(req.brief || req.summary || "")}</p>
      ${req.acceptanceCriteria && req.acceptanceCriteria.length ? `<ul class="dm-req-ac">${req.acceptanceCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
    </div>`;
}

// All requirements, so the user sees where "evolve" goes next.
function renderRequirementLadder(artifact) {
  const reqs = artifact.requirements || [];
  if (reqs.length < 2) return "";
  const rows = reqs.map((r) => {
    const cur = r.id === artifact.currentRequirementId;
    return `<li class="dm-ladder-item ${cur ? "cur" : ""}"><b>${escapeHtml(r.id)}</b> <span class="an-dim">${escapeHtml(r.status)}</span>${cur ? ' <span class="dm-ladder-now">← đang làm</span>' : ""}</li>`;
  }).join("");
  return `<div class="dm-ladder"><div class="dm-ladder-head an-dim">Lộ trình requirement</div><ul>${rows}</ul></div>`;
}

function renderFiles(artifact) {
  const names = Object.keys(artifact.files || {});
  const active = names[0];
  return `
    <div class="dm-files">
      <div class="dm-file-tabs">${names.map((n, i) => `<button type="button" class="dm-file-tab${i === 0 ? " active" : ""}" data-file="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div>
      <pre class="mo-pre dm-file-body" id="dm-file-body">${escapeHtml(clip(artifact.files[active] || "", 6000))}</pre>
    </div>`;
}

function renderRuns(artifact) {
  const runs = artifact.runs || [];
  if (!runs.length) return `<div class="an-note">Chưa có lần verify nào — bấm chạy kiểm thử để có bằng chứng đầu tiên.</div>`;
  const rows = runs.slice(0, 6).map((r, i) => `
    <tr class="dm-run-row" data-run="${i}">
      <td><span class="vbadge v-${escapeHtml(r.verdict)}">${escapeHtml(r.verdict)}</span></td>
      <td>${escapeHtml(r.suite === "requirement-change" ? "Requirement đổi" : "Baseline")}</td>
      <td>${Math.round(r.timeMs || 0)}ms</td>
      <td>${escapeHtml(new Date(r.at).toLocaleString("vi-VN"))}</td>
    </tr>`).join("");
  return `<table class="an-trace-table dm-runs"><thead><tr><th>verdict</th><th>suite</th><th>time</th><th>lúc</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// The newest run's honest fail evidence (compiler/runtime output) — the thing
// the user actually needs to fix the module.
function renderLastEvidence(artifact) {
  const run = (artifact.runs || [])[0];
  if (!run || run.verdict === "AC") return "";
  const out = [run.stderr, run.stdout].filter((s) => s && s.trim()).join("\n").trim();
  return `
    <div class="dm-evidence">
      <div class="dm-evidence-head">Bằng chứng lần chạy gần nhất (<span class="vbadge v-${escapeHtml(run.verdict)}">${escapeHtml(run.verdict)}</span>)</div>
      <pre class="mo-pre dm-evidence-body">${escapeHtml(clip(out || "(không có output — kiểm tra assert trong file test)", 2500))}</pre>
    </div>`;
}

function renderProvenance(artifact, scope) {
  const d = artifact.derivedFrom;
  if (d && (d.problemId || d.sourceTitle)) {
    return `<div class="dm-derived-from">
      <span class="an-dim">Phát triển từ:</span> <b>${escapeHtml(d.sourceTitle || d.problemId)}</b>
      <span class="an-dim">(đã có lần chấm đạt)</span>
      <button type="button" class="rail-chip" id="dm-open-original"><span class="rc-g">‹/›</span><span>Mở bản gốc</span></button>
    </div>`;
  }
  return `<div class="dm-derived-from"><span class="an-dim">Nguồn:</span> <b>Bài thực hành mẫu</b><span class="an-dim"> — dùng để luyện với bộ test thật</span></div>`;
}

function renderNextAction(nextAction) {
  if (!nextAction) return "";
  return `<button type="button" class="mo-next" data-dm-action="${escapeHtml(nextAction.id || "")}">
      <span class="mo-next-kicker">Nước tiếp theo</span>
      <span class="mo-next-title">${escapeHtml(nextAction.label || "")}</span>
      <span class="mo-next-why">${escapeHtml(nextAction.reason || "")}</span>
    </button>`;
}

// ---- Route Planner (B4 — standalone weighted-graph-router only) ----------------

const PLANNER_DEFAULT = {
  nodeCount: 5,
  edges: [
    { from: 0, to: 1, weight: 4 }, { from: 0, to: 2, weight: 1 },
    { from: 2, to: 1, weight: 2 }, { from: 1, to: 3, weight: 5 },
    { from: 2, to: 3, weight: 8 }, { from: 3, to: 4, weight: 3 },
  ],
  source: 0,
  target: 4,
};

// Session-scoped planner state so re-render keeps the user's graph.
let plannerState = null;
let plannerResult = null; // { kind:"ok", data } | { kind:"error", message } | null

function plannerSvg(state, result) {
  const n = Math.max(1, Math.min(200, Number(state.nodeCount) || 1));
  const W = 460, H = 300, R = Math.min(W, H) / 2 - 34;
  const cx = W / 2, cy = H / 2;
  const pos = (i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const pathEdges = new Set();
  if (result && result.kind === "ok" && result.data.reachable) {
    const p = result.data.path;
    for (let i = 0; i + 1 < p.length; i += 1) pathEdges.add(`${p[i]}>${p[i + 1]}`);
  }
  const edgesSvg = state.edges.map((e) => {
    const u = Number(e.from), v = Number(e.to), w = Number(e.weight);
    if (!Number.isSafeInteger(u) || !Number.isSafeInteger(v) || u < 0 || v < 0 || u >= n || v >= n) return "";
    const [x1, y1] = pos(u), [x2, y2] = pos(v);
    const onPath = pathEdges.has(`${u}>${v}`);
    // shorten toward the target node so the arrowhead is visible
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const tx = x2 - (dx / len) * 16, ty = y2 - (dy / len) * 16;
    const mx = (x1 + tx) / 2, my = (y1 + ty) / 2;
    return `
      <line x1="${x1}" y1="${y1}" x2="${tx}" y2="${ty}" class="rp-edge${onPath ? " rp-edge-path" : ""}" marker-end="url(#rp-arrow${onPath ? "-hot" : ""})"></line>
      <text x="${mx}" y="${my - 4}" class="rp-w${onPath ? " rp-w-path" : ""}">${Number.isSafeInteger(w) ? w : "?"}</text>`;
  }).join("");
  const nodesSvg = Array.from({ length: n }, (_, i) => {
    const [x, y] = pos(i);
    const role = i === Number(state.source) ? "src" : i === Number(state.target) ? "dst" : "";
    const onPath = result && result.kind === "ok" && result.data.reachable && result.data.path.includes(i);
    return `<g class="rp-node ${role} ${onPath ? "hot" : ""}" data-node="${i}" tabindex="-1">
        <circle cx="${x}" cy="${y}" r="13"></circle>
        <text x="${x}" y="${y + 4}">${i}</text>
      </g>`;
  }).join("");
  return `
    <svg viewBox="0 0 ${W} ${H}" class="rp-svg" role="img" aria-label="Đồ thị Route Planner: ${n} đỉnh, ${state.edges.length} cạnh">
      <defs>
        <marker id="rp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>
        <marker id="rp-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>
      </defs>
      ${edgesSvg}${nodesSvg}
    </svg>`;
}

function plannerResultHtml(result) {
  if (!result) return `<div class="an-note">Chưa chạy — chỉnh đồ thị rồi bấm “Chạy module thật”.</div>`;
  if (result.kind === "error") return `<div class="rp-result rp-err">✕ ${escapeHtml(result.message)}</div>`;
  const d = result.data;
  if (!d.reachable) return `<div class="rp-result rp-unreach">Không tới được đích từ đỉnh xuất phát (UNREACHABLE) · ${Math.round(d.timeMs)}ms — module trả lời đúng theo requirement.</div>`;
  return `<div class="rp-result rp-ok">Khoảng cách ngắn nhất <b>${d.distance}</b> · đường đi <b>${d.path.join(" → ")}</b> · ${Math.round(d.timeMs)}ms (chạy code thật của module)</div>`;
}

function renderRoutePlanner(artifact) {
  if (!plannerState) plannerState = JSON.parse(JSON.stringify(PLANNER_DEFAULT));
  const s = plannerState;
  const verified = artifact.derivedStatus === "verified";
  if (!verified) {
    return `
      <div class="dm-planner" id="dm-planner">
        <div class="dm-planner-head">Route Planner — mô phỏng trên module thật</div>
        <div class="an-note">Khóa tới khi baseline đạt AC: mô phỏng chạy chính code WeightedGraphRouter của em, nên nó phải qua kiểm thử trước. Sửa source rồi verify — planner tự mở.</div>
      </div>`;
  }
  const edgeRows = s.edges.map((e, i) => `
    <tr>
      <td><input type="number" class="input rp-in" data-edge="${i}" data-k="from" value="${escapeHtml(String(e.from))}" min="0" aria-label="Cạnh ${i + 1}: từ đỉnh"></td>
      <td><input type="number" class="input rp-in" data-edge="${i}" data-k="to" value="${escapeHtml(String(e.to))}" min="0" aria-label="Cạnh ${i + 1}: tới đỉnh"></td>
      <td><input type="number" class="input rp-in" data-edge="${i}" data-k="weight" value="${escapeHtml(String(e.weight))}" min="0" aria-label="Cạnh ${i + 1}: trọng số"></td>
      <td><button type="button" class="icon-btn" data-rp-del="${i}" title="Xóa cạnh" aria-label="Xóa cạnh ${i + 1}">✕</button></td>
    </tr>`).join("");
  return `
    <div class="dm-planner" id="dm-planner">
      <div class="dm-planner-head">Route Planner — mô phỏng trên module thật</div>
      <div class="an-dim dm-planner-sub">Nhập đồ thị có hướng, chọn xuất phát/đích, rồi chạy chính WeightedGraphRouter.cpp đã verify. Trên hình: click = đổi đích, Shift+click = đổi xuất phát.</div>
      <div class="dm-planner-grid">
        <div class="dm-planner-left">
          <div class="rp-row">
            <label>Số đỉnh <input type="number" id="rp-nodes" class="input rp-in" value="${escapeHtml(String(s.nodeCount))}" min="1" max="200"></label>
            <label>Xuất phát <input type="number" id="rp-src" class="input rp-in" value="${escapeHtml(String(s.source))}" min="0"></label>
            <label>Đích <input type="number" id="rp-dst" class="input rp-in" value="${escapeHtml(String(s.target))}" min="0"></label>
          </div>
          <table class="rp-table"><thead><tr><th>từ</th><th>tới</th><th>w</th><th></th></tr></thead><tbody>${edgeRows}</tbody></table>
          <div class="rp-row">
            <button type="button" class="btn btn-sm" data-dm-action="rp-add-edge">+ Thêm cạnh</button>
            <button type="button" class="mo-next mo-next-compact" data-dm-action="rp-run">
              <span class="mo-next-title">Chạy module thật</span>
              <span class="mo-next-why">compile & run WeightedGraphRouter trên dữ liệu này</span>
            </button>
          </div>
          <div id="rp-result">${plannerResultHtml(plannerResult)}</div>
        </div>
        <div class="dm-planner-right" id="rp-viz">${plannerSvg(s, plannerResult)}</div>
      </div>
      <div class="an-dim dm-planner-foot">Kết quả sai so với kỳ vọng? <button type="button" class="rail-chip" data-dm-action="edit"><span class="rc-g">✎</span><span>Mở source để sửa</span></button> <button type="button" class="rail-chip" data-dm-action="verify-current"><span class="rc-g">▶</span><span>Chạy lại kiểm thử</span></button></div>
    </div>`;
}

// ---- read / edit views ----------------------------------------------------------

function renderRead(body, artifact, scope) {
  const suite = currentSuite(artifact);
  const srcFile = sourceFileOf(artifact);
  const isPlanner = artifact.id === "weighted-graph-router" && scope === "standalone";
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">${scope === "standalone" ? "Bài thực hành C++" : "Phần mở rộng từ bài đã AC"}</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || artifact.id || "Module")}</h2>
      <div class="an-sub"><span class="an-dim">Chỉ ${escapeHtml(srcFile)} sửa được; interface (.hpp) và file test giữ nguyên làm hợp đồng.</span></div>
    </div>
    ${renderProvenance(artifact, scope)}
    ${renderBriefInterface(artifact)}
    ${renderRequirement(artifact)}
    ${renderRequirementLadder(artifact)}
    ${renderFiles(artifact)}
    <div class="dm-status">Trạng thái: <b class="dm-status-${escapeHtml(artifact.derivedStatus)}">${escapeHtml(({ verified: "Đã kiểm chứng", "needs-work": "Cần sửa", "in-progress": "Đang làm", unverified: "Chưa kiểm chứng" })[artifact.derivedStatus] || "Chưa kiểm chứng")}</b></div>
    ${renderLastEvidence(artifact)}
    ${renderRuns(artifact)}
    ${isPlanner ? renderRoutePlanner(artifact) : ""}
    <div class="dm-cta">${renderNextAction(artifact.nextAction)}</div>
    <div class="rail-chips an-actions dm-secondary">
      <button type="button" class="rail-chip" data-dm-action="edit"><span class="rc-g">✎</span><span>Mở module để sửa</span></button>
      <button type="button" class="rail-chip" data-dm-action="verify-current"><span class="rc-g">▶</span><span>Chạy kiểm thử: ${escapeHtml(suiteLabel(artifact, suite))}</span></button>
    </div>`;

  body.querySelectorAll(".dm-file-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      body.querySelectorAll(".dm-file-tab").forEach((t) => t.classList.toggle("active", t === tab));
      const out = body.querySelector("#dm-file-body");
      if (out) out.textContent = clip(artifact.files[tab.dataset.file] || "", 6000);
    });
  });
}

function renderEdit(body, artifact, source, srcFile) {
  const suite = currentSuite(artifact);
  body.innerHTML = `
    <div class="doc-head">
      <div class="doc-kicker">Sửa module — ${escapeHtml(srcFile)}</div>
      <h2 class="doc-title">${escapeHtml(artifact.title || artifact.id || "Module")}</h2>
      <div class="an-sub"><span class="an-dim">Requirement: ${escapeHtml(suiteLabel(artifact, suite))}. Interface + test giữ nguyên làm hợp đồng.</span></div>
    </div>
    ${renderRequirement(artifact)}
    ${renderLastEvidenceForEdit(artifact)}
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

// While editing, the last fail evidence stays on screen — the user is usually
// fixing exactly what it says.
function renderLastEvidenceForEdit(artifact) {
  return renderLastEvidence(artifact);
}

// ---- init -----------------------------------------------------------------------

export function initDerivedModule(app) {
  // Canonical C++ surface: modules are activities, never modal/textarea flows.
  // The OJ DOM remains mounted underneath, so closing restores its context intact.
  let unifiedStore = null;
  let unifiedArtifact = null;
  const moduleStatement = (a, scope) => `## Dùng để làm gì\n${a.brief || "Đóng gói thuật toán thành thành phần C++ tái dùng."}\n\n## Bạn cần sửa gì\nChỉnh **${sourceFileOf(a)}** để đáp ứng yêu cầu hiện tại.\n\n## Kiểm chứng bằng gì\nBấm **Kiểm tra** để biên dịch và chạy bộ test thật. Nếu chưa đạt, đọc bằng chứng rồi sửa tiếp.\n\n## Ứng dụng ở đâu\n${scope === "standalone" ? "Dùng lại trong bài và dự án C++ cùng dạng thuật toán." : "Phát triển từ bài OJ này; lời giải OJ gốc vẫn được giữ nguyên."}`;
  const moduleControls = (a) => { const runs = (a.runs || []).slice(0, 5); const newest = runs[0]; return `<section class="dm-unified-panel"><h3>Việc cần làm</h3><p>Sửa code trong editor rồi bấm Kiểm tra.</p><h3>Lịch sử kiểm chứng</h3><ul>${runs.length ? runs.map((r) => `<li><b>${escapeHtml(r.verdict === "AC" ? "Đạt" : "Chưa đạt")}</b> · ${Math.round(r.timeMs || 0)}ms</li>`).join("") : "<li>Chưa có lần kiểm chứng nào.</li>"}</ul><h3>Chẩn đoán gần nhất</h3><pre>${escapeHtml(newest && newest.verdict !== "AC" ? [newest.stderr, newest.stdout].filter(Boolean).join("\n") || "Kiểm tra assertion trong bộ test." : "Chưa có lỗi cần chẩn đoán.")}</pre></section>`; };
  async function unifiedConfig() {
    const artifact = await unifiedStore.load(); const source = await unifiedStore.source(); unifiedArtifact = artifact;
    return { kind: "module", kicker: "Không gian thực hành C++", title: artifact.title || "Bài thực hành C++", statement: moduleStatement(artifact, unifiedStore.scope), code: source.source || "", fileName: source.file || sourceFileOf(artifact), taskNote: "Sửa phần triển khai · CodeMirror C++", hideIo: true, runLabel: "Lưu", judgeLabel: "Kiểm tra", status: [{ label: "Kiểm chứng", value: "Bộ test thật" }], headerActions: unifiedStore.scope === "problem" ? [{ label: "Quay lại bài gốc", onClick: () => app.activityWorkspace.close() }] : [], saveCode: async (code) => { const saved = await unifiedStore.save(code); unifiedArtifact = saved.artifact || unifiedArtifact; }, run: async () => ({ verdict: "Đã lưu", feedback: "Đã lưu code. Bấm Kiểm tra để chạy bộ test thật." }), judge: async () => { const result = await unifiedStore.verify(currentSuite(unifiedArtifact)); unifiedArtifact = result.artifact || unifiedArtifact; const check = result.check || {}; return { verdict: check.verdict || "ERROR", summary: check.summary, stdout: check.stdout, stderr: check.stderr, results: check.results || [], feedback: check.verdict === "AC" ? "Đã qua bộ test thật." : "Chưa đạt. Đọc chẩn đoán, sửa trong editor rồi kiểm tra lại." }; }, mountControls: (host) => { host.innerHTML = moduleControls(unifiedArtifact); }, onResult: async (result) => { if (result._kind === "judge") result.nextConfig = await unifiedConfig(); }, onClose: () => { unifiedArtifact = null; } };
  }
  async function openUnified(nextStore) { unifiedStore = nextStore; app.activityWorkspace.openLoading({ kind: "module", kicker: "Không gian thực hành C++", title: "Đang mở bài thực hành" }); try { await app.activityWorkspace.open(await unifiedConfig()); } catch (err) { app.activityWorkspace.showError({ kind: "module", title: "Không mở được bài thực hành", message: err.message || "Lỗi không rõ" }); } }
  app.openStandaloneModule = (artifactId) => openUnified(standaloneStore(artifactId));
  app.openDerivedModule = async (evidenceRef, moduleId) => { const pid = app.state.currentId; if (!pid) return; const conceptModule = moduleForConcept(detectConcept(app.state.meta || {})); let target = moduleId || (conceptModule && conceptModule.id); try { const { artifacts } = await api.derivedArtifacts(pid); const existing = (artifacts || []).find((a) => a.id === target) || (artifacts || [])[0]; if (existing) target = existing.id; else if (!evidenceRef?.id || !target) { app.toast?.("Judge đạt AC rồi mở module phù hợp từ bài này.", "err"); return; } else await api.createDerivedModule(pid, target, evidenceRef.id); } catch (err) { if (!(err && err.status === 409)) { app.toast?.(err.message || "Không tạo được module.", "err"); return; } } if (app.state.currentId === pid) await openUnified(problemStore(app, pid, target)); };
  document.getElementById("btn-derived-module")?.addEventListener("click", () => { const ev = app.state.lastJudge?.evidence; app.openDerivedModule(ev && app.state.lastJudge.verdict === "AC" ? ev : null); });
  app.derivedModuleLabelFor = (meta) => { const m = moduleForConcept(detectConcept(meta || {})); return m ? `Phát triển thành module ${m.label}` : "Phát triển thành module"; };
  return;

  const modal = document.getElementById("derived-module-modal");
  const body = document.getElementById("derived-module-body");
  if (!modal || !body) return;

  const close = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  const closeBtn = document.getElementById("derived-module-close");
  if (closeBtn) closeBtn.addEventListener("click", close);

  let store = null;           // current adapter (problem or standalone)
  let currentArtifact = null;
  let currentSrcFile = null;
  let epoch = 0;              // open-session token: stale async answers drop out

  const stillOpen = (myEpoch) => epoch === myEpoch && !modal.classList.contains("hidden") && store && store.stillCurrent();

  async function reloadRead() {
    const myEpoch = epoch;
    body.innerHTML = `<div class="an-note an-wait">Đang tải module…</div>`;
    try {
      const artifact = await store.load();
      if (!stillOpen(myEpoch)) return;
      currentArtifact = artifact;
      renderRead(body, artifact, store.scope);
      // Library rows reflect status changes (needs-work ↔ verified) live.
      if (store.scope === "standalone" && app.refreshModules) app.refreshModules();
    } catch (err) {
      if (!stillOpen(myEpoch)) return;
      body.innerHTML = `<div class="an-note">Không tải được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
    }
  }

  async function openEdit() {
    const myEpoch = epoch;
    body.innerHTML = `<div class="an-note an-wait">Đang mở source module…</div>`;
    try {
      const src = await store.source();
      if (!stillOpen(myEpoch)) return;
      currentSrcFile = src.file || sourceFileOf(currentArtifact);
      renderEdit(body, currentArtifact, src.source || "", currentSrcFile);
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Không mở được source.", "err");
      await reloadRead();
    }
  }

  async function save(thenVerify) {
    const area = body.querySelector("#dm-edit-area");
    if (!area) return;
    const source = area.value;
    body.innerHTML = `<div class="an-note an-wait">Đang lưu & ${thenVerify ? "chạy kiểm thử" : "tải lại"}…</div>`;
    try {
      await store.save(source);
      if (thenVerify) await store.verify(currentSuite(currentArtifact));
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Lưu thất bại.", "err");
    }
    await reloadRead();
  }

  async function verifyCurrent(btn) {
    if (btn) btn.classList.add("busy");
    try {
      await store.verify(currentSuite(currentArtifact));
    } catch (err) {
      app.toast && app.toast((err && err.message) || "Chạy kiểm thử thất bại.", "err");
    }
    await reloadRead();
  }

  // ---- Route Planner interactions (delegated, standalone WGR only) ----
  function readPlannerInputs() {
    const nodes = body.querySelector("#rp-nodes");
    const src = body.querySelector("#rp-src");
    const dst = body.querySelector("#rp-dst");
    if (nodes) plannerState.nodeCount = nodes.value;
    if (src) plannerState.source = src.value;
    if (dst) plannerState.target = dst.value;
    body.querySelectorAll("[data-edge]").forEach((input) => {
      const e = plannerState.edges[Number(input.dataset.edge)];
      if (e) e[input.dataset.k] = input.value;
    });
  }

  function repaintPlanner() {
    const host = body.querySelector("#dm-planner");
    if (!host || !currentArtifact) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = renderRoutePlanner(currentArtifact);
    host.replaceWith(wrap.firstElementChild);
  }

  async function runPlanner() {
    readPlannerInputs();
    const built = buildRouteDataset(plannerState);
    if (built.error) {
      plannerResult = { kind: "error", message: built.error };
      repaintPlanner();
      return;
    }
    plannerResult = null;
    const resultHost = body.querySelector("#rp-result");
    if (resultHost) resultHost.innerHTML = `<div class="an-note an-wait">Đang compile & chạy module…</div>`;
    try {
      const normalized = normalizeSimulateResult(await api.simulateRoute(built.input));
      plannerResult = normalized
        ? { kind: "ok", data: normalized }
        : { kind: "error", message: "Module trả kết quả không hợp lệ — mở source để kiểm tra shortestPath()." };
    } catch (err) {
      plannerResult = { kind: "error", message: (err && err.message) || "Chạy mô phỏng thất bại." };
    }
    repaintPlanner();
  }

  body.addEventListener("click", async (e) => {
    // SVG node interactions: click = target, Shift+click = source.
    const node = e.target.closest && e.target.closest(".rp-node");
    if (node && plannerState) {
      readPlannerInputs();
      if (e.shiftKey) plannerState.source = Number(node.dataset.node);
      else plannerState.target = Number(node.dataset.node);
      repaintPlanner();
      return;
    }
    const del = e.target.closest && e.target.closest("[data-rp-del]");
    if (del && plannerState) {
      readPlannerInputs();
      plannerState.edges.splice(Number(del.dataset.rpDel), 1);
      repaintPlanner();
      return;
    }
    if (e.target.closest("#dm-open-original")) {
      close();
      if (app.selectProblem && currentArtifact && currentArtifact.derivedFrom) {
        app.selectProblem(currentArtifact.derivedFrom.problemId);
      }
      return;
    }
    const actionBtn = e.target.closest("[data-dm-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.dmAction;
    actionBtn.disabled = true;
    switch (action) {
      case "edit":
      case "open-derived-work":          // backend "Sửa <module>" == Work
      case "open-module-work":
        await openEdit(); break;
      case "save":                        // Save + verify current suite
        await save(true); break;
      case "save-only":
        await save(false); break;
      case "cancel-edit":
        await reloadRead(); break;
      case "verify-current":
      case "verify-derived-baseline":
      case "verify-module-baseline":
      case "continue-from-derived":
        await verifyCurrent(actionBtn); break;
      case "activate-requirement-change": {
        // changeId comes from the artifact's OWN requirement list — never hard-coded.
        const change = pendingChange(currentArtifact);
        if (!change) { app.toast && app.toast("Không có requirement change nào để kích hoạt.", "err"); break; }
        try { await store.activate(change.id); }
        catch (err) { app.toast && app.toast((err && err.message) || "Kích hoạt thất bại.", "err"); }
        await reloadRead();
        break;
      }
      case "rp-add-edge":
        readPlannerInputs();
        plannerState.edges.push({ from: 0, to: 0, weight: 1 });
        repaintPlanner();
        break;
      case "rp-run":
        await runPlanner(); break;
      default:
        actionBtn.disabled = false;
    }
  });

  // ---- public entry points --------------------------------------------------

  // Standalone catalog module — straight from the Library (B1→B3), no problem
  // context needed. Planner state resets per module open.
  app.openStandaloneModule = async (artifactId) => {
    epoch += 1;
    store = standaloneStore(artifactId);
    plannerState = null;
    plannerResult = null;
    modal.classList.remove("hidden");
    await reloadRead();
  };

  // evidenceRef: `.evidence` from a full Judge AC response ({ id, href, ... }),
  // or null to only OPEN an already-created module (Tools menu / after reload).
  app.openDerivedModule = async (evidenceRef, moduleId) => {
    const pid = app.state.currentId;
    if (!pid) return;
    epoch += 1;
    plannerState = null;
    plannerResult = null;
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
        // No stored artifact and no fresh AC evidence — creating one REQUIRES
        // full Judge AC evidence (backend enforces it), so say so.
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
      // 409 = already exists (race) — fall through to reload.
      if (!(err && err.status === 409)) {
        body.innerHTML = `<div class="an-note">Không tạo được module: ${escapeHtml((err && err.message) || "lỗi không rõ")}.</div>`;
        return;
      }
    }
    if (app.state.currentId !== pid) return;
    store = problemStore(app, pid, target);
    await reloadRead();
  };

  // Tools ▾ → "⑂ Module dẫn xuất": the persistent way back in after reload.
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
