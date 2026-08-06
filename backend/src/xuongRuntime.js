"use strict";

const crypto = require("crypto");
const runCpp = require("./runCpp");
const registry = require("./xuongScenarioRegistry");
const { validateAndCanonicalizeRecipe } = require("./xuongContract");
const { planView } = require("./xuongViewPlanner");
const { BASE_LABEL, OVERLAY_LABEL, LAYOUT_LABEL, CONTROL_LABEL } = require("./xuongPreviewCatalog");

const hash = (value) => `sha256:${crypto.createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validateObservableModel(observable, project) {
  if (!observable || observable.schemaVersion !== "xuong.observable.v2") {
    throw Object.assign(new Error("ObservableModel thiếu schemaVersion v2."), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
  }
  const bounded = [
    ["entities", observable.entities, 400],
    ["relations", observable.relations, 1000],
    ["events", observable.events, 500],
    ["anchors", observable.anchors, 100],
    ["metrics", observable.metrics, 20],
    ["outputs", observable.outputs, 40],
  ];
  for (const [name, value, limit] of bounded) {
    if (!Array.isArray(value) || value.length > limit) {
      throw Object.assign(new Error(`ObservableModel.${name} vượt giới hạn runtime.`), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
    }
  }
  if (!Number.isInteger(observable.cursor) || observable.cursor < 0 || observable.cursor > observable.events.length) {
    throw Object.assign(new Error("ObservableModel.cursor nằm ngoài trace."), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
  }
  const entityIds = new Set(observable.entities.map((entity) => entity.id));
  const mappingIds = new Set(sourceMappings(project || {}).map((mapping) => mapping.id));
  for (const [index, event] of observable.events.entries()) {
    if (!event || event.index !== index || !Array.isArray(event.entityIds) || event.entityIds.some((id) => !entityIds.has(id))) {
      throw Object.assign(new Error("TraceEvent không liên tục hoặc trỏ entity không tồn tại."), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
    }
  }
  for (const anchor of observable.anchors) {
    if (!anchor || !Number.isInteger(anchor.eventIndex) || anchor.eventIndex < 0 || anchor.eventIndex >= observable.events.length || !mappingIds.has(anchor.sourceMappingId)) {
      throw Object.assign(new Error("EventAnchor trỏ event hoặc SourceMapping không tồn tại."), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
    }
    if (anchor.entityId && !entityIds.has(anchor.entityId)) {
      throw Object.assign(new Error("EventAnchor trỏ entity không tồn tại."), { code: "INVALID_CONTRACT_PAYLOAD", status: 500 });
    }
  }
  return observable;
}

function sourceRevision(files) {
  return hash((files || []).filter((file) => file.editable).map((file) => `${file.path}\u0000${file.content || ""}`).sort().join("\u0001"));
}

function lineOf(source, needle) {
  const index = String(source || "").indexOf(needle);
  return index < 0 ? 1 : String(source).slice(0, index).split("\n").length;
}

// Where the editable symbol is DEFINED. Searching for the bare method name
// finds the first call site instead — for RetryBudget and OrderFlow that is
// inside the read-only function, so "Đi tới hàm" used to open code the student
// must not touch. `Class::method` only appears at the definition.
function definitionLine(source, symbol) {
  const qualified = String(symbol || "");
  const text = String(source || "");
  if (qualified && text.includes(qualified)) return lineOf(text, qualified);
  return lineOf(text, qualified.split("::").at(-1));
}

// A project sits on exactly one unlocked stage of its arc. Everything the
// runtime renders (mapping, reference, check identity) must follow that stage.
function stageIndexOf(project) { return Math.max(0, Number(project && project._stageIndex) || 0); }

function sourceMappings(project) {
  const arc = registry.getArc(project._seedId, stageIndexOf(project));
  const source = (project.files || []).find((file) => file.editable);
  if (!arc || !source) return [];
  const startLine = definitionLine(source.content, arc.sourceSymbol);
  return [{
    id: "main-editable-symbol",
    filePath: source.path,
    symbol: arc.sourceSymbol,
    span: { startLine, startColumn: 0, endLine: startLine + 24, endColumn: 1 },
    contentHash: hash(source.content),
    display: { label: arc.sourceLabel },
    role: "editable",
  }];
}

function scenarioSummary(arc) { return { id: arc.id, display: arc.display, inputSummary: arc.inputSummary }; }

function publicPathway(technical, files) {
  const arc = registry.getArc(technical.seedId);
  if (!arc) return null;
  const editable = (files || []).find((file) => file.editable);
  const mappingId = "main-editable-symbol";
  const mapping = editable ? [{ id: mappingId, filePath: editable.path, symbol: arc.sourceSymbol, span: { startLine: definitionLine(editable.content, arc.sourceSymbol), startColumn: 0, endLine: definitionLine(editable.content, arc.sourceSymbol) + 24, endColumn: 1 }, contentHash: hash(editable.content), display: { label: arc.sourceLabel }, role: "editable" }] : [];
  return {
    id: technical.id,
    // AI proposes the semantic match; trusted registry copy explains the
    // buildable product. This prevents a fluent re-skin ("BFS in a robot")
    // from becoming the title/brief of a pathway whose real change is
    // diagonal movement.
    display: { label: arc.productTitle, description: arc.display.description },
    purpose: arc.transformation.requirement,
    context: arc.display.description,
    application: arc.capability.summary,
    capability: { summary: arc.capability.summary, capabilities: [{ id: "core-capability", display: { label: arc.capability.label }, evidence: mapping.length ? [{ mappingId, claim: arc.capability.claim }] : [] }], constraints: [arc.transformation.oldAssumption] },
    transformation: { oldAssumption: arc.transformation.oldAssumption, breakingEvent: arc.transformation.breakingEvent, newCapability: arc.transformation.newCapability, observableOutcome: arc.transformation.observableOutcome, editableMappingIds: mapping.map((item) => item.id) },
    sourceMappings: mapping,
    scenarioId: arc.id,
  };
}

function projectionRecipe(arc, observable, { reference = false } = {}) {
  const planned = planView(observable, arc.recipe);
  const overlays = planned.overlays;
  // One label table, shared with the catalog. A missing entry used to fall back
  // to "Thông tin bổ sung", which told a student nothing about what the legend
  // colour meant — so the table has to cover every overlay in the grammar.
  return validateAndCanonicalizeRecipe({
    schemaVersion: "xuong.preview-recipe.v2",
    base: { kind: planned.base, display: { label: BASE_LABEL[planned.base] || "Preview" } },
    overlays: overlays.map((kind) => ({ kind, display: { label: OVERLAY_LABEL[kind] || "Thông tin bổ sung" } })),
    // ReferenceStoryboard is deliberately inert: it explains the expected
    // product behavior but must never look like a live user run.  A control
    // pack is only materialized for ScenarioRun responses.
    controlPack: reference
      ? { kind: "none", display: { label: CONTROL_LABEL.none } }
      : { kind: planned.control, display: { label: CONTROL_LABEL[planned.control] || CONTROL_LABEL.stepper } },
    // The layout label used to be one hardcoded string for all three packs, so
    // a wide table and a focused meter both claimed the same framing.
    layout: { kind: planned.layout, display: { label: LAYOUT_LABEL[planned.layout] || LAYOUT_LABEL.balanced } },
    inspector: { alwaysAvailable: true, display: { label: "Chi tiết lần chạy" } },
  }, observable);
}

function compileDiagnostics(build, project) {
  const mapping = sourceMappings(project || {})[0];
  return [{
    severity: "error",
    message: String(build && build.stderr || "Không thể biên dịch source hiện tại.").trim().slice(0, 2400) || "Không thể biên dịch source hiện tại.",
    ...(mapping ? { filePath: mapping.filePath, span: mapping.span, sourceMappingId: mapping.id } : {}),
  }];
}

async function runScenario({ project, scenarioId, controlState, settings, runId }) {
  // Any stage the project has already unlocked stays runnable, so a later
  // change can be re-checked against an earlier scenario. Stages the project
  // has not reached are not addressable at all.
  const stageIndex = registry.findStageIndex(project._seedId, scenarioId);
  const arc = stageIndex >= 0 && stageIndex <= stageIndexOf(project) ? registry.getArc(project._seedId, stageIndex) : null;
  if (!arc) throw Object.assign(new Error("Scenario không tồn tại trong registry."), { code: "SCENARIO_NOT_FOUND", status: 404 });
  const source = (project.files || []).find((file) => file.editable);
  const header = (project.files || []).find((file) => /\.hpp$/i.test(file.path));
  if (!source || !header) throw Object.assign(new Error("Scenario không thể materialize vì thiếu source project."), { code: "RUN_FAILED", status: 422 });
  let build;
  const started = Date.now();
  try {
    build = await runCpp.compileProject({ files: [{ path: header.path, content: header.content }, { path: source.path, content: source.content }, { path: "scenario-run.cpp", content: arc.buildHarness({ header: header.path }) }], settings });
    if (!build.ok) return {
      type: "scenario-run", id: runId, projectId: project.id, scenarioId, sourceRevision: sourceRevision(project.files), provenance: "user-source", status: "compile-error", startedAt: new Date().toISOString(), durationMs: Date.now() - started, eventCount: 0, diagnostics: compileDiagnostics(build, project), outputSummary: "Source hiện tại chưa biên dịch được.", _passed: false, _actual: null, _observable: null, _recipe: null, registryVersion: registry.REGISTRY_VERSION,
    };
    const executed = await runCpp.runBinary({ binaryPath: build.binaryPath, input: "", timeMs: settings && settings.timeMs });
    if (executed.status !== "OK") return {
      type: "scenario-run", id: runId, projectId: project.id, scenarioId, sourceRevision: sourceRevision(project.files), provenance: "user-source", status: executed.status === "TIMEOUT" ? "timed-out" : "runtime-error", startedAt: new Date().toISOString(), durationMs: Date.now() - started, eventCount: 0, diagnostics: [{ severity: "error", message: String(executed.stderr || executed.stdout || "Scenario dừng khi chạy.").trim().slice(0, 2400) || "Scenario dừng khi chạy." }], outputSummary: "Scenario chưa tạo được quan sát.", _passed: false, _actual: null, _observable: null, _recipe: null, registryVersion: registry.REGISTRY_VERSION,
    };
    const actual = arc.parse(executed.stdout);
    const passed = same(actual, arc.expected);
    const mapping = sourceMappings(project)[0];
    const scenario = scenarioSummary(arc);
    const partial = arc.model({ actual, passed, mappingId: mapping.id, runId, scenario, controlState });
    const observable = { schemaVersion: "xuong.observable.v2", runId, scenario, cursor: partial.events.length, ...partial };
    validateObservableModel(observable, project);
    const recipe = projectionRecipe(arc, observable);
    return {
      type: "scenario-run", id: runId, projectId: project.id, scenarioId, sourceRevision: sourceRevision(project.files), provenance: "user-source", status: "completed", startedAt: new Date().toISOString(), durationMs: Date.now() - started, eventCount: observable.events.length, diagnostics: [], outputSummary: passed ? "Scenario đã quan sát được hành vi mới." : "Scenario đã chạy; hành vi mới chưa đạt điều kiện.", _passed: passed, _actual: actual, _expected: arc.expected, _observable: observable, _recipe: recipe, registryVersion: registry.REGISTRY_VERSION,
    };
  } finally { if (build) await runCpp.cleanupWorkdir(build.workdir); }
}

function publicRun(run) {
  const { _passed, _actual, _expected, _observable, _recipe, registryVersion, ...dto } = run;
  return dto;
}

function referenceStoryboard(project) {
  const arc = registry.getArc(project._seedId, stageIndexOf(project));
  const mapping = sourceMappings(project)[0];
  if (!arc || !mapping) throw Object.assign(new Error("Không materialize được mẫu hành vi."), { code: "SCENARIO_NOT_FOUND", status: 404 });
  const scenario = scenarioSummary(arc);
  const partial = arc.model({ actual: arc.expected, passed: true, mappingId: mapping.id, runId: `reference-${project.id}`, scenario });
  const observable = { schemaVersion: "xuong.observable.v2", runId: `reference-${project.id}`, scenario, cursor: partial.events.length, ...partial };
  validateObservableModel(observable, project);
  return { type: "reference-storyboard", id: `reference-${project.id}`, projectId: project.id, display: { label: `Mẫu hành vi: ${arc.display.label}`, description: "Bản tham chiếu của Xưởng, không chạy source của em." }, scenario, recipe: projectionRecipe(arc, observable, { reference: true }), frames: [{ id: "expected-behavior", caption: arc.transformation.observableOutcome, observable: { ...observable, controls: [] }, highlightMappingIds: [mapping.id] }] };
}

function observableAtCursor(observable, cursor) {
  // Observable entities hold the final materialized state once. TraceEvent
  // changedFields are deltas, so replay can reconstruct an earlier snapshot
  // without storing a full entity snapshot for every event.
  const entities = (observable.entities || []).map((entity) => ({ ...entity, state: { ...(entity.state || {}) } }));
  const byEntityId = new Map(entities.map((entity) => [entity.id, entity]));
  const metrics = (observable.metrics || []).map((metric) => ({ ...metric }));
  const byMetricId = new Map(metrics.map((metric) => [metric.id, metric]));
  for (let index = observable.events.length - 1; index >= cursor; index -= 1) {
    for (const field of observable.events[index].changedFields || []) {
      if (field.entityId && byEntityId.has(field.entityId)) {
        byEntityId.get(field.entityId).state[field.fieldId] = field.before;
      } else if (!field.entityId && byMetricId.has(field.fieldId)) {
        byMetricId.get(field.fieldId).value = field.before;
      }
    }
  }
  return {
    ...observable,
    cursor,
    entities,
    metrics,
    events: observable.events.slice(0, cursor),
    controls: (observable.controls || []).map((control) => control.id === "trace-step" ? { ...control, value: cursor } : control),
  };
}

function replay(run, cursor) {
  if (!run || run.status !== "completed" || !run._observable || !run._recipe) throw Object.assign(new Error("Lần chạy này không thể phát lại."), { code: "RUN_NOT_REPLAYABLE", status: 409 });
  const total = run.eventCount;
  const value = cursor == null || cursor === "" ? total : Number(cursor);
  if (!Number.isInteger(value) || value < 0 || value > total) throw Object.assign(new Error("Vị trí phát lại nằm ngoài trace."), { code: "CURSOR_OUT_OF_RANGE", status: 422 });
  const observable = observableAtCursor(run._observable, value);
  // The cursor identifies the event currently inspected.  Keep its anchor
  // active so the inspector can jump from the visible failure to code even
  // when the cursor is exactly that event's index (the golden fixture uses
  // this behavior for cursor=1 / eventIndex=1).
  return { cursor: value, totalEvents: total, observable, recipe: run._recipe, activeAnchorIds: (observable.anchors || []).filter((anchor) => anchor.eventIndex <= value).map((anchor) => anchor.id) };
}

// Stage 0 keeps the original verifier identity so evidence written before the
// arc chain existed still refers to the same verifier.
function verifierIdFor(seedId, stageIndex) {
  return stageIndex > 0 ? `trusted:${seedId}:stage-${stageIndex + 1}:requirement` : `trusted:${seedId}:requirement`;
}

function checkRun(project, run) {
  // Checks belong to the stage the run exercised, not to the project's newest
  // stage: re-checking an earlier scenario must not touch a later requirement.
  const stageIndex = Math.max(0, registry.findStageIndex(project._seedId, run.scenarioId));
  const arc = registry.getArc(project._seedId, stageIndex);
  const requirement = (project._v2Requirements || [])[stageIndex];
  const requirementId = requirement && requirement.id || "trusted-change";
  const verifierId = verifierIdFor(project._seedId, stageIndex);
  if (run.status !== "completed") return [{ kind: "compile", outcome: "fail", durationMs: run.durationMs, detail: `Không thể kiểm tra ${arc.transformation.newCapability}: source không tạo được ScenarioRun (${run.status}).`, requirementId, verifierId }];
  if (run._passed) return [{ kind: "simulation", outcome: "pass", durationMs: run.durationMs, detail: `Scenario ${arc.display.label}: expected ${JSON.stringify(run._expected)}, actual ${JSON.stringify(run._actual)} tại ${arc.sourceLabel}; hành vi mới đã đúng.`, requirementId, verifierId }];
  return [{ kind: "simulation", outcome: "fail", durationMs: run.durationMs, detail: `Scenario ${arc.display.label}: expected ${JSON.stringify(run._expected)}, actual ${JSON.stringify(run._actual)} tại ${arc.sourceLabel}; ${arc.transformation.breakingEvent}`, requirementId, verifierId }];
}

module.exports = { hash, sourceRevision, sourceMappings, scenarioSummary, publicPathway, runScenario, publicRun, referenceStoryboard, replay, checkRun, validateObservableModel, observableAtCursor, stageIndexOf, verifierIdFor };
