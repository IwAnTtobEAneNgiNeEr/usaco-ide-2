"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { buildApp } = require("../server");
const problemStore = require("../src/problemStore");
const evidenceStore = require("../src/evidenceStore");
const derivedStore = require("../src/derivedArtifactStore");
const weightedGraphRouter = require("../src/weightedGraphRouter");
const rangeSum = require("../src/rangeSum");
const runCpp = require("../src/runCpp");
const settingsStore = require("../src/settingsStore");

const ORIGINAL = "// original verified solution\nint main(){return 0;}\n";

async function compilerAvailable() {
  try { return (await runCpp.checkCompiler(await settingsStore.getSettings())).available; } catch { return false; }
}

async function withAcceptedEvidence(title, input, run) {
  const meta = await problemStore.createProblem({ title, code: ORIGINAL });
  try {
    const runId = evidenceStore.createRunId();
    const record = await problemStore.recordRun(meta.id, { id: runId, type: "judge", verdict: "AC", passed: 1, total: 1, snapshot: { code: ORIGINAL } });
    const evidence = await evidenceStore.saveRunEvidence(meta.id, { record, code: ORIGINAL, result: { compileOk: true, results: [{ testId: "01", status: "AC", input, expected: "ok", actual: "ok" }] } });
    return await run(meta.id, evidence);
  } finally { await problemStore.deleteProblem(meta.id); }
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); } catch (error) { reject(error); } finally { server.close(); }
  }));
}

async function post(base, route, body = {}) {
  const response = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}

test("WeightedGraphRouter and RangeSum scaffolds have concrete provenance and one small proposed change", () => {
  for (const [definition, expected] of [[weightedGraphRouter, "WeightedGraphRouter"], [rangeSum, "RangeSum"]]) {
    const scaffold = definition.buildScaffold({ problemId: "p", sourceTitle: "source", evidence: { runId: "run-1", codeHash: "c", inputHash: "i" }, createdAt: "2026-07-16T00:00:00.000Z" });
    assert.equal(scaffold.manifest.origin, "derived");
    assert.equal(scaffold.manifest.activityKind, "algorithm-module");
    assert.equal(scaffold.manifest.derivedFrom.runId, "run-1");
    assert.equal(scaffold.manifest.requirements.filter((item) => item.status === "proposed").length, 1);
    assert.match(Object.values(scaffold.files).join("\n"), new RegExp(expected));
    assert.ok(!Object.values(scaffold.files).some((content) => content.includes("original verified solution")));
  }
});

for (const spec of [
  {
    name: "WeightedGraphRouter", definition: weightedGraphRouter, create: "createWeightedGraphRouter",
    route: "weighted-graph-router", input: "2 1 1 2 3 1 2",
    fix(source) {
      return source.replace(
        "bool WeightedGraphRouter::updateDirectedEdge(int, int, long long) { return false; /* TODO v2 */ }",
        "bool WeightedGraphRouter::updateDirectedEdge(int u, int v, long long w) { requireVertex(u); requireVertex(v); if (w < 0) throw std::invalid_argument(\"negative weight\"); for (auto &edge : graph_[u]) if (edge.first == v) { edge.second = w; return true; } return false; }"
      );
    },
  },
  {
    name: "RangeSum", definition: rangeSum, create: "createRangeSumModule",
    route: "range-sum-module", input: "2 3 4 1 0 1",
    fix(source) {
      return source.replace(
        "bool RangeSum::updateZeroBased(std::size_t,long long) { return false; /* TODO v2 */ }",
        "bool RangeSum::updateZeroBased(std::size_t i,long long value) { if(i>=values_.size()) return false; values_[i]=value; rebuild(); return true; }"
      );
    },
  },
]) {
  test(`${spec.name} baseline AC -> requirement WA -> source fix persists -> AC, and original survives`, async (t) => {
    if (!(await compilerAvailable())) return t.skip("g++ not installed");
    await withAcceptedEvidence(`zz-${spec.route}`, spec.input, async (id, evidence) => {
      const created = await derivedStore[spec.create](id, evidence.runId);
      assert.equal(created.derivedStatus, "unverified");
      assert.equal(created.derivedFrom.runId, evidence.runId);
      const baseline = await derivedStore.verifyArtifact(id, spec.definition.ARTIFACT_ID, "baseline");
      assert.equal(baseline.check.verdict, "AC", baseline.check.stderr);
      assert.equal(baseline.artifact.derivedStatus, "verified");
      const changed = await derivedStore.verifyArtifact(id, spec.definition.ARTIFACT_ID, "requirement-change");
      assert.equal(changed.check.verdict, "WA", changed.check.stderr || changed.check.stdout);
      assert.equal(changed.artifact.derivedStatus, "verified", "a proposed change does not invalidate active v1");
      const activated = await derivedStore.activateRequirementChange(id, spec.definition.ARTIFACT_ID, spec.definition.CHANGE_REQUIREMENT);
      assert.equal(activated.derivedStatus, "needs-work");
      assert.equal(activated.nextAction.id, "open-derived-work");

      const beforeFix = await derivedStore.readSource(id, spec.definition.ARTIFACT_ID);
      const fixedSource = spec.fix(beforeFix.source);
      assert.notEqual(fixedSource, beforeFix.source, "test must apply a real implementation change");
      await derivedStore.saveSource(id, spec.definition.ARTIFACT_ID, fixedSource);
      const afterReload = await derivedStore.readSource(id, spec.definition.ARTIFACT_ID);
      assert.equal(afterReload.source, fixedSource, "edited module source must persist after reload");
      const repaired = await derivedStore.verifyArtifact(id, spec.definition.ARTIFACT_ID, "requirement-change");
      assert.equal(repaired.check.verdict, "AC", repaired.check.stderr || repaired.check.stdout);
      assert.equal(repaired.artifact.derivedStatus, "verified");
      assert.equal(repaired.artifact.derivedFrom.problemId, id);
      assert.equal(await problemStore.getFile(id, "code"), ORIGINAL);
      const originalMeta = await problemStore.readMeta(id);
      assert.equal(originalMeta.history.length, 1, "derived checks must not create competitive attempts");
      assert.equal(originalMeta.history[0].verdict, "AC");
    });
  });

  test(`${spec.name} concrete POST plus reusable source/read/write/verify routes`, async (t) => {
    if (!(await compilerAvailable())) return t.skip("g++ not installed");
    await withAcceptedEvidence(`zz-http-${spec.route}`, spec.input, async (id, evidence) => withServer(async (base) => {
      const created = await post(base, `/api/problems/${id}/derived/${spec.route}`, { evidenceId: evidence.runId });
      assert.equal(created.status, 201);
      const sourceResponse = await fetch(`${base}/api/problems/${id}/derived/${spec.route}/source`);
      const source = await sourceResponse.json();
      assert.equal(sourceResponse.status, 200);
      assert.equal(source.file, spec.definition.SOURCE_FILE);
      const savedResponse = await fetch(`${base}/api/problems/${id}/derived/${spec.route}/source`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: `${source.source}\n// editable\n` }) });
      assert.equal(savedResponse.status, 200);
      assert.match((await savedResponse.json()).artifact.files[spec.definition.SOURCE_FILE], /editable/);
      const verified = await post(base, `/api/problems/${id}/derived/${spec.route}/verify`, { suite: "baseline" });
      assert.equal(verified.json.check.verdict, "AC", verified.json.check.stderr);
      const listed = await (await fetch(`${base}/api/problems/${id}/derived`)).json();
      assert.equal(listed.artifacts.length, 1);
      assert.equal(listed.artifacts[0].id, spec.definition.ARTIFACT_ID);
      assert.equal(await problemStore.getFile(id, "code"), ORIGINAL);
    }));
  });
}
