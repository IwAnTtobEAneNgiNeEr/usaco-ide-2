// Contract tests for the Xưởng v2 adapter/view-model layer (Agent A · A0).
//
// Per docs/XUONG-API-CONTRACT.md §8 these read the SHARED golden fixture at
// docs/fixtures/xuong-contract-v2.json — never an inline copy. If the
// coordinator changes the contract, this file must fail before any UI does.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTRACT_VERSION,
  normalizeSession, normalizeProject, normalizeReference, normalizeRun,
  normalizeObservable, normalizeRecipe, normalizeReplay,
  normalizeRunEnvelope, normalizeReplayEnvelope, normalizeReferenceEnvelope,
  checkRecipe, canonicalOverlays,
  buildOutputModel, previewModel, anchorTargets, replayModel,
  focusRailModel, mappingRibbonModel, growthModel, requirementsModel,
  statusStripModel, decisionSheetModel, referenceModel, normalizeEvidenceList, editorIdsForPaths, spanToRange,
  scenarioPickerModel, evolveActionModel,
} from "../src/core/xuong-v2-model.js";

const golden = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/xuong-contract-v2.json", import.meta.url), "utf8")
);
const F = golden.fixtures;

// Every string a user could read in a rendered view-model. Renderer-only data
// (raw entity.state used to draw a wall, geometry, ids used as DOM keys) is
// deliberately NOT collected — the leak rule is about displayed TEXT.
const TEXT_KEYS = new Set(["label", "description", "text", "caption", "summary", "claim", "reason", "detail", "inputSummary", "outputSummary"]);
function userText(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((item) => userText(item, out)); return out; }
  if (typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (TEXT_KEYS.has(key) && typeof value === "string") out.push(value);
    else if (value && typeof value === "object") userText(value, out);
  }
  return out;
}

test("golden fixture is the frozen v2 contract version", () => {
  assert.equal(golden.contractVersion, CONTRACT_VERSION);
});

// --- Reference vs user run: two different types, never one flagged type ------

test("reference storyboard normalizes as reference and carries no run identity", () => {
  const reference = normalizeReference(F.mazeReference.reference);
  assert.equal(reference.type, "reference-storyboard");
  assert.equal(reference.isReference, true);
  assert.equal(reference.frames.length, 1);
  assert.equal(reference.frames[0].caption, "Khi lối cũ bị chặn, sản phẩm phải chọn một đường vòng hợp lệ.");
  assert.deepEqual(reference.frames[0].highlightMappingIds, ["map-shortest-route"]);
  // A reference must never look like something the student ran.
  assert.equal("status" in reference, false);
  assert.equal("runId" in reference, false);
  assert.equal("provenance" in reference, false);
});

test("user run normalizes as scenario-run and is never marked reference", () => {
  const run = normalizeRun(F.mazeUserFail.run);
  assert.equal(run.type, "scenario-run");
  assert.equal(run.isReference, false);
  assert.equal(run.provenance, "user-source");
  assert.equal(run.status, "completed");
  assert.equal(run.eventCount, 2);
});

test("route adapters require the frozen v2 envelopes and preserve nullable preview fields", () => {
  const runEnvelope = normalizeRunEnvelope({
    project: F.mazeUserFail.project,
    run: F.mazeUserFail.run,
    observable: F.mazeUserFail.observable,
    recipe: F.mazeUserFail.recipe,
  });
  assert.equal(runEnvelope.project.display.label, F.mazeUserFail.project.display.label);
  assert.equal(runEnvelope.run.type, "scenario-run");
  assert.equal(runEnvelope.observable.runId, F.mazeUserFail.run.id);
  assert.equal(runEnvelope.recipe.base.kind, "grid");
  const compileEnvelope = normalizeRunEnvelope({ project: F.mazeUserFail.project, run: F.mazeUserFail.run });
  assert.equal(compileEnvelope.observable, null);
  assert.equal(compileEnvelope.recipe, null);
  assert.equal(normalizeRunEnvelope({ project: F.mazeUserFail.project }), null);

  const replayEnvelope = normalizeReplayEnvelope({ run: F.mazeUserFail.run, replay: F.mazeUserFail.replay });
  assert.equal(replayEnvelope.replay.cursor, 1);
  assert.equal(normalizeReplayEnvelope({ replay: F.mazeUserFail.replay }), null);

  const referenceEnvelope = normalizeReferenceEnvelope(F.mazeReference);
  assert.equal(referenceEnvelope.reference.type, "reference-storyboard");
  assert.equal(normalizeReferenceEnvelope({}), null);
});

// --- Build output is compile/runtime only -----------------------------------

test("build output reports runtime only and never a pass or fail verdict", () => {
  const build = buildOutputModel(normalizeRun(F.mazeUserFail.run));
  assert.equal(build.state, "ok");
  assert.deepEqual(build.diagnostics, []);
  const words = JSON.stringify(build).toLowerCase();
  for (const banned of ["pass", "fail", "verdict", "đạt", "wa", "ac"]) {
    assert.equal(words.includes(banned), false, `build output leaked verdict word "${banned}"`);
  }
});

test("a compile error yields diagnostics and no preview", () => {
  const raw = structuredClone(F.mazeUserFail);
  raw.run.status = "compile-error";
  raw.run.diagnostics = [{ severity: "error", message: "thiếu dấu ;", filePath: "MazeNavigator.cpp", sourceMappingId: "map-shortest-route" }];
  const build = buildOutputModel(normalizeRun(raw.run));
  assert.equal(build.state, "compile-error");
  assert.equal(build.diagnostics.length, 1);
  assert.equal(build.diagnostics[0].message, "thiếu dấu ;");

  const preview = previewModel({ run: normalizeRun(raw.run), observable: null, recipe: null });
  assert.equal(preview.available, false);
  assert.equal(preview.reason, "build-failed");
});

test("no run yet means an empty preview, never a running state", () => {
  const preview = previewModel({ run: null, observable: null, recipe: null });
  assert.equal(preview.available, false);
  assert.equal(preview.reason, "no-run");
  assert.equal(preview.running, false);
});

// --- Recipe interpreter: compatibility + canonicalization -------------------

test("the maze recipe validates against its own observable", () => {
  const result = checkRecipe(normalizeRecipe(F.mazeUserFail.recipe), normalizeObservable(F.mazeUserFail.observable));
  assert.equal(result.valid, true, JSON.stringify(result.problems));
});

test("error-anchor overlay is invalid when the run produced no anchors", () => {
  const result = checkRecipe(
    normalizeRecipe(F.mazeUserFail.recipe),            // has error-anchor overlay
    normalizeObservable(F.routeWatchGraph.observable)  // has anchors: []
  );
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "OVERLAY_REQUIRES_ANCHOR"));
});

test("an overlay outside the base compatibility matrix is rejected", () => {
  const recipe = normalizeRecipe(F.mazeUserFail.recipe);
  recipe.overlays = [{ kind: "heap", display: { label: "Đống ưu tiên" } }]; // heap ∉ grid
  const result = checkRecipe(recipe, normalizeObservable(F.mazeUserFail.observable));
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "OVERLAY_NOT_COMPATIBLE"));
});

test("more than two overlays is rejected", () => {
  const recipe = normalizeRecipe(F.mazeUserFail.recipe);
  recipe.overlays = [
    { kind: "path", display: { label: "a" } },
    { kind: "target", display: { label: "b" } },
    { kind: "heatmap", display: { label: "c" } },
  ];
  const result = checkRecipe(recipe, normalizeObservable(F.mazeUserFail.observable));
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "TOO_MANY_OVERLAYS"));
});

test("overlays render in canonical order with error-anchor first", () => {
  const sorted = canonicalOverlays([
    { kind: "path", display: { label: "Tuyến của em" } },
    { kind: "error-anchor", display: { label: "Điểm cần sửa" } },
  ]);
  assert.deepEqual(sorted.map((o) => o.kind), ["error-anchor", "path"]);
});

// --- Universal Inspector is a real preview, never labelled fallback ----------

test("universal-inspector renders as an ordinary Preview with no tier wording", () => {
  const preview = previewModel({
    run: normalizeRun(F.logMatcherInspector.run),
    observable: normalizeObservable(F.logMatcherInspector.observable),
    recipe: normalizeRecipe(F.logMatcherInspector.recipe),
  });
  assert.equal(preview.available, true);
  assert.equal(preview.base.kind, "universal-inspector");
  assert.equal(preview.base.label, "Preview");
  const text = userText(preview).join(" ").toLowerCase();
  for (const banned of ["fallback", "tier", "hạng", "dự phòng", "mặc định kỹ thuật"]) {
    assert.equal(text.includes(banned), false, `inspector preview leaked "${banned}"`);
  }
});

test("inspector state fields are shown only with their contract display labels", () => {
  const preview = previewModel({
    run: normalizeRun(F.logMatcherInspector.run),
    observable: normalizeObservable(F.logMatcherInspector.observable),
    recipe: normalizeRecipe(F.logMatcherInspector.recipe),
  });
  const entity = preview.entities[0];
  // "ordered" has a display label via changedFields; "timestamp" does not.
  assert.deepEqual(entity.stateLabels.map((f) => f.label), ["Thứ tự hợp lệ"]);
  assert.equal(entity.hiddenStateCount, 1);
  assert.equal(userText(entity).join(" ").includes("ordered"), false);
});

// --- Leak scan across every rendered surface --------------------------------

test("no rendered view-model text exposes ids, paths, hashes or symbols", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  const run = normalizeRun(F.mazeUserFail.run);
  const observable = normalizeObservable(F.mazeUserFail.observable);
  const recipe = normalizeRecipe(F.mazeUserFail.recipe);
  const surfaces = [
    previewModel({ run, observable, recipe }),
    focusRailModel(project),
    mappingRibbonModel(project, "MazeNavigator.cpp"),
    growthModel(project),
    statusStripModel(project, run),
    anchorTargets(observable, project).map((a) => ({ label: a.label, description: a.description })),
  ];
  const text = userText(surfaces).join(" ");
  const banned = [
    "map-shortest-route", "maze-wall-detour", "project-maze-navigator", "run-maze-user-r1",
    "anchor-blocked-cell", "cell-2-2", "MazeNavigator.cpp", "findRoute",
    "sha256:", "xuong.observable.v2", "needs-attention", "user-source", "error-anchor",
  ];
  for (const token of banned) {
    assert.equal(text.includes(token), false, `view-model text leaked "${token}"`);
  }
});

test("project keeps the beginner bridge from main() to the one editable component", () => {
  const project = normalizeProject({
    ...F.mazeUserFail.project,
    learningBridge: {
      intro: "main() nằm trong file scenario.",
      familiarCode: "Router r; r.update();",
      editInstruction: "Chỉ sửa TODO trong update().",
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện", description: "Chỉ đọc." },
        { suffix: ".cpp", label: "Phần em sửa", description: "Sửa TODO." },
      ],
    },
  });
  assert.equal(project.learningBridge.intro, "main() nằm trong file scenario.");
  assert.equal(project.learningBridge.familiarCode, "Router r; r.update();");
  assert.equal(project.learningBridge.fileRoles.length, 2);
});

// --- Anchor → source mapping → jump-to-symbol -------------------------------

test("an error anchor resolves to the editable symbol span it should open", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  const targets = anchorTargets(normalizeObservable(F.mazeUserFail.observable), project);
  assert.equal(targets.length, 1);
  const target = targets[0];
  assert.equal(target.severity, "error");
  assert.equal(target.label, "Ô bị chặn vẫn được thêm vào tuyến");
  assert.equal(target.eventIndex, 1);
  assert.equal(target.entityId, "cell-2-2");
  // Jump payload is code-facing, not display text.
  assert.equal(target.jump.filePath, "MazeNavigator.cpp");
  assert.equal(target.jump.symbol, "findRoute");
  assert.deepEqual(target.jump.span, { startLine: 18, startColumn: 0, endLine: 38, endColumn: 1 });
});

test("an anchor pointing at an unknown mapping is dropped, never jumped blindly", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  const observable = normalizeObservable(F.mazeUserFail.observable);
  observable.anchors[0].sourceMappingId = "map-does-not-exist";
  assert.deepEqual(anchorTargets(observable, project), []);
});

// --- Replay -----------------------------------------------------------------

test("replay exposes a real cursor over real events and no fake progress", () => {
  const model = replayModel(normalizeReplay(F.mazeUserFail.replay));
  assert.equal(model.cursor, 1);
  assert.equal(model.totalEvents, 2);
  assert.equal(model.atStart, false);
  assert.equal(model.atEnd, false);
  assert.deepEqual(model.activeAnchorIds, ["anchor-blocked-cell"]);
  assert.equal("percent" in model, false);
  assert.equal("autoPlay" in model, false);
});

// --- Focus rail / growth / requirements: one truth per layer ----------------

test("focus rail answers where-to-type before what-to-do, from the contract", () => {
  const rail = focusRailModel(normalizeProject(F.mazeUserFail.project));
  assert.equal(rail.mission, "Cập nhật hàm tìm đường để bỏ qua ô bị chặn mới.");
  assert.equal(rail.input.text, "Bản đồ 5×5, thêm tường tại ô (2,2).");
  assert.equal(rail.doneWhen.text, "Đường đi không đi xuyên qua tường và vẫn tới được đích khi còn lối khác.");
  // The rail must name the file and the plain function name — `Class::method`
  // is how C++ writes a definition, not how a student searches for it.
  assert.ok(rail.editTarget, "cột trái phải chỉ ra chỗ gõ");
  assert.equal(rail.editTarget.symbol, "findRoute");
  assert.ok(rail.editTarget.filePath.endsWith(".cpp"));
  assert.equal(rail.editTarget.symbol.includes("::"), false);
});

test("the file map gives each role a different file — .cpp must not swallow .test.cpp", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  project.learningBridge = {
    editInstruction: "một\nhai\nba",
    familiarCode: "int main() { }",
    fileRoles: [
      { suffix: ".hpp", label: "Bản mô tả · chỉ đọc", description: "khai báo" },
      { suffix: ".cpp", label: "File em sửa", description: "phần xử lý" },
      { suffix: ".requirement-change.test.cpp", label: "Bài chạy · chỉ đọc", description: "main() của tình huống" },
    ],
  };
  project.files = [
    { path: "Maze.hpp", editable: false, display: { label: "Maze.hpp" } },
    { path: "Maze.cpp", editable: true, display: { label: "Maze.cpp" } },
    { path: "Maze.requirement-change.test.cpp", editable: false, display: { label: "test" } },
    // Both of these also end with `.cpp` and neither is the student's file.
    { path: "demo/main.cpp", editable: false, display: { label: "demo" } },
    { path: "Maze.test.cpp", editable: false, display: { label: "test cũ" } },
  ];
  const rail = focusRailModel(project);
  assert.equal(rail.files.length, 3);
  assert.equal(new Set(rail.files.map((file) => file.path)).size, 3, "mỗi vai trò phải trỏ một file khác nhau");
  assert.deepEqual(rail.files.map((file) => file.path), ["Maze.hpp", "Maze.cpp", "Maze.requirement-change.test.cpp"]);
  assert.deepEqual(rail.files.map((file) => file.mine), [false, true, false]);
  assert.equal(rail.steps.length, 3);
});

test("growth spine is present/current/next with no percentage or lock", () => {
  const growth = growthModel(normalizeProject(F.mazeUserFail.project));
  assert.deepEqual(growth.items.map((g) => g.state), ["present", "current", "next"]);
  assert.equal(growth.items[1].label, "Tránh lối bị chặn");
  const json = JSON.stringify(growth);
  assert.equal(json.includes("percent"), false);
  assert.equal(json.includes("locked"), false);
});

test("requirement verdict lives in the checks model and nowhere in the status strip", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  const checks = requirementsModel(project, []);
  assert.equal(checks.items[0].state, "failing");
  assert.equal(checks.items[0].label, "Không đi qua ô bị chặn mới.");

  const strip = statusStripModel(project, normalizeRun(F.mazeUserFail.run));
  const stripText = userText(strip).join(" ").toLowerCase();
  for (const banned of ["đạt", "fail", "pass", "chưa đạt", "verdict"]) {
    assert.equal(stripText.includes(banned), false, `status strip duplicated the verdict word "${banned}"`);
  }
});

// --- Session: no pathway quota ---------------------------------------------

test("session keeps every pathway the backend returned, with no 3-5 cap", () => {
  const pathway = F.mazeUserFail.project;
  const many = Array.from({ length: 7 }, (_, i) => ({
    id: `p-${i}`,
    display: { label: `Hướng ${i}` },
    purpose: "p", context: "c", application: "a",
    capability: pathway.capability,
    transformation: pathway.transformation,
    sourceMappings: pathway.sourceMappings,
    scenarioId: "maze-wall-detour",
  }));
  const session = normalizeSession({ id: "s1", status: "analyzed", origin: { type: "problem" }, analysis: { summary: "s", concepts: [], constraints: [] }, pathways: many, selectedPathwayId: null, projectId: null });
  assert.equal(session.pathways.length, 7);
});

test("a pathway without a breaking event is not offered as buildable", () => {
  const base = F.mazeUserFail.project;
  const session = normalizeSession({
    id: "s2", status: "analyzed", origin: { type: "problem" },
    analysis: { summary: "s", concepts: [], constraints: [] },
    pathways: [
      { id: "ok", display: { label: "Có biến cố" }, purpose: "p", context: "c", application: "a", capability: base.capability, transformation: base.transformation, sourceMappings: base.sourceMappings, scenarioId: "s" },
      { id: "reskin", display: { label: "Chỉ đổi bối cảnh" }, purpose: "p", context: "c", application: "a", capability: base.capability, transformation: { ...base.transformation, breakingEvent: "" }, sourceMappings: base.sourceMappings, scenarioId: "s" },
    ],
    selectedPathwayId: null, projectId: null,
  });
  assert.deepEqual(session.pathways.map((p) => p.buildable), [true, false]);
});

// --- S4 decision sheet ------------------------------------------------------

function sessionOf(...transformations) {
  const base = F.mazeUserFail.project;
  return normalizeSession({
    id: "s", status: "analyzed", origin: { type: "problem" },
    analysis: { summary: "Lời giải của em đã tìm được đường ít bước.", concepts: [], constraints: [] },
    pathways: transformations.map((transformation, i) => ({
      id: `p-${i}`, display: { label: `Hướng ${i}` }, purpose: `Mục tiêu ${i}`,
      context: "c", application: "a", capability: base.capability,
      transformation, sourceMappings: base.sourceMappings, scenarioId: "maze-wall-detour",
    })),
    selectedPathwayId: null, projectId: null,
  });
}

test("each decision row states goal, old assumption, breaking event, new capability and outcome", () => {
  const sheet = decisionSheetModel(sessionOf(F.mazeUserFail.project.transformation), null);
  const row = sheet.rows[0];
  assert.equal(row.goal, "Mục tiêu 0");
  assert.equal(row.oldAssumption.text, "Mọi ô trong bản đồ đều có thể đi qua.");
  assert.equal(row.breakingEvent.text, "Một kệ hàng mới chặn ô (2,2) trên đường cũ.");
  assert.equal(row.newCapability.text, "Bỏ qua ô bị chặn và tìm đường vòng khi có thể.");
  assert.equal(row.observableOutcome.text, "Preview cho thấy tuyến cũ dừng tại tường thay vì đi xuyên qua nó.");
});

test("the sheet exposes exactly one primary CTA, not one per card", () => {
  const transformation = F.mazeUserFail.project.transformation;
  const sheet = decisionSheetModel(sessionOf(transformation, transformation), "p-1");
  assert.equal(typeof sheet.primaryCta.label, "string");
  assert.equal(sheet.primaryCta.pathwayId, "p-1");
  assert.equal(sheet.primaryCta.disabled, false);
  assert.deepEqual(sheet.rows.map((r) => r.selected), [false, true]);
  assert.equal("cta" in sheet.rows[0], false);
});

test("with nothing selected the CTA is disabled and says what to do", () => {
  const sheet = decisionSheetModel(sessionOf(F.mazeUserFail.project.transformation), null);
  assert.equal(sheet.primaryCta.disabled, true);
  assert.ok(sheet.primaryCta.reason.length > 0);
});

test("a re-skin row is shown but cannot become the CTA target", () => {
  const good = F.mazeUserFail.project.transformation;
  const reskin = { ...good, breakingEvent: "" };
  const sheet = decisionSheetModel(sessionOf(good, reskin), "p-1");
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[1].buildable, false);
  assert.equal(sheet.primaryCta.disabled, true);
});

test("an empty analysis yields no rows and no invented filler", () => {
  const sheet = decisionSheetModel(sessionOf(), null);
  assert.deepEqual(sheet.rows, []);
  assert.equal(sheet.empty, true);
});

// --- S4 reference storyboard is inert ---------------------------------------

test("reference model is labelled as a sample and offers no run controls", () => {
  const model = referenceModel(normalizeReference(F.mazeReference.reference));
  assert.equal(model.isReference, true);
  assert.equal(model.provenanceLabel, "Mẫu hành vi · không chạy code của em");
  assert.equal(model.frames.length, 1);
  assert.equal(model.frames[0].preview.available, true);
  // Inert: a reference never gets a live cursor, controls or anchors to fix.
  assert.equal(model.frames[0].preview.control.kind, "none");
  assert.deepEqual(model.frames[0].preview.anchors, []);
});

// --- Evidence (Checks tab) --------------------------------------------------

test("evidence keeps a readable detail and links back to its requirement", () => {
  const [ev] = normalizeEvidenceList([{
    id: "evidence-maze-blocked-fail", at: "2026-07-23T03:00:05.000Z", kind: "unit-test",
    outcome: "fail", durationMs: 31, requirementId: "avoid-blocked-cell",
    detail: "Tuyến đi qua ô (2,2) đang bị chặn: mong đợi tuyến vòng, nhận được tuyến xuyên tường.",
  }]);
  assert.equal(ev.outcome, "fail");
  assert.equal(ev.requirementId, "avoid-blocked-cell");
  assert.ok(ev.detail.includes("mong đợi"));
  assert.equal(ev.kindLabel, "Unit test");
});

test("evidence with no readable detail is surfaced as a backend contract breach", () => {
  const [ev] = normalizeEvidenceList([{ id: "e1", kind: "benchmark", outcome: "pass", durationMs: 472, detail: "" }]);
  assert.equal(ev.detail, "");
  assert.equal(ev.detailMissing, true);
});

test("checks model attaches the failing evidence to the requirement it broke", () => {
  const project = normalizeProject(F.mazeUserFail.project);
  const evidence = normalizeEvidenceList([{
    id: "evidence-maze-blocked-fail", kind: "unit-test", outcome: "fail", durationMs: 31,
    requirementId: "avoid-blocked-cell", detail: "Tuyến xuyên qua ô bị chặn.",
  }]);
  const checks = requirementsModel(project, evidence);
  assert.equal(checks.items[0].failures.length, 1);
  assert.equal(checks.items[0].failures[0].detail, "Tuyến xuyên qua ô bị chặn.");
  assert.equal(checks.met, 0);
  assert.equal(checks.total, 1);
});

// --- Editor ids ------------------------------------------------------------
// The workspace shell slugifies editor ids (normalizeEditors in
// activity-workspace.js). Jump-to-symbol looks editors up by contract
// filePath, so it MUST resolve through the same rule or it silently no-ops.

test("file paths map to the shell's slugified editor ids", () => {
  const ids = editorIdsForPaths(["SlidingWindowLimiter.cpp", "demo/main.cpp"]);
  assert.equal(ids.get("SlidingWindowLimiter.cpp"), "SlidingWindowLimiter-cpp");
  assert.equal(ids.get("demo/main.cpp"), "demo-main-cpp");
});

test("two paths that slugify the same still get distinct ids", () => {
  const ids = editorIdsForPaths(["a.cpp", "a-cpp"]);
  assert.equal(ids.get("a.cpp"), "a-cpp");
  assert.equal(ids.get("a-cpp"), "a-cpp-copy");
});

// --- Span → editor range ----------------------------------------------------

test("a span inside the document maps to exact offsets", () => {
  const source = "line1\nline2\nline3\n";
  const range = spanToRange(source, { startLine: 2, startColumn: 0, endLine: 2, endColumn: 5 });
  assert.deepEqual(range, { from: 6, to: 11 });
});

test("a span that overshoots the file is clamped instead of crashing the editor", () => {
  // Real case: backend sent endLine 45 for a 24-line file at the same revision.
  const source = "a\nb\nc\n";
  const range = spanToRange(source, { startLine: 2, startColumn: 0, endLine: 45, endColumn: 1 });
  assert.equal(range.from, 2);
  assert.equal(range.to, source.length);
  assert.ok(range.from <= range.to);
});

test("a span starting past the end still yields a valid collapsed range", () => {
  const source = "a\nb\n";
  const range = spanToRange(source, { startLine: 99, startColumn: 4, endLine: 99, endColumn: 9 });
  assert.equal(range.from, source.length);
  assert.equal(range.to, source.length);
});

test("a missing span yields no range at all", () => {
  assert.equal(spanToRange("abc", null), null);
});

// --- Replay does not shrink the trace ---------------------------------------

test("preview counts events from the run, not from the frame it is showing", () => {
  const run = normalizeRun(F.mazeUserFail.run);           // eventCount 2
  const observable = normalizeObservable(F.mazeUserFail.replay.observable); // events: []
  const recipe = normalizeRecipe(F.mazeUserFail.replay.recipe);
  const preview = previewModel({ run, observable, recipe, totalEvents: F.mazeUserFail.replay.totalEvents });
  assert.equal(preview.totalEvents, 2, "replaying must not shrink the trace length");
  assert.equal(preview.cursor, 1);
});

test("without an explicit total the run's own event count is used", () => {
  const preview = previewModel({
    run: normalizeRun(F.mazeUserFail.run),
    observable: normalizeObservable(F.mazeUserFail.observable),
    recipe: normalizeRecipe(F.mazeUserFail.recipe),
  });
  assert.equal(preview.totalEvents, 2);
});

// --- F1 · C5 stage chain: scenario picker + growth/evolve entry point --------
//
// A project on stage 2 exposes TWO scenarios. The workbench must let the
// student pick which one to run instead of pinning scenarios[0] forever, and
// it must offer exactly one way to unlock the next stage.

function stagedProject() {
  const project = structuredClone(F.mazeUserFail.project || golden.fixtures.mazeReference.project);
  project.scenarios = [
    { id: "maze-navigator-diagonal", display: { label: "Lối đi chéo mở ra" }, inputSummary: "Bản đồ 2×2 trống." },
    { id: "maze-navigator-corner-guard", display: { label: "Khe chéo giữa hai kệ" }, inputSummary: "Bản đồ 2×2 có hai kệ." },
  ];
  project.requirements = [
    { id: "trusted-change", display: { label: "Cho phép đi chéo" }, state: "met", verifierIds: ["v1"], failureEvidenceIds: [], passEvidenceIds: [] },
    { id: "trusted-change-stage-2", display: { label: "Chặn lách chéo" }, state: "candidate", verifierIds: ["v2"], failureEvidenceIds: [], passEvidenceIds: [] },
  ];
  project.growth = [
    { id: "baseline", display: { label: "Năng lực hiện có" }, state: "present" },
    { id: "stage-1", display: { label: "Cho phép đi chéo" }, state: "present" },
    { id: "stage-2", display: { label: "Chặn lách chéo" }, state: "current" },
  ];
  return normalizeProject(project);
}

test("F1 scenario picker offers every unlocked scenario and marks the active one", () => {
  const project = stagedProject();
  const picker = scenarioPickerModel(project, "maze-navigator-corner-guard");
  assert.equal(picker.multiple, true, "two unlocked scenarios must be pickable");
  assert.equal(picker.options.length, 2);
  assert.equal(picker.options[1].active, true);
  assert.equal(picker.options[0].active, false);
  assert.equal(picker.options[0].label, "Lối đi chéo mở ra");
  assert.ok(picker.options[1].inputSummary.length > 0, "each option explains its situation");
  for (const option of picker.options) {
    assert.equal(/scenario|stage|seed|trusted:/i.test(option.label), false, "no technical id may reach the label");
  }
});

test("F1 a single unlocked scenario needs no picker chrome", () => {
  const project = stagedProject();
  project.scenarios = project.scenarios.slice(0, 1);
  const picker = scenarioPickerModel(project, "maze-navigator-diagonal");
  assert.equal(picker.multiple, false);
  assert.equal(picker.options.length, 1);
});

test("F1 an unknown active scenario falls back to the first unlocked one", () => {
  const picker = scenarioPickerModel(stagedProject(), "not-a-scenario");
  assert.equal(picker.activeId, "maze-navigator-diagonal");
  assert.equal(picker.options[0].active, true);
});

test("F1 evolve is offered only when the current stage is actually met", () => {
  const project = stagedProject();
  // Stage 2 is still candidate → the growth step in flight is stage 2, not a new one.
  const pending = evolveActionModel(project);
  assert.equal(pending.available, false, "an unmet requirement must not offer a next stage");

  project.requirements[1].state = "met";
  const ready = evolveActionModel(project);
  assert.equal(ready.available, true);
  assert.ok(ready.label.length > 0);
  assert.equal(/evolve|stage|_v2|seed/i.test(ready.label), false, "the CTA speaks Vietnamese, not API");
  assert.ok(ready.reason.length > 0, "the CTA must say why it is offered");
});

test("F1 evolve is never offered while a requirement is failing", () => {
  const project = stagedProject();
  project.requirements[0].state = "failing";
  project.requirements[1].state = "failing";
  assert.equal(evolveActionModel(project).available, false);
});

test("F1 the header names the scenario that will actually run, not scenarios[0]", () => {
  const project = stagedProject();
  const active = statusStripModel(project, null, "maze-navigator-corner-guard");
  assert.equal(active.find((i) => i.label === "Tình huống").text, "Khe chéo giữa hai kệ");
  // Backwards compatible: no id given → first scenario, as before.
  assert.equal(statusStripModel(project, null).find((i) => i.label === "Tình huống").text, "Lối đi chéo mở ra");
  // An unknown id must not blank the header out.
  assert.equal(statusStripModel(project, null, "gone").find((i) => i.label === "Tình huống").text, "Lối đi chéo mở ra");
});
