"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const TEST_ROOT = path.join(os.tmpdir(), `usaco-applied-v1-${process.pid}-${Date.now()}`);
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const { buildApp } = require("../server");
const problemStore = require("../src/problemStore");
const evidenceStore = require("../src/evidenceStore");
const derivedStore = require("../src/derivedArtifactStore");
const catalogStore = require("../src/catalogStore");
const standaloneStore = require("../src/standaloneModuleStore");
const feedbackStore = require("../src/recommendationFeedbackStore");
const weightedGraphRouter = require("../src/weightedGraphRouter");
const runCpp = require("../src/runCpp");
const settingsStore = require("../src/settingsStore");

test.after(async () => fs.rm(TEST_ROOT, { recursive: true, force: true }));

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); }
    catch (error) { reject(error); }
    finally { server.close(); }
  }));
}

async function request(base, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function compilerAvailable() {
  try { return (await runCpp.checkCompiler(await settingsStore.getSettings())).available; }
  catch { return false; }
}

async function acceptedProblem() {
  const original = "// original competitive artifact\nint main(){return 0;}\n";
  const meta = await problemStore.createProblem({ title: "Catalog Competitive Route", code: original, topic: "dijkstra" });
  const runId = evidenceStore.createRunId();
  const record = await problemStore.recordRun(meta.id, { id: runId, type: "judge", verdict: "AC", passed: 1, total: 1, snapshot: { code: original } });
  const evidence = await evidenceStore.saveRunEvidence(meta.id, {
    record,
    code: original,
    result: { compileOk: true, results: [{ testId: "01", status: "AC", input: "2 1 0 1 3 0 1", expected: "3", actual: "3" }] },
  });
  return { meta, evidence, original };
}

test("catalog exposes competitive problems, standalone modules, real derived lineage, variants and one applied simulation", async () => {
  const source = await acceptedProblem();
  await derivedStore.createWeightedGraphRouter(source.meta.id, source.evidence.runId);
  const items = await catalogStore.listCatalog();
  const standalone = items.filter((item) => item.open && item.open.type === "module" && item.open.scope === "standalone" && !item.requirementId);
  assert.deepEqual(standalone.map((item) => item.artifactId).sort(), ["grid-pathfinder", "range-sum-module", "weighted-graph-router"]);
  assert.ok(standalone.every((item) => item.track === "algorithm-engineering" && item.activityKind === "algorithm-module" && item.derivedFrom === null));
  const derived = items.find((item) => item.open && item.open.scope === "derived" && item.problemId === source.meta.id);
  assert.equal(derived.derivedFrom.problemId, source.meta.id);
  assert.equal(derived.derivedFrom.runId, source.evidence.runId);
  assert.equal(items.filter((item) => item.requirementId).length, 3);
  const simulation = items.find((item) => item.id === "simulation:route-planner");
  assert.equal(simulation.activityKind, "applied-simulation");
  assert.equal(simulation.open.artifactId, "weighted-graph-router");
  assert.equal(await problemStore.getFile(source.meta.id, "code"), source.original);

  await withServer(async (base) => {
    const problemSearch = await request(base, "GET", "/api/catalog/search?track=competitive&activityKind=competitive-problem&q=Catalog", undefined);
    assert.equal(problemSearch.status, 200);
    assert.ok(problemSearch.json.results.some((item) => item.id === source.meta.id));
    const moduleSearch = await request(base, "GET", "/api/catalog/search?track=algorithm-engineering&activityKind=algorithm-module&concept=dijkstra&status=needs-work", undefined);
    assert.equal(moduleSearch.status, 200);
    assert.ok(moduleSearch.json.results.some((item) => item.artifactId === "weighted-graph-router"));
    assert.ok(moduleSearch.json.results.every((item) => item.activityKind === "algorithm-module" && item.concept === "dijkstra"));
    const competitiveList = await request(base, "GET", "/api/problems", undefined);
    assert.equal(competitiveList.status, 200);
    assert.ok((competitiveList.json.problems || competitiveList.json).some((item) => item.id === source.meta.id));
  });
});

test("direct module open supports save, hash invalidation, verify, history and reload without an OJ parent", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withServer(async (base) => {
    const before = await request(base, "GET", "/api/modules/grid-pathfinder", undefined);
    assert.equal(before.status, 200);
    assert.equal(before.json.artifact.storage, "catalog-default");
    assert.equal(before.json.artifact.derivedFrom, null);
    assert.equal(before.json.artifact.tests.public.length, 1);
    assert.equal(before.json.artifact.tests.hidden.length, 1);

    const opened = await request(base, "POST", "/api/modules/grid-pathfinder/open", {});
    assert.equal(opened.status, 200);
    assert.equal(opened.json.artifact.storage, "local");
    const verified = await request(base, "POST", "/api/modules/grid-pathfinder/verify", { suite: "baseline" });
    assert.equal(verified.json.check.verdict, "AC", verified.json.check.stderr);
    assert.deepEqual(verified.json.check.suites, { public: "AC", hidden: "AC" });

    const source = await request(base, "GET", "/api/modules/grid-pathfinder/source", undefined);
    const edited = `${source.json.source}\n// local module edit\n`;
    const saved = await request(base, "PUT", "/api/modules/grid-pathfinder/source", { source: edited });
    assert.equal(saved.json.artifact.derivedStatus, "needs-work");
    const reloaded = await request(base, "GET", "/api/modules/grid-pathfinder", undefined);
    assert.equal(reloaded.json.artifact.files["GridPathfinder.cpp"], edited);
    const reverified = await request(base, "POST", "/api/modules/grid-pathfinder/verify", { suite: "baseline" });
    assert.equal(reverified.json.artifact.derivedStatus, "verified");
    const history = await request(base, "GET", "/api/modules/grid-pathfinder/history", undefined);
    assert.equal(history.json.runs.length, 2);
    assert.ok(Date.parse(history.json.runs[0].at) >= Date.parse(history.json.runs[1].at));
  });
});

test("WeightedGraphRouter requirement loop reaches AC and Route Planner executes current module for every input", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await standaloneStore.materialize("weighted-graph-router");
  const baseline = await standaloneStore.verifyModule("weighted-graph-router", "baseline");
  assert.equal(baseline.check.verdict, "AC", baseline.check.stderr);
  const activated = await standaloneStore.activateRequirementChange("weighted-graph-router", weightedGraphRouter.CHANGE_REQUIREMENT);
  assert.equal(activated.derivedStatus, "needs-work");
  const wrong = await standaloneStore.verifyModule("weighted-graph-router", "requirement-change");
  assert.equal(wrong.check.verdict, "WA");
  const source = await standaloneStore.readSource("weighted-graph-router");
  const fixed = source.source.replace(
    "bool WeightedGraphRouter::updateDirectedEdge(int, int, long long) { return false; /* TODO v2 */ }",
    "bool WeightedGraphRouter::updateDirectedEdge(int u, int v, long long w) { requireVertex(u); requireVertex(v); if (w < 0) throw std::invalid_argument(\"negative weight\"); for (auto &edge : graph_[u]) if (edge.first == v) { edge.second = w; return true; } return false; }"
  );
  assert.notEqual(fixed, source.source);
  await standaloneStore.saveSource("weighted-graph-router", fixed);
  const repaired = await standaloneStore.verifyModule("weighted-graph-router", "requirement-change");
  assert.equal(repaired.check.verdict, "AC", repaired.check.stderr);
  assert.deepEqual(repaired.check.suites, { public: "AC", hidden: "AC" });

  await withServer(async (base) => {
    const firstInput = { nodeCount: 4, edges: [{ from: 0, to: 1, weight: 5 }, { from: 1, to: 3, weight: 2 }, { from: 0, to: 3, weight: 20 }], start: 0, target: 3 };
    const first = await request(base, "POST", "/api/modules/weighted-graph-router/simulate", { input: firstInput });
    assert.equal(first.status, 200);
    assert.deepEqual(first.json.output, { reachable: true, distance: 7, path: [0, 1, 3] });
    assert.equal(first.json.module.derivedStatus, "verified");
    const repeated = await request(base, "POST", "/api/modules/weighted-graph-router/simulate", { input: firstInput });
    assert.deepEqual(repeated.json.output, first.json.output);

    const changed = await request(base, "POST", "/api/modules/weighted-graph-router/simulate", { input: { ...firstInput, edges: [{ from: 0, to: 1, weight: 9 }, { from: 1, to: 3, weight: 2 }, { from: 0, to: 3, weight: 4 }] } });
    assert.deepEqual(changed.json.output, { reachable: true, distance: 4, path: [0, 3] });
    const unreachable = await request(base, "POST", "/api/modules/weighted-graph-router/simulate", { input: { nodeCount: 3, edges: [{ from: 0, to: 1, weight: 1 }], start: 0, target: 2 } });
    assert.deepEqual(unreachable.json.output, { reachable: false, distance: null, path: [] });
    const invalid = await request(base, "POST", "/api/modules/weighted-graph-router/simulate", { input: { nodeCount: 2, edges: [], start: 0, target: 2 } });
    assert.equal(invalid.status, 400);
  });
});

test("local feedback deterministically reranks an item and reset restores ranking", async () => {
  await withServer(async (base) => {
    const initial = await request(base, "GET", "/api/recommendations/entry?track=algorithm-engineering", undefined);
    assert.equal(initial.status, 200);
    assert.equal(initial.json.autoOpen, false);
    const firstId = initial.json.items[0].id;
    const encoded = encodeURIComponent(firstId);
    const signaled = await request(base, "PUT", `/api/recommendations/feedback/${encoded}`, { track: "algorithm-engineering", signal: "already_know" });
    assert.equal(signaled.status, 200);
    assert.equal(signaled.json.feedback.itemId, firstId);
    const reranked = await request(base, "GET", "/api/recommendations/entry?track=algorithm-engineering", undefined);
    assert.notEqual(reranked.json.items[0].id, firstId);
    assert.ok((await feedbackStore.listFeedback("algorithm-engineering")).some((entry) => entry.itemId === firstId));
    const reset = await request(base, "PUT", `/api/recommendations/feedback/${encoded}`, { track: "algorithm-engineering", signal: "reset" });
    assert.equal(reset.json.feedback, null);
    const restored = await request(base, "GET", "/api/recommendations/entry?track=algorithm-engineering", undefined);
    assert.deepEqual(restored.json.items.map((item) => item.id), initial.json.items.map((item) => item.id));
  });
});
