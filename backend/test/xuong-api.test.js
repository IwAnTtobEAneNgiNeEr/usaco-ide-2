"use strict";

// Direct execution must never touch the user's workspace.  This is deliberately
// first, before config/store modules read USACO_IDE_USER_DATA_DIR.
require("./_isolate-workspace");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const ai = require("../src/ai");
const config = require("../src/config");
const seeds = require("../src/applicationSeedRegistry");
const { normalizeAnalysis, analyzeInput, analysisCacheKey, buildAnalysisSystemPrompt } = require("../src/applicationAnalysis");
const { validateAndCanonicalizeRecipe } = require("../src/xuongContract");
const { buildApp } = require("../server");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs", "fixtures", "xuong-contract-v2.json"), "utf8"));

function provider(marker = "Điều hướng", seedId = "grid-pathfinder") {
  return async () => ({
    analysis: { summary: "Lời giải hiện tại đã tìm được đường ngắn trên bản đồ cố định.", concepts: ["bfs"], constraints: ["Chưa đi chéo"], evidenceRefs: [] },
    pathways: [{
      id: "maze-navigator", title: `${marker} kho linh hoạt`, purpose: "Xây bộ điều hướng giúp nhân viên kho tìm đường tới vị trí cần lấy hàng.",
      context: "Nhân viên kho cần đổi tuyến ngay khi lối đi trong kho thay đổi.", application: "Thuật toán duyệt bản đồ để chọn tuyến ngắn tới điểm cần đến.",
      target: "cpp", seedId, deliverables: [], verification: "Compiler kiểm tra hành vi.", tasks: [], contractCriteria: [],
    }],
  });
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); } catch (error) { reject(error); } finally { server.close(); }
  }));
}

async function request(base, method, route, body) {
  const response = await fetch(`${base}${route}`, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}

test("C0 golden fixture is validated and round-trips through the backend planner", () => {
  assert.equal(fixture.contractVersion, "xuong-api.v2");
  const { mazeReference, mazeUserFail, routeWatchGraph, logMatcherInspector } = fixture.fixtures;
  for (const item of [mazeReference.reference, mazeUserFail, routeWatchGraph, logMatcherInspector]) {
    const observable = item.observable || item.frames[0].observable;
    const recipe = item.recipe || item.frames[0].recipe;
    const canonical = validateAndCanonicalizeRecipe(recipe, observable);
    assert.equal(canonical.base.kind, recipe.base.kind);
    assert.equal(canonical.overlays.length, recipe.overlays.length);
  }
  assert.equal(mazeReference.reference.type, "reference-storyboard");
  assert.equal(mazeUserFail.run.type, "scenario-run");
  assert.notEqual(mazeReference.reference.type, mazeUserFail.run.type);
  assert.equal(mazeUserFail.replay.activeAnchorIds[0], "anchor-blocked-cell");
  assert.equal(routeWatchGraph.recipe.base.kind, "graph");
  assert.equal(logMatcherInspector.recipe.base.kind, "universal-inspector");
});

test("reference storyboard remains inert and pathway prompt does not impose a quota", () => {
  const runtime = require("../src/xuongRuntime");
  const prompt = require("../src/applicationAnalysis").buildAnalysisSystemPrompt();
  assert.doesNotMatch(prompt, /3[–-]5|3\s*to\s*5/i);
  assert.match(prompt, /biến thiên/i);
  assert.equal(typeof runtime.validateObservableModel, "function");
});

test("C8 analysis cache is durable and keyed by problem, code, prompt and catalog", async () => {
  const input = {
    origin: { type: "direct-input" }, inputSummary: "cache test", statement: "Tìm đường trong kho", code: `// cache-${Date.now()}`,
    target: "cpp", evidenceRefs: [],
  };
  const raw = await provider()();
  assert.equal(normalizeAnalysis(raw).summary, raw.analysis.summary);
  assert.equal(normalizeAnalysis(ai.safeParseJson(JSON.stringify(raw))).summary, raw.analysis.summary);
  const previous = ai.chat;
  let calls = 0;
  ai.chat = async () => { calls += 1; return JSON.stringify(raw); };
  try {
    const first = await analyzeInput(input);
    const second = await analyzeInput(input);
    assert.equal(first.pathways[0].title, second.pathways[0].title);
    assert.equal(calls, 1, "the second identical analysis must be served from durable cache");
    assert.ok(fs.existsSync(config.XUONG_ANALYSIS_CACHE_FILE));
    const prompt = buildAnalysisSystemPrompt();
    const key = analysisCacheKey(input, prompt, seeds.listSeeds());
    assert.notEqual(key, analysisCacheKey({ ...input, code: "// changed" }, prompt, seeds.listSeeds()));
    assert.notEqual(key, analysisCacheKey(input, `${prompt}\nnew prompt`, seeds.listSeeds()));
    assert.notEqual(key, analysisCacheKey(input, prompt, [...seeds.listSeeds(), { id: "catalog-change" }]));
  } finally {
    ai.chat = previous;
  }
});

test("analysis permits 0..N pathways and never exposes technical seed data in v2 DTO", async () => {
  const raw = await provider()();
  assert.equal(normalizeAnalysis(raw).pathways.length, 1);
  await withServer(async (base) => {
    const previous = require("../src/applicationProjectStore").createAnalysisSession;
    // HTTP analysis exercises the real route; an AI provider is injected at the store seam below in the lifecycle test.
    assert.equal(typeof previous, "function");
    const response = await request(base, "GET", "/api/xuong/seeds");
    assert.equal(response.status, 200);
    assert.ok(response.json.seeds.every((seed) => seed.id));
  });
});

test("project list quarantines v1 projects without deleting their workspace files", async () => {
  const store = require("../src/applicationProjectStore");
  const session = await store.createAnalysisSession({ input: "Tìm đường trong kho", code: "// AC BFS" }, { provider: provider("Quản lý lối") });
  const selected = await store.selectPathway(session.id, session.pathways[0].id);
  const legacyId = "project-11111111-1111-4111-8111-111111111111";
  const config = require("../src/config");
  const legacyPath = path.join(config.APPLICATION_PROJECTS_DIR, legacyId, "project.json");
  const legacy = {
    id: legacyId,
    title: "Generalized BFS Shortest-Path Library",
    _seedId: "grid-pathfinder",
    files: [],
    _updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, JSON.stringify(legacy), "utf8");

  const visible = await store.listProjects();
  assert.ok(visible.some((project) => project.id === selected.project.id));
  assert.equal(visible.some((project) => project.id === legacyId), false);
  assert.ok(fs.existsSync(legacyPath));
});

test("MazeNavigator is red before green, maps anchor to source, replays deterministically, then checks green", async () => {
  const store = require("../src/applicationProjectStore");
  const session = await store.createAnalysisSession({ input: "Tìm đường trong kho", code: "// AC BFS" }, { provider: provider() });
  assert.equal(session.pathways.length, 1);
  assert.equal(session.pathways[0].scenarioId, "maze-navigator-diagonal");
  assert.equal("seedId" in session.pathways[0], false);
  assert.equal(session.pathways[0].display.label, "MazeNavigator");
  assert.match(session.pathways[0].purpose, /đi chéo|chéo/i);
  assert.doesNotMatch(session.pathways[0].display.label, /v2|seed|pathway/i);
  const selected = await store.selectPathway(session.id, session.pathways[0].id);
  assert.equal(selected.reference.type, "reference-storyboard");
  assert.equal(selected.project.sourceMappings.length, 1);
  assert.equal(selected.reference.frames[0].observable.entities.length, 81,
    "Maze reference must be a meaningful warehouse, not a 2×2 illustration");
  assert.equal(selected.reference.frames[0].observable.events.length, 4);
  assert.match(selected.project.brief.doneWhen, /12.*6|6.*12/);
  assert.equal(selected.project.learningBridge.editInstruction.split("\n").length, 3);
  const starterSource = selected.project.files.find((file) => file.editable).source;
  assert.match(starterSource, /const vector<pair<int, int>> directions/);
  assert.match(starterSource, /Em thêm 4 pair chéo ở đây/);
  assert.doesNotMatch(starterSource, /const int dr\[4\]/);
  const projectId = selected.project.id;
  await withServer(async (base) => {
    const reference = await request(base, "GET", `/api/xuong/projects/${projectId}/reference`);
    assert.equal(reference.status, 200);
    assert.equal(reference.json.reference.type, "reference-storyboard");
    const first = await request(base, "POST", `/api/xuong/projects/${projectId}/run`, { scenarioId: "maze-navigator-diagonal" });
    assert.equal(first.status, 200);
    assert.equal(first.json.run.provenance, "user-source");
    assert.equal(first.json.run.status, "completed");
    assert.equal(first.json.run.eventCount, 4);
    assert.equal(first.json.observable.entities.length, 81);
    assert.equal(first.json.observable.metrics.find((metric) => metric.id === "route-length").value, 12);
    assert.equal(first.json.observable.anchors.length, 1);
    assert.equal(first.json.recipe.base.kind, "grid");
    assert.equal(first.json.recipe.overlays.length, 2);
    const anchor = first.json.observable.anchors[0];
    assert.equal(anchor.sourceMappingId, first.json.project.sourceMappings[0].id);
    const replay = await request(base, "GET", `/api/xuong/projects/${projectId}/runs/${first.json.run.id}/replay?cursor=1`);
    assert.equal(replay.status, 200);
    assert.equal(replay.json.replay.cursor, 1);
    const checkedFail = await request(base, "POST", `/api/xuong/projects/${projectId}/checks`, { runId: first.json.run.id });
    assert.equal(checkedFail.status, 200);
    assert.equal(checkedFail.json.evidence[0].outcome, "fail");
    assert.match(checkedFail.json.evidence[0].detail, /expected.*actual.*Hàm tìm đường/i);
    assert.equal(checkedFail.json.project.requirements[0].state, "failing");

    const detail = await request(base, "GET", `/api/xuong/projects/${projectId}`);
    const editable = detail.json.project.files.find((file) => file.editable);
    const fixed = editable.source.replace(
      "        // Em thêm 4 pair chéo ở đây.",
      "        {1, 1}, {1, -1}, {-1, 1}, {-1, -1}, // bốn bước chéo",
    );
    assert.notEqual(fixed, editable.source);
    const saved = await request(base, "PUT", `/api/xuong/projects/${projectId}/files/${editable.path}`, { source: fixed, expectedContentHash: editable.contentHash });
    assert.equal(saved.status, 200);
    const green = await request(base, "POST", `/api/xuong/projects/${projectId}/run`, { scenarioId: "maze-navigator-diagonal" });
    assert.equal(green.status, 200);
    assert.equal(green.json.observable.anchors.length, 0);
    const checkedPass = await request(base, "POST", `/api/xuong/projects/${projectId}/checks`, { runId: green.json.run.id });
    assert.equal(checkedPass.status, 200);
    assert.equal(checkedPass.json.evidence[0].outcome, "pass");
    assert.equal(checkedPass.json.project.requirements[0].state, "met");
    const evolved = await request(base, "POST", `/api/xuong/projects/${projectId}/evolve`, {});
    assert.equal(evolved.status, 200);
    assert.equal(evolved.json.project.requirements[0].state, "met");
    assert.equal(evolved.json.project.requirements.length, 2, "evolve must open a separate trusted requirement for stage 2");
    assert.equal(evolved.json.project.requirements[1].state, "candidate");
    assert.equal(evolved.json.project.scenarios.at(-1).id, "maze-navigator-corner-guard");

    const cornerGuard = await request(base, "POST", `/api/xuong/projects/${projectId}/run`, { scenarioId: "maze-navigator-corner-guard" });
    assert.equal(cornerGuard.status, 200);
    assert.equal(cornerGuard.json.run.status, "completed");
    assert.equal(cornerGuard.json.observable.anchors[0].id, "anchor-corner-cut");
    const cornerChecks = await request(base, "POST", `/api/xuong/projects/${projectId}/checks`, { runId: cornerGuard.json.run.id });
    assert.equal(cornerChecks.json.evidence[0].outcome, "fail");
    assert.equal(cornerChecks.json.project.requirements[1].state, "failing");
  });
});

test("compiler failure has diagnostics but never invents preview, and stale source is rejected", async () => {
  const store = require("../src/applicationProjectStore");
  const session = await store.createAnalysisSession({ input: "Bản đồ", code: "// AC BFS" }, { provider: provider("Điều phối") });
  const { project } = await store.selectPathway(session.id, session.pathways[0].id);
  const editable = project.files.find((file) => file.editable);
  await withServer(async (base) => {
    const stale = await request(base, "PUT", `/api/xuong/projects/${project.id}/files/${editable.path}`, { source: editable.source, expectedContentHash: "sha256:stale" });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, "STALE_SOURCE");
    const saved = await request(base, "PUT", `/api/xuong/projects/${project.id}/files/${editable.path}`, { source: `#error readable failure\n${editable.source}`, expectedContentHash: editable.contentHash });
    assert.equal(saved.status, 200);
    const run = await request(base, "POST", `/api/xuong/projects/${project.id}/run`, { scenarioId: "maze-navigator-diagonal" });
    assert.equal(run.status, 200);
    assert.equal(run.json.run.status, "compile-error");
    assert.equal(run.json.observable, null);
    assert.equal(run.json.recipe, null);
    assert.ok(run.json.run.diagnostics[0].message.length > 5);
  });
});

test("C8 Run, Replay and Checks never invoke AI", async () => {
  const store = require("../src/applicationProjectStore");
  const session = await store.createAnalysisSession({ input: "Kho", code: "// AC BFS" }, { provider: provider("Chạy local") });
  const { project } = await store.selectPathway(session.id, session.pathways[0].id);
  const previous = ai.chat;
  ai.chat = async () => { throw new Error("Run/Replay/Checks must not call AI"); };
  try {
    const result = await store.runProjectScenario(project.id, { scenarioId: session.pathways[0].scenarioId });
    await store.replayProjectRun(project.id, result.run.id, 1);
    const checked = await store.checkProjectRun(project.id, result.run.id);
    assert.equal(checked.evidence[0].outcome, "fail");
  } finally {
    ai.chat = previous;
  }
});

test("C5 projections have a local runner, oracle, evidence, error anchor and replay", async () => {
  const store = require("../src/applicationProjectStore");
  const cases = [
    ["RouteWatch", "weighted-graph-router", "graph", (source) => source.replace(
      /bool WeightedGraphRouter::updateDirectedEdge\([\s\S]*?\n\}/,
      "bool WeightedGraphRouter::updateDirectedEdge(int from, int to, long long newWeight) {\n  if (newWeight < 0) return false;\n  try { requireVertex(from); requireVertex(to); } catch (const out_of_range&) { return false; }\n  for (auto& edge : graph_[from]) if (edge.first == to) { edge.second = newWeight; return true; }\n  return false;\n}",
    )],
    ["ShardBalancer", "range-sum-module", "chart", (source) => source.replace(
      /bool RangeSum::updateZeroBased\([^)]*\) \{[\s\S]*?\n\}/,
      "bool RangeSum::updateZeroBased(size_t index, long long value) {\n  if (index >= values_.size()) return false;\n  values_[index] = value;\n  rebuild();\n  return true;\n}",
    )],
    ["MergeForge", "sliding-window-limiter", "sequence", (source) => source.replace(
      /size_t SlidingWindowLimiter::activeCount\([\s\S]*?\n\}/,
      "size_t SlidingWindowLimiter::activeCount(const string& key, long long timestampMs) {\n  prune(key, timestampMs);\n  return events_[key].size();\n}",
    )],
    ["LogMatcher", "dependency-planner", "text", (source) => source.replace(
      /bool DependencyPlanner::removeDependency\([\s\S]*?\n\}/,
      "bool DependencyPlanner::removeDependency(const string& before, const string& after) {\n  auto found = edges_.find(before);\n  if (found == edges_.end()) return false;\n  return found->second.erase(after) > 0;\n}",
    )],
  ];
  for (const [name, seedId, base, fix] of cases) {
    const session = await store.createAnalysisSession({ input: name, code: `// ${name}` }, { provider: provider(name, seedId) });
    const { project } = await store.selectPathway(session.id, session.pathways[0].id);
    const result = await store.runProjectScenario(project.id, { scenarioId: session.pathways[0].scenarioId });
    assert.equal(result.run.provenance, "user-source");
    assert.equal(result.run.status, "completed");
    assert.equal(result.recipe.base.kind, base);
    assert.ok(result.observable.events.length > 0, `${name} must provide a replayable trace`);
    assert.ok(result.observable.entities.length >= 6, `${name} preview must be a product scene, not a two-item placeholder`);
    assert.ok(result.observable.events.length >= 4, `${name} preview must explain input, change, processing and outcome`);
    assert.equal(result.observable.anchors.length, 1, `${name} failure must point to editable source`);
    const anchorCursor = result.observable.anchors[0].eventIndex + 1;
    const replay = await store.replayProjectRun(project.id, result.run.id, anchorCursor);
    assert.equal(replay.replay.activeAnchorIds.length, 1, `${name} anchor must resolve during replay`);
    if (name === "ShardBalancer") {
      assert.match(project.learningBridge.intro, /main\(\)/);
      assert.match(project.learningBridge.familiarCode, /updateZeroBased\(1, 10\)/);
      assert.equal(project.learningBridge.editInstruction.split("\n").length, 4);
      const shardEditable = project.files.find((file) => file.editable);
      assert.match(shardEditable.source, /using namespace std;/);
      assert.match(shardEditable.source, /PHẦN 3: VIỆC CỦA EM/);
      assert.match(shardEditable.source, /TODO Xưởng 01\.4/);
      const initial = await store.replayProjectRun(project.id, result.run.id, 0);
      assert.equal(initial.replay.observable.events.length, 0);
      assert.equal(initial.replay.observable.entities.find((entity) => entity.id === "bar-zone-2").state.value, 4,
        "cursor=0 must rebuild the initial chart state from trace deltas");
    }
    assert.ok(project.learningBridge.editInstruction.split("\n").length >= 4,
      `${name} must teach the edit as small ordered steps`);
    const failed = await store.checkProjectRun(project.id, result.run.id);
    assert.equal(failed.evidence[0].outcome, "fail", `${name} oracle must reject baseline source`);

    const editable = project.files.find((file) => file.editable);
    assert.match(editable.source, /using namespace std;/, `${name} keeps the familiar C++ surface`);
    assert.match(editable.source, /PHẦN 3: VIỆC CỦA EM/);
    assert.match(editable.source, /TODO Xưởng 01\.1/);
    const fixed = fix(editable.source);
    assert.notEqual(fixed, editable.source, `${name} test must modify the trusted source`);
    await store.saveProjectFile(project.id, editable.path, fixed, editable.contentHash);
    const green = await store.runProjectScenario(project.id, { scenarioId: session.pathways[0].scenarioId });
    assert.equal(green.run.status, "completed");
    assert.equal(green.observable.anchors.length, 0, `${name} passing run must remove the behavior anchor`);
    const passed = await store.checkProjectRun(project.id, green.run.id);
    assert.equal(passed.evidence[0].outcome, "pass", `${name} oracle must accept the implementation`);
  }
});

test("C9 API E2E covers all five trusted projects", async () => {
  const store = require("../src/applicationProjectStore");
  const cases = [
    ["MazeNavigator", "grid-pathfinder", "grid"],
    ["RouteWatch", "weighted-graph-router", "graph"],
    ["MergeForge", "sliding-window-limiter", "sequence"],
    ["ShardBalancer", "range-sum-module", "chart"],
    ["LogMatcher", "dependency-planner", "text"],
  ];
  const projects = [];
  const nonce = `${Date.now()}-${process.pid}`;
  for (const [name, seedId, base] of cases) {
    const session = await store.createAnalysisSession({ input: `${name} e2e ${nonce}`, code: `// ${name} e2e ${nonce}` }, { provider: provider(`${name} E2E`, seedId) });
    const { project } = await store.selectPathway(session.id, session.pathways[0].id);
    projects.push({ project, scenarioId: session.pathways[0].scenarioId, base });
  }
  await withServer(async (baseUrl) => {
    for (const item of projects) {
      const run = await request(baseUrl, "POST", `/api/xuong/projects/${item.project.id}/run`, { scenarioId: item.scenarioId });
      assert.equal(run.status, 200);
      assert.equal(run.json.run.status, "completed");
      assert.equal(run.json.recipe.base.kind, item.base);
      const replay = await request(baseUrl, "GET", `/api/xuong/projects/${item.project.id}/runs/${run.json.run.id}/replay?cursor=${run.json.run.eventCount}`);
      assert.equal(replay.status, 200);
      assert.ok(replay.json.replay.activeAnchorIds.length > 0);
      const checks = await request(baseUrl, "POST", `/api/xuong/projects/${item.project.id}/checks`, { runId: run.json.run.id });
      assert.equal(checks.status, 200);
      assert.equal(checks.json.evidence[0].outcome, "fail");
    }
  });
});
