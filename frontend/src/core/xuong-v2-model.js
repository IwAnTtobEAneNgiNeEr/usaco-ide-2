// xuong-v2-model.js — pure adapter + view-model layer for the Xưởng Preview
// runtime. No DOM, no fetch. Every shape here is locked by
// docs/XUONG-API-CONTRACT.md v2 and covered by test/xuong-v2-model.test.mjs
// against the SHARED golden fixture docs/fixtures/xuong-contract-v2.json.
//
// Two rules this file exists to enforce, before any pixel is drawn:
//   1. Raw contract material (id, kind, filePath, symbol, contentHash, enum)
//      never becomes user-visible text. UI reads `display.label` or nothing.
//   2. Each layer owns exactly one truth: build output = compile/runtime,
//      Preview = behaviour of the current run, Checks = requirement verdict.

export const CONTRACT_VERSION = "xuong-api.v2";

const OBSERVABLE_SCHEMA = "xuong.observable.v2";
const RECIPE_SCHEMA = "xuong.preview-recipe.v2";

// Caps mirror §5 so a malformed/oversized payload can never wedge the renderer.
const CAP = Object.freeze({ entities: 400, relations: 1000, events: 500, anchors: 100, metrics: 20, outputs: 40 });

const BASE_KINDS = Object.freeze([
  "grid", "graph", "tree", "sequence", "table", "timeline",
  "chart", "text", "geometry", "state-machine", "request-response",
  "runtime-resource", "universal-inspector",
]);

// §6 compatibility matrix — the single source of "may this overlay sit on this
// base". Frontend never repairs a bad recipe; it refuses and says so.
const OVERLAY_MATRIX = Object.freeze({
  "grid": ["path", "frontier", "heatmap", "selection-range", "constraint", "error-anchor", "target", "annotation"],
  "graph": ["path", "frontier", "heap", "dependency", "compare", "selection-range", "error-anchor", "target", "annotation"],
  "tree": ["path", "frontier", "heap", "dependency", "compare", "selection-range", "error-anchor", "target", "annotation"],
  "sequence": ["window", "partition", "heap", "threshold", "diff", "selection-range", "frequency", "error-anchor", "annotation"],
  "table": ["window", "partition", "threshold", "diff", "compare", "frequency", "constraint", "error-anchor", "annotation"],
  "timeline": ["window", "interval", "threshold", "compare", "frequency", "error-anchor", "annotation"],
  "chart": ["threshold", "heatmap", "compare", "frequency", "target", "error-anchor", "annotation", "resource-usage"],
  "text": ["diff", "selection-range", "constraint", "error-anchor", "annotation", "target"],
  "geometry": ["path", "heatmap", "selection-range", "constraint", "error-anchor", "target", "annotation"],
  "state-machine": ["dependency", "constraint", "diff", "error-anchor", "target", "annotation"],
  "request-response": ["diff", "threshold", "compare", "constraint", "error-anchor", "annotation", "resource-usage"],
  "runtime-resource": ["threshold", "heatmap", "compare", "target", "error-anchor", "resource-usage", "annotation"],
  "universal-inspector": ["error-anchor", "diff", "compare", "constraint", "annotation"],
});

const CANONICAL_OVERLAY_ORDER = Object.freeze([
  "error-anchor", "target", "path", "frontier", "window", "partition", "heap",
  "threshold", "heatmap", "diff", "selection-range", "dependency", "interval",
  "compare", "frequency", "constraint", "annotation", "resource-usage",
]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const text = (v, max = 2000) => String(v == null ? "" : v).trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []);
const strings = (v, max = 16) => list(v).map((s) => text(s, 400)).filter(Boolean).slice(0, max);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const primitive = (v) => (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null);

function normalizeDisplay(raw, fallbackLabel = "") {
  const d = raw && typeof raw === "object" ? raw : {};
  const out = { label: text(d.label, 200) || fallbackLabel };
  const description = text(d.description, 800);
  if (description) out.description = description;
  return out;
}

function normalizeSpan(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    startLine: num(raw.startLine, 1),
    startColumn: num(raw.startColumn, 0),
    endLine: num(raw.endLine, num(raw.startLine, 1)),
    endColumn: num(raw.endColumn, 0),
  };
}

// ---------------------------------------------------------------------------
// Session · Pathway · Project
// ---------------------------------------------------------------------------

export function normalizeSourceMapping(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id, 120);
  if (!id) return null;
  return {
    id,
    filePath: text(raw.filePath, 300),
    symbol: text(raw.symbol, 200),
    span: normalizeSpan(raw.span),
    contentHash: text(raw.contentHash, 200),
    display: normalizeDisplay(raw.display),
    role: ["source-evidence", "editable", "supporting"].includes(raw.role) ? raw.role : "supporting",
  };
}

export function normalizeCapability(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    summary: text(c.summary, 1200),
    capabilities: list(c.capabilities).map((item) => ({
      id: text(item && item.id, 120),
      display: normalizeDisplay(item && item.display),
      evidence: list(item && item.evidence).map((e) => ({
        mappingId: text(e && e.mappingId, 120),
        claim: text(e && e.claim, 600),
      })).filter((e) => e.mappingId),
    })).filter((item) => item.id),
    constraints: strings(c.constraints, 8),
  };
}

export function normalizeTransformation(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  return {
    oldAssumption: text(t.oldAssumption, 800),
    breakingEvent: text(t.breakingEvent, 800),
    newCapability: text(t.newCapability, 800),
    observableOutcome: text(t.observableOutcome, 800),
    editableMappingIds: strings(t.editableMappingIds, 12),
  };
}

// §6.1: a pathway is only buildable when it actually breaks an assumption and
// names the symbols the student will edit. A re-skin stays visible but inert.
function isBuildable(transformation) {
  return Boolean(
    transformation.breakingEvent &&
    transformation.newCapability &&
    transformation.observableOutcome &&
    transformation.editableMappingIds.length
  );
}

export function normalizePathway(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id, 120);
  const display = normalizeDisplay(raw.display);
  if (!id || !display.label) return null;
  const transformation = normalizeTransformation(raw.transformation);
  return {
    id,
    display,
    purpose: text(raw.purpose, 800),
    context: text(raw.context, 1000),
    application: text(raw.application, 1000),
    capability: normalizeCapability(raw.capability),
    transformation,
    sourceMappings: list(raw.sourceMappings).map(normalizeSourceMapping).filter(Boolean),
    scenarioId: text(raw.scenarioId, 120),
    buildable: isBuildable(transformation),
  };
}

export function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const analysis = raw.analysis && typeof raw.analysis === "object" ? raw.analysis : {};
  return {
    id: text(raw.id, 120),
    status: raw.status === "selected" ? "selected" : "analyzed",
    origin: raw.origin && typeof raw.origin === "object" ? raw.origin : { type: "direct-input" },
    analysis: {
      summary: text(analysis.summary, 1800),
      concepts: strings(analysis.concepts, 8),
      constraints: strings(analysis.constraints, 8),
    },
    // No quota. The contract says 0..N and README sai lầm #16 forbids 3–5.
    pathways: list(raw.pathways).map(normalizePathway).filter(Boolean),
    selectedPathwayId: raw.selectedPathwayId || null,
    projectId: raw.projectId || null,
  };
}

export function normalizeRequirement(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id, 120);
  if (!id) return null;
  return {
    id,
    display: normalizeDisplay(raw.display),
    state: ["candidate", "failing", "met"].includes(raw.state) ? raw.state : "candidate",
    verifierIds: strings(raw.verifierIds, 12),
    failureEvidenceIds: strings(raw.failureEvidenceIds, 12),
    passEvidenceIds: strings(raw.passEvidenceIds, 12),
  };
}

export function normalizeScenarioSummary(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: text(s.id, 120),
    display: normalizeDisplay(s.display),
    inputSummary: text(s.inputSummary, 600),
  };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const brief = raw.brief && typeof raw.brief === "object" ? raw.brief : {};
  const learningBridge = raw.learningBridge && typeof raw.learningBridge === "object" ? raw.learningBridge : {};
  return {
    id: text(raw.id, 120),
    display: normalizeDisplay(raw.display),
    status: ["building", "ready", "needs-attention", "evolving"].includes(raw.status) ? raw.status : "building",
    sourceRevision: text(raw.sourceRevision, 200),
    brief: {
      context: text(brief.context, 1200),
      application: text(brief.application, 1200),
      mission: text(brief.mission, 1200),
      doneWhen: text(brief.doneWhen, 1200),
    },
    learningBridge: {
      intro: text(learningBridge.intro, 1000),
      familiarCode: text(learningBridge.familiarCode, 2400),
      editInstruction: text(learningBridge.editInstruction, 1000),
      fileRoles: list(learningBridge.fileRoles).map((role) => ({
        suffix: text(role && role.suffix, 120),
        label: text(role && role.label, 200),
        description: text(role && role.description, 600),
      })).filter((role) => role.label),
    },
    capability: normalizeCapability(raw.capability),
    transformation: normalizeTransformation(raw.transformation),
    files: list(raw.files).map((f) => ({
      path: text(f && f.path, 300),
      display: normalizeDisplay(f && f.display),
      editable: Boolean(f && f.editable),
      source: f && typeof f.source === "string" ? f.source : undefined,
      contentHash: text(f && f.contentHash, 200) || undefined,
    })).filter((f) => f.path),
    sourceMappings: list(raw.sourceMappings).map(normalizeSourceMapping).filter(Boolean),
    scenarios: list(raw.scenarios).map(normalizeScenarioSummary).filter((s) => s.id),
    growth: list(raw.growth).map((g) => ({
      id: text(g && g.id, 120),
      display: normalizeDisplay(g && g.display),
      state: ["present", "current", "next"].includes(g && g.state) ? g.state : "next",
    })).filter((g) => g.id),
    requirements: list(raw.requirements).map(normalizeRequirement).filter(Boolean),
    nextAction: {
      label: text(raw.nextAction && raw.nextAction.label, 200),
      reason: text(raw.nextAction && raw.nextAction.reason, 600),
    },
  };
}

// ---------------------------------------------------------------------------
// Reference storyboard vs user run — two types, never one flagged type
// ---------------------------------------------------------------------------

export function normalizeReference(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    type: "reference-storyboard",
    isReference: true,
    id: text(raw.id, 120),
    projectId: text(raw.projectId, 120),
    display: normalizeDisplay(raw.display),
    scenario: normalizeScenarioSummary(raw.scenario),
    recipe: normalizeRecipe(raw.recipe),
    frames: list(raw.frames).map((frame) => ({
      id: text(frame && frame.id, 120),
      caption: text(frame && frame.caption, 800),
      observable: normalizeObservable(frame && frame.observable),
      highlightMappingIds: strings(frame && frame.highlightMappingIds, 12),
    })).filter((frame) => frame.id),
  };
}

export function normalizeDiagnostic(raw) {
  if (!raw || typeof raw !== "object") return null;
  const message = text(raw.message, 1200);
  if (!message) return null;
  return {
    severity: raw.severity === "warning" ? "warning" : "error",
    message,
    filePath: text(raw.filePath, 300) || undefined,
    span: normalizeSpan(raw.span),
    sourceMappingId: text(raw.sourceMappingId, 120) || undefined,
  };
}

export function normalizeRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    type: "scenario-run",
    isReference: false,
    id: text(raw.id, 120),
    projectId: text(raw.projectId, 120),
    scenarioId: text(raw.scenarioId, 120),
    sourceRevision: text(raw.sourceRevision, 200),
    provenance: "user-source",
    status: ["completed", "compile-error", "runtime-error", "timed-out"].includes(raw.status) ? raw.status : "runtime-error",
    startedAt: text(raw.startedAt, 40),
    durationMs: num(raw.durationMs, 0),
    eventCount: num(raw.eventCount, 0),
    diagnostics: list(raw.diagnostics).map(normalizeDiagnostic).filter(Boolean),
    outputSummary: text(raw.outputSummary, 1200),
  };
}

// ---------------------------------------------------------------------------
// ObservableModel · PreviewRecipe · Replay
// ---------------------------------------------------------------------------

function normalizeStateRecord(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    const v = primitive(value);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function normalizeObservable(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    schemaVersion: OBSERVABLE_SCHEMA,
    runId: text(raw.runId, 120),
    scenario: normalizeScenarioSummary(raw.scenario),
    cursor: num(raw.cursor, 0),
    entities: list(raw.entities).slice(0, CAP.entities).map((e) => ({
      id: text(e && e.id, 120),
      kind: text(e && e.kind, 80),
      display: normalizeDisplay(e && e.display),
      state: normalizeStateRecord(e && e.state),
      geometry: e && e.geometry && typeof e.geometry === "object" ? {
        x: num(e.geometry.x, 0), y: num(e.geometry.y, 0),
        width: e.geometry.width == null ? undefined : num(e.geometry.width, 1),
        height: e.geometry.height == null ? undefined : num(e.geometry.height, 1),
      } : undefined,
    })).filter((e) => e.id),
    relations: list(raw.relations).slice(0, CAP.relations).map((r) => ({
      id: text(r && r.id, 120),
      fromEntityId: text(r && r.fromEntityId, 120),
      toEntityId: text(r && r.toEntityId, 120),
      kind: text(r && r.kind, 80),
      display: normalizeDisplay(r && r.display),
      state: normalizeStateRecord(r && r.state),
    })).filter((r) => r.id && r.fromEntityId && r.toEntityId),
    events: list(raw.events).slice(0, CAP.events).map((ev) => ({
      id: text(ev && ev.id, 120),
      index: num(ev && ev.index, 0),
      kind: text(ev && ev.kind, 80),
      display: normalizeDisplay(ev && ev.display),
      entityIds: strings(ev && ev.entityIds, 40),
      changedFields: list(ev && ev.changedFields).map((f) => ({
        entityId: text(f && f.entityId, 120) || undefined,
        fieldId: text(f && f.fieldId, 120),
        display: normalizeDisplay(f && f.display),
        before: primitive(f && f.before),
        after: primitive(f && f.after),
      })).filter((f) => f.fieldId),
      anchorIds: strings(ev && ev.anchorIds, 20),
    })).filter((ev) => ev.id),
    anchors: list(raw.anchors).slice(0, CAP.anchors).map((a) => ({
      id: text(a && a.id, 120),
      eventIndex: num(a && a.eventIndex, 0),
      entityId: text(a && a.entityId, 120) || undefined,
      sourceMappingId: text(a && a.sourceMappingId, 120),
      severity: ["info", "warning", "error"].includes(a && a.severity) ? a.severity : "info",
      display: normalizeDisplay(a && a.display),
    })).filter((a) => a.id),
    metrics: list(raw.metrics).slice(0, CAP.metrics).map((m) => ({
      id: text(m && m.id, 120),
      display: normalizeDisplay(m && m.display),
      value: primitive(m && m.value) ?? "",
      unit: text(m && m.unit, 40) || undefined,
    })).filter((m) => m.id),
    outputs: list(raw.outputs).slice(0, CAP.outputs).map((o) => ({
      id: text(o && o.id, 120),
      display: normalizeDisplay(o && o.display),
      value: text(o && o.value, 4000),
    })).filter((o) => o.id),
    controls: list(raw.controls).map((c) => ({
      id: text(c && c.id, 120),
      display: normalizeDisplay(c && c.display),
      type: ["toggle", "number", "select", "stepper"].includes(c && c.type) ? c.type : "toggle",
      value: primitive(c && c.value) ?? "",
    })).filter((c) => c.id),
    truncation: raw.truncation && typeof raw.truncation === "object" ? {
      eventsDropped: num(raw.truncation.eventsDropped, 0),
      entitiesDropped: num(raw.truncation.entitiesDropped, 0),
      display: normalizeDisplay(raw.truncation.display),
    } : undefined,
  };
}

export function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const base = raw.base && typeof raw.base === "object" ? raw.base : {};
  const controlPack = raw.controlPack && typeof raw.controlPack === "object" ? raw.controlPack : {};
  const layout = raw.layout && typeof raw.layout === "object" ? raw.layout : {};
  return {
    schemaVersion: RECIPE_SCHEMA,
    base: { kind: text(base.kind, 60), display: normalizeDisplay(base.display) },
    overlays: list(raw.overlays).map((o) => ({
      kind: text(o && o.kind, 60),
      display: normalizeDisplay(o && o.display),
    })).filter((o) => o.kind),
    controlPack: {
      kind: ["stepper", "playback", "scenario-input", "time-window", "none"].includes(controlPack.kind) ? controlPack.kind : "none",
      display: normalizeDisplay(controlPack.display),
    },
    layout: {
      kind: ["focus", "balanced", "wide"].includes(layout.kind) ? layout.kind : "balanced",
      display: normalizeDisplay(layout.display),
    },
    inspector: {
      alwaysAvailable: Boolean(raw.inspector && raw.inspector.alwaysAvailable),
      display: normalizeDisplay(raw.inspector && raw.inspector.display),
    },
  };
}

export function normalizeReplay(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    cursor: num(raw.cursor, 0),
    totalEvents: num(raw.totalEvents, 0),
    observable: normalizeObservable(raw.observable),
    recipe: normalizeRecipe(raw.recipe),
    activeAnchorIds: strings(raw.activeAnchorIds, 20),
  };
}

// Route adapters keep envelope handling explicit at the boundary.  The
// feature layer must never reach through an arbitrary response object and then
// silently fall back to v1/fixture data when a required key is missing.
export function normalizeRunEnvelope(raw) {
  if (!raw || typeof raw !== "object" || !raw.project || !raw.run) return null;
  return {
    project: normalizeProject(raw.project),
    run: normalizeRun(raw.run),
    observable: raw.observable ? normalizeObservable(raw.observable) : null,
    recipe: raw.recipe ? normalizeRecipe(raw.recipe) : null,
  };
}

export function normalizeReplayEnvelope(raw) {
  if (!raw || typeof raw !== "object" || !raw.run || !raw.replay) return null;
  return { run: normalizeRun(raw.run), replay: normalizeReplay(raw.replay) };
}

export function normalizeReferenceEnvelope(raw) {
  if (!raw || typeof raw !== "object" || !raw.reference) return null;
  return { reference: normalizeReference(raw.reference) };
}

export function canonicalOverlays(overlays) {
  const rank = (kind) => {
    const i = CANONICAL_OVERLAY_ORDER.indexOf(kind);
    return i === -1 ? CANONICAL_OVERLAY_ORDER.length : i;
  };
  return list(overlays).slice().sort((a, b) => rank(a.kind) - rank(b.kind));
}

// §6 validation. The frontend NEVER repairs a recipe — an invalid one is a
// backend bug and must be visible as such, not silently re-rendered.
export function checkRecipe(recipe, observable) {
  const problems = [];
  const push = (code, message) => problems.push({ code, message });

  if (!recipe) {
    push("RECIPE_MISSING", "Không có cấu hình hiển thị cho lần chạy này.");
    return { valid: false, problems };
  }
  if (!BASE_KINDS.includes(recipe.base.kind)) {
    push("BASE_UNKNOWN", "Cách hiển thị này chưa được hỗ trợ.");
    return { valid: false, problems };
  }
  if (recipe.inspector.alwaysAvailable !== true) push("INSPECTOR_REQUIRED", "Thiếu bảng chi tiết lần chạy.");

  const overlays = list(recipe.overlays);
  if (overlays.length > 2) push("TOO_MANY_OVERLAYS", "Quá nhiều lớp phủ cho một khung hiển thị.");

  const seen = new Set();
  const allowed = OVERLAY_MATRIX[recipe.base.kind] || [];
  for (const overlay of overlays) {
    if (seen.has(overlay.kind)) push("DUPLICATE_OVERLAY", "Một lớp phủ bị lặp lại.");
    seen.add(overlay.kind);
    if (!allowed.includes(overlay.kind)) push("OVERLAY_NOT_COMPATIBLE", "Một lớp phủ không dùng được với khung hiển thị này.");
  }

  const obs = observable || null;
  if (seen.has("error-anchor") && !(obs && obs.anchors.length)) {
    push("OVERLAY_REQUIRES_ANCHOR", "Không có điểm lỗi nào để đánh dấu.");
  }
  if (seen.has("resource-usage") && !(obs && obs.metrics.some((m) => /resource|memory|cpu|ram|bộ nhớ/i.test(`${m.id} ${m.display.label}`)))) {
    push("OVERLAY_REQUIRES_RESOURCE_METRIC", "Không có số đo tài nguyên nào để hiển thị.");
  }
  if (recipe.controlPack.kind !== "none" && !(obs && obs.controls.length)) {
    push("CONTROL_WITHOUT_BINDING", "Không có điều khiển nào khớp với lần chạy này.");
  }

  return { valid: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// View-models
// ---------------------------------------------------------------------------

const BUILD_LABEL = Object.freeze({
  none: "Chưa chạy lần nào",
  ok: "Chương trình biên dịch và chạy xong",
  "compile-error": "Chưa biên dịch được",
  "runtime-error": "Chương trình dừng giữa chừng",
  "timed-out": "Chương trình chạy quá lâu",
});

// Build output speaks about compile/runtime ONLY (README §6.4). Behaviour lives
// in Preview, requirement verdict lives in Checks. No verdict word may appear.
export function buildOutputModel(run) {
  if (!run) return { state: "none", label: BUILD_LABEL.none, durationMs: 0, diagnostics: [] };
  const state = run.status === "completed" ? "ok" : run.status;
  return {
    state,
    label: BUILD_LABEL[state] || BUILD_LABEL["runtime-error"],
    durationMs: run.durationMs,
    diagnostics: run.diagnostics.map((d) => ({
      severity: d.severity,
      message: d.message,
      filePath: d.filePath,
      span: d.span,
      sourceMappingId: d.sourceMappingId,
    })),
  };
}

// fieldId → display label, harvested from the trace. A state field with no
// contract label is counted, never printed with its raw key.
function fieldLabelMap(observable) {
  const map = new Map();
  for (const event of observable.events) {
    for (const field of event.changedFields) {
      if (field.fieldId && field.display.label) map.set(field.fieldId, field.display.label);
    }
  }
  return map;
}

function previewEntities(observable) {
  const labels = fieldLabelMap(observable);
  return observable.entities.map((entity) => {
    const stateLabels = [];
    let hiddenStateCount = 0;
    for (const [fieldId, value] of Object.entries(entity.state)) {
      const label = labels.get(fieldId);
      if (label) stateLabels.push({ label, value });
      else hiddenStateCount += 1;
    }
    return {
      id: entity.id,
      kind: entity.kind,
      display: entity.display,
      geometry: entity.geometry,
      state: entity.state,          // renderer-only: draws a wall, never printed
      stateLabels,
      hiddenStateCount,
    };
  });
}

export function previewModel({ run, observable, recipe, totalEvents }) {
  // An unavailable preview still carries the build story so the surface can be
  // honest about WHY there is nothing to watch.
  const empty = (reason) => ({ available: false, running: false, reason, problems: [], build: buildOutputModel(run) });

  if (!run) return empty("no-run");
  if (run.status !== "completed") return empty("build-failed");
  if (!observable || !recipe) return empty("no-observable");

  const check = checkRecipe(recipe, observable);
  if (!check.valid) return { available: false, running: false, reason: "invalid-recipe", problems: check.problems, build: buildOutputModel(run) };

  // A replay frame carries only the events up to its cursor, so the trace
  // length must come from the run (or the frame's own total) — never from the
  // slice being displayed, or stepping back would appear to delete history.
  const total = Number.isFinite(totalEvents) ? totalEvents : run.eventCount;
  return composePreview(observable, recipe, "user-source", total);
}

// Same surface, same recipe grammar, whatever the provenance. The caller
// decides whether this is the student's run or an inert reference frame.
function composePreview(observable, recipe, provenance, totalEvents) {
  return {
    available: true,
    running: false,
    reason: null,
    problems: [],
    provenance,
    base: { kind: recipe.base.kind, ...recipe.base.display },
    layout: { kind: recipe.layout.kind, ...recipe.layout.display },
    overlays: canonicalOverlays(recipe.overlays).map((o) => ({ kind: o.kind, ...o.display })),
    inspector: { ...recipe.inspector.display },
    control: {
      kind: recipe.controlPack.kind,
      ...recipe.controlPack.display,
      controls: observable.controls.map((c) => ({ id: c.id, type: c.type, value: c.value, ...c.display })),
    },
    scenario: { ...observable.scenario.display, inputSummary: observable.scenario.inputSummary },
    cursor: observable.cursor,
    totalEvents: Number.isFinite(totalEvents) ? totalEvents : observable.events.length,
    entities: previewEntities(observable),
    relations: observable.relations.map((r) => ({ id: r.id, kind: r.kind, fromEntityId: r.fromEntityId, toEntityId: r.toEntityId, state: r.state, ...r.display })),
    events: observable.events.map((ev) => ({
      id: ev.id, index: ev.index, kind: ev.kind, entityIds: ev.entityIds, anchorIds: ev.anchorIds,
      ...ev.display,
      changedFields: ev.changedFields.map((f) => ({ entityId: f.entityId, before: f.before, after: f.after, ...f.display })),
    })),
    anchors: observable.anchors.map((a) => ({ id: a.id, eventIndex: a.eventIndex, entityId: a.entityId, severity: a.severity, ...a.display })),
    metrics: observable.metrics.map((m) => ({ id: m.id, value: m.value, unit: m.unit, ...m.display })),
    outputs: observable.outputs.map((o) => ({ id: o.id, value: o.value, ...o.display })),
    truncation: observable.truncation ? { ...observable.truncation.display, eventsDropped: observable.truncation.eventsDropped, entitiesDropped: observable.truncation.entitiesDropped } : null,
  };
}

// Behaviour error → the exact symbol span to open. An anchor whose mapping is
// unknown is dropped: jumping to a guessed line is worse than not jumping.
export function anchorTargets(observable, project) {
  if (!observable || !project) return [];
  const byId = new Map(project.sourceMappings.map((m) => [m.id, m]));
  return observable.anchors.map((anchor) => {
    const mapping = byId.get(anchor.sourceMappingId);
    if (!mapping || !mapping.span) return null;
    return {
      anchorId: anchor.id,
      severity: anchor.severity,
      label: anchor.display.label,
      description: anchor.display.description || "",
      eventIndex: anchor.eventIndex,
      entityId: anchor.entityId,
      jump: {
        mappingId: mapping.id,
        filePath: mapping.filePath,
        symbol: mapping.symbol,
        span: mapping.span,
        contentHash: mapping.contentHash,
      },
    };
  }).filter(Boolean);
}

// Replay is a real cursor over real events: no auto-play, no percentage.
export function replayModel(frame) {
  if (!frame) return null;
  return {
    cursor: frame.cursor,
    totalEvents: frame.totalEvents,
    atStart: frame.cursor <= 0,
    atEnd: frame.cursor >= frame.totalEvents,
    activeAnchorIds: frame.activeAnchorIds,
    observable: frame.observable,
    recipe: frame.recipe,
  };
}

// The narrative column, ordered by the questions a student actually asks in
// the order they ask them. The first version led with the acceptance sentence
// and buried the steps under a collapsible, so the column read as four
// unrelated facts; someone arriving from a single main() could not tell which
// file was theirs or where to type.
//
//   1. what am I making it do      → mission
//   2. why now, what broke         → why          (was missing entirely)
//   3. where do I type             → editTarget   (file · symbol, one jump)
//   4. what exactly do I do        → steps        (was at the very bottom)
//   5. why are there three files   → files        (was inside a <details>)
//   6. what data will run          → input
//   7. how do I know I am done     → doneWhen
export function focusRailModel(project) {
  const scenario = project.scenarios[0];
  const bridge = project.learningBridge || {};
  const editable = (project.sourceMappings || []).find((mapping) => mapping.role === "editable");
  const roles = list(bridge.fileRoles);
  // Matching a role to a file by suffix has two traps, and the workbench fell
  // into both: `.requirement-change.test.cpp` also ends with `.cpp`, and so
  // does the read-only `demo/main.cpp`, which is not one of the three files the
  // map is describing. So: assign each file to its MOST SPECIFIC role, keep the
  // editable file whenever two files claim the same role, and never let the
  // demo harness stand in for the student's own file.
  const byRole = new Map();
  const specific = [...roles].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const file of list(project.files)) {
    if (/^demo\//i.test(String(file.path))) continue;
    const role = specific.find((item) => String(file.path).endsWith(item.suffix));
    if (!role) continue;
    const current = byRole.get(role.suffix);
    if (!current || (file.editable && !current.editable)) byRole.set(role.suffix, file);
  }
  const fileOf = (suffix) => byRole.get(suffix);
  return {
    mission: project.brief.mission,
    why: project.transformation.breakingEvent,
    editTarget: editable ? {
      filePath: editable.filePath,
      // `Class::method` is how the definition is written; a student looking for
      // where to type needs the plain function name plus its file.
      symbol: String(editable.symbol || "").split("::").at(-1),
      qualified: editable.symbol,
      label: editable.display.label,
    } : null,
    steps: String(bridge.editInstruction || "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean),
    files: roles.map((role) => {
      // `.requirement-change.test.cpp` also ends with `.cpp`, so the map has to
      // match the most specific suffix or the test file claims to be the
      // student's file.
      const file = fileOf(role.suffix);
      return {
        suffix: role.suffix,
        label: role.label,
        description: role.description,
        path: file ? file.path : "",
        mine: Boolean(file && file.editable),
      };
    }).filter((item) => item.path),
    callSite: bridge.familiarCode || "",
    input: { label: "Dữ liệu sẽ chạy", text: scenario ? scenario.inputSummary : "" },
    doneWhen: { label: "Xong khi", text: project.brief.doneWhen },
  };
}

export function mappingRibbonModel(project, activeFilePath = "") {
  const items = project.sourceMappings.map((mapping) => ({
    id: mapping.id,
    label: mapping.display.label,
    description: mapping.display.description || "",
    role: mapping.role,
    editable: mapping.role === "editable",
    filePath: mapping.filePath,
    symbol: mapping.symbol,
    span: mapping.span,
    active: Boolean(activeFilePath) && mapping.filePath === activeFilePath,
  }));
  return { items, evidence: project.capability.capabilities.map((c) => ({ label: c.display.label, claims: c.evidence.map((e) => e.claim) })) };
}

// Growth spine: đã có → đang build → có thể mở rộng. No score, no lock.
export function growthModel(project) {
  return {
    items: project.growth.map((g) => ({
      id: g.id,
      label: g.display.label,
      description: g.display.description || "",
      state: g.state,
    })),
  };
}

// A project that has evolved carries more than one unlocked scenario. Which one
// runs is the student's choice, so it must be visible — pinning scenarios[0]
// would silently hide every stage the project already earned.
export function scenarioPickerModel(project, activeScenarioId = "") {
  const scenarios = list(project && project.scenarios);
  const known = scenarios.some((scenario) => scenario.id === activeScenarioId);
  const activeId = known ? activeScenarioId : (scenarios[0] && scenarios[0].id) || "";
  return {
    multiple: scenarios.length > 1,
    activeId,
    options: scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.display.label,
      inputSummary: scenario.inputSummary || "",
      active: scenario.id === activeId,
    })),
  };
}

// Growth is offered, never forced, and only on real evidence: every requirement
// the project has opened must already be met. `nextAction` supplies the reason
// so the CTA explains itself instead of shouting a slogan.
export function evolveActionModel(project) {
  const requirements = list(project && project.requirements);
  const available = requirements.length > 0 && requirements.every((req) => req.state === "met");
  if (!available) return { available: false, label: "", reason: "" };
  const next = (project.growth || []).find((item) => item.state === "next");
  return {
    available: true,
    label: (project.nextAction && project.nextAction.label) || "Mở rộng tình huống",
    reason: (project.nextAction && project.nextAction.reason)
      || (next ? `Bước tiếp theo: ${next.display.label}` : "Yêu cầu hiện tại đã có evidence đạt."),
  };
}

const REQ_STATE_LABEL = Object.freeze({ candidate: "Chưa mở", failing: "Đang hỏng", met: "Đã đạt" });

// The ONLY place a requirement verdict is allowed to appear.
export function requirementsModel(project, evidence = []) {
  const evidenceById = new Map(list(evidence).map((e) => [e && e.id, e]));
  const items = project.requirements.map((req) => ({
    id: req.id,
    label: req.display.label,
    description: req.display.description || "",
    state: req.state,
    stateLabel: REQ_STATE_LABEL[req.state],
    failures: req.failureEvidenceIds.map((id) => evidenceById.get(id)).filter(Boolean),
    passes: req.passEvidenceIds.map((id) => evidenceById.get(id)).filter(Boolean),
  }));
  return { items, met: items.filter((i) => i.state === "met").length, total: items.length };
}

// Header strip: orientation only. Verdict words are deliberately absent so the
// same truth is not repeated in header + Preview + Checks.
export function statusStripModel(project, run, activeScenarioId = "") {
  // Name the scenario that will actually run. Once a project has evolved it
  // has more than one, and pinning scenarios[0] would caption the header with
  // a situation the student is not looking at.
  const scenario = project.scenarios.find((item) => item.id === activeScenarioId) || project.scenarios[0];
  const current = project.growth.find((g) => g.state === "current");
  const runText = run
    ? (run.status === "completed" ? `đã quan sát xong · ${Math.round(run.durationMs)} ms` : "chưa quan sát được")
    : "chưa chạy";
  // An item with nothing to say is dropped rather than painted as an empty
  // chip: a blank header slot reads as a broken value, not as "not applicable".
  return [
    { label: "Tình huống", text: scenario ? scenario.display.label : "" },
    { label: "Lần chạy gần nhất", text: runText },
    { label: "Bước hiện tại", text: current ? current.display.label : "" },
  ].filter((item) => item.text);
}

// ---------------------------------------------------------------------------
// S4 — decision sheet + inert reference
// ---------------------------------------------------------------------------

// A decision sheet, not a card gallery: every row answers the same five
// questions so the student compares directions on the SAME axes, and the sheet
// carries exactly one primary action.
export function decisionSheetModel(session, selectedPathwayId = null) {
  const rows = (session ? session.pathways : []).map((pathway) => ({
    id: pathway.id,
    title: pathway.display.label,
    goal: pathway.purpose,
    oldAssumption: { label: "Giả định cũ", text: pathway.transformation.oldAssumption },
    breakingEvent: { label: "Biến cố phá giả định", text: pathway.transformation.breakingEvent },
    newCapability: { label: "Năng lực mới", text: pathway.transformation.newCapability },
    observableOutcome: { label: "Sẽ quan sát được", text: pathway.transformation.observableOutcome },
    buildable: pathway.buildable,
    selected: pathway.id === selectedPathwayId,
    note: pathway.buildable ? "" : "Hướng này chưa có biến cố làm lời giải cũ sai, nên chưa dựng được.",
  }));

  const chosen = rows.find((row) => row.selected);
  const ready = Boolean(chosen && chosen.buildable);
  return {
    summary: session ? session.analysis.summary : "",
    rows,
    empty: rows.length === 0,
    primaryCta: {
      label: "Dựng bản của em",
      pathwayId: chosen ? chosen.id : null,
      disabled: !ready,
      reason: ready ? "" : (chosen ? chosen.note : "Chọn một hướng ở trên trước."),
    },
  };
}

// A reference is inert by construction, not by convention: no controls, no
// anchors to fix, no cursor. If the backend ever sends live bits, they are
// stripped here so a sample can never be mistaken for the student's run.
function inertObservable(observable) {
  return { ...observable, anchors: [], controls: [] };
}
function inertRecipe(recipe) {
  return {
    ...recipe,
    overlays: recipe.overlays.filter((o) => o.kind !== "error-anchor"),
    controlPack: { kind: "none", display: recipe.controlPack.display },
  };
}

export function referenceModel(reference) {
  if (!reference || !reference.recipe) return null;
  // §5: the recipe belongs to the storyboard; every frame is projected through it.
  const recipe = inertRecipe(reference.recipe);
  return {
    isReference: true,
    provenanceLabel: "Mẫu hành vi · không chạy code của em",
    title: reference.display.label,
    description: reference.display.description || "",
    scenario: { label: reference.scenario.display.label, inputSummary: reference.scenario.inputSummary },
    frames: reference.frames.map((frame) => ({
      id: frame.id,
      caption: frame.caption,
      highlightMappingIds: frame.highlightMappingIds,
      preview: composePreview(inertObservable(frame.observable), recipe, "reference"),
    })),
  };
}

// ---------------------------------------------------------------------------
// Evidence — the ONLY source of a requirement verdict (§7)
// ---------------------------------------------------------------------------

const EVIDENCE_KIND_LABEL = Object.freeze({
  "compile": "Biên dịch",
  "unit-test": "Unit test",
  "benchmark": "Benchmark",
  "simulation": "Mô phỏng",
});

export function normalizeEvidenceList(raw) {
  return list(raw).map((e) => {
    if (!e || typeof e !== "object") return null;
    const id = text(e.id, 120);
    if (!id) return null;
    const kind = ["compile", "unit-test", "benchmark", "simulation"].includes(e.kind) ? e.kind : "unit-test";
    const detail = text(e.detail, 4000);
    return {
      id,
      at: text(e.at, 40),
      kind,
      kindLabel: EVIDENCE_KIND_LABEL[kind],
      outcome: e.outcome === "pass" ? "pass" : "fail",
      durationMs: num(e.durationMs, 0),
      detail,
      // §7 forbids "PASS · 472ms" with no content. We do not fabricate a
      // reason — we mark it so the UI can say the check reported nothing.
      detailMissing: detail.length === 0,
      requirementId: text(e.requirementId, 120) || null,
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Editor identity
// ---------------------------------------------------------------------------

// The activity-workspace shell rewrites editor ids to a safe slug
// (normalizeEditors: /[^a-zA-Z0-9_-]/g → "-", then "-copy" on collision).
// Anything that addresses an editor by contract filePath — jump-to-symbol,
// tab activation, getCode — has to resolve through the SAME rule, or it fails
// silently and sends the student to line 1.
export function editorIdsForPaths(paths) {
  const seen = new Set();
  const map = new Map();
  list(paths).forEach((path, index) => {
    const base = String(path || `editor-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
    let id = base || `editor-${index + 1}`;
    while (seen.has(id)) id += "-copy";
    seen.add(id);
    map.set(path, id);
  });
  return map;
}

// SourceSpan (1-based line, 0-based column) → a CodeMirror range that is always
// inside the document. A mapping can legitimately go stale between revisions,
// and a backend may send a span longer than the file; neither may throw
// "Selection points outside of document" at the student, and neither may jump
// somewhere invented. Clamping keeps the honest part of the location.
export function spanToRange(source, span) {
  if (!span) return null;
  const doc = String(source == null ? "" : source);
  const lines = doc.split("\n");
  const offsetAt = (line, column) => {
    const lineIndex = Math.max(0, Math.min(Math.floor(line) - 1, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < lineIndex; i += 1) offset += lines[i].length + 1;
    const withinLine = Math.max(0, Math.min(Math.floor(column), lines[lineIndex].length));
    // A line past the end of the file resolves to the end of the document.
    if (Math.floor(line) - 1 > lines.length - 1) return doc.length;
    return Math.min(doc.length, offset + withinLine);
  };
  const from = offsetAt(span.startLine, span.startColumn);
  const to = Math.max(from, offsetAt(span.endLine, span.endColumn));
  return { from, to };
}
