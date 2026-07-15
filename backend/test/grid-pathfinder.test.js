"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { buildApp } = require("../server");
const problemStore = require("../src/problemStore");
const evidenceStore = require("../src/evidenceStore");
const derivedStore = require("../src/derivedArtifactStore");
const gridPathfinder = require("../src/gridPathfinder");
const runCpp = require("../src/runCpp");
const settingsStore = require("../src/settingsStore");

const SOURCE_SOLUTION = "// original OJ solution must stay byte-identical\nint main(){return 0;}\n";

async function compilerAvailable() {
  try { return (await runCpp.checkCompiler(await settingsStore.getSettings())).available; }
  catch { return false; }
}

async function withAcceptedEvidence(run) {
  const meta = await problemStore.createProblem({ title: "zz-grid-pathfinder", code: SOURCE_SOLUTION, topic: "bfs" });
  try {
    const runId = evidenceStore.createRunId();
    const record = await problemStore.recordRun(meta.id, {
      id: runId, type: "judge", verdict: "AC", passed: 1, total: 1,
      snapshot: { code: SOURCE_SOLUTION, stdout: "5\n", stderr: "" },
    });
    const evidence = await evidenceStore.saveRunEvidence(meta.id, {
      record,
      code: SOURCE_SOLUTION,
      result: { compileOk: true, results: [{ testId: "01", status: "AC", input: "3 4\nS...\n##.#\n...T\n", expected: "5\n", actual: "5\n" }] },
    });
    return await run(meta.id, evidence);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); }
      catch (error) { reject(error); }
      finally { server.close(); }
    });
  });
}

async function postJson(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: response.status, json: await response.json() };
}

test("pure GridPathfinder scaffold has provenance, interface, edge cases, and one proposed requirement change", () => {
  const scaffold = gridPathfinder.buildScaffold({
    problemId: "maze",
    sourceTitle: "Mê cung",
    evidence: { id: "run-1", runId: "run-1", href: "/e/run-1", codeHash: "abc", verdict: "AC" },
    createdAt: "2026-07-15T00:00:00.000Z",
  });
  assert.equal(scaffold.manifest.activityKind, "algorithm-module");
  assert.equal(scaffold.manifest.origin, "derived");
  assert.equal(scaffold.manifest.derivedFrom.problemId, "maze");
  assert.equal(scaffold.manifest.derivedFrom.runId, "run-1");
  assert.equal(scaffold.manifest.requirements.filter((item) => item.status === "proposed").length, 1);
  assert.match(scaffold.files["GridPathfinder.hpp"], /class GridPathfinder/);
  assert.match(scaffold.files["GridPathfinder.test.cpp"], /unreachable/);
  assert.match(scaffold.files["GridPathfinder.test.cpp"], /ragged-grid/);
  assert.match(scaffold.files["GridPathfinder.requirement-change.test.cpp"], /allow-diagonal/);
  assert.ok(!Object.values(scaffold.files).some((content) => content.includes("original OJ solution")));
});

test("derived artifact rejects non-AC evidence", async () => {
  const meta = await problemStore.createProblem({ title: "zz-grid-reject", code: SOURCE_SOLUTION });
  try {
    const runId = evidenceStore.createRunId();
    const record = await problemStore.recordRun(meta.id, { id: runId, type: "judge", verdict: "WA", passed: 0, total: 1 });
    await evidenceStore.saveRunEvidence(meta.id, {
      record, code: SOURCE_SOLUTION,
      result: { compileOk: true, results: [{ testId: "01", status: "WA", input: "x", expected: "1", actual: "0" }] },
    });
    await assert.rejects(() => derivedStore.createGridPathfinder(meta.id, runId), (error) => error.status === 409);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
});

test("derived module baseline passes, change check fails, activation opens a new Work loop, and original survives", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withAcceptedEvidence(async (id, evidence) => {
    const created = await derivedStore.createGridPathfinder(id, evidence.runId);
    assert.equal(created.derivedFrom.runId, evidence.runId);
    assert.equal(created.derivedStatus, "unverified");
    assert.equal(await problemStore.getFile(id, "code"), SOURCE_SOLUTION);

    const baseline = await derivedStore.verifyArtifact(id, gridPathfinder.ARTIFACT_ID, "baseline");
    assert.equal(baseline.check.verdict, "AC");
    assert.equal(baseline.artifact.derivedStatus, "verified");
    assert.equal(baseline.artifact.nextAction.id, "activate-requirement-change");

    const changed = await derivedStore.verifyArtifact(id, gridPathfinder.ARTIFACT_ID, "requirement-change");
    assert.equal(changed.check.verdict, "WA");
    assert.match(changed.check.stdout, /allow-diagonal/);
    assert.equal(changed.artifact.derivedStatus, "verified", "proposed change must not invalidate active v1");

    const activated = await derivedStore.activateRequirementChange(id, gridPathfinder.ARTIFACT_ID, gridPathfinder.CHANGE_REQUIREMENT);
    assert.equal(activated.currentRequirementId, gridPathfinder.CHANGE_REQUIREMENT);
    assert.equal(activated.derivedStatus, "needs-work");
    assert.equal(activated.nextAction.id, "open-derived-work");
    assert.equal(await problemStore.getFile(id, "code"), SOURCE_SOLUTION);
  });
});

test("derived HTTP contract creates, verifies, lists, and explicitly activates the change", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withAcceptedEvidence(async (id, evidence) => {
    await withServer(async (base) => {
      const created = await postJson(base, `/api/problems/${id}/derived/grid-pathfinder`, { evidenceId: evidence.runId });
      assert.equal(created.status, 201);
      assert.equal(created.json.artifact.derivedFrom.evidenceId, evidence.runId);
      assert.equal(created.json.artifact.files["GridPathfinder.cpp"].includes("queue"), true);

      const sourceResponse = await fetch(`${base}/api/problems/${id}/derived/grid-pathfinder/source`);
      const sourceJson = await sourceResponse.json();
      assert.equal(sourceResponse.status, 200);
      assert.equal(sourceJson.file, "GridPathfinder.cpp");
      const editedSource = `${sourceJson.source}\n// verified edit\n`;
      const saved = await fetch(`${base}/api/problems/${id}/derived/grid-pathfinder/source`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: editedSource }),
      });
      assert.equal(saved.status, 200);
      assert.match((await saved.json()).artifact.files["GridPathfinder.cpp"], /verified edit/);
      assert.equal(await problemStore.getFile(id, "code"), SOURCE_SOLUTION);

      const duplicate = await postJson(base, `/api/problems/${id}/derived/grid-pathfinder`, { evidenceId: evidence.runId });
      assert.equal(duplicate.status, 409);

      const baseline = await postJson(base, `/api/problems/${id}/derived/grid-pathfinder/verify`, { suite: "baseline" });
      assert.equal(baseline.status, 200);
      assert.equal(baseline.json.check.verdict, "AC");

      const listResponse = await fetch(`${base}/api/problems/${id}/derived`);
      const listed = await listResponse.json();
      assert.equal(listed.artifacts.length, 1);
      assert.equal(listed.artifacts[0].derivedStatus, "verified");

      const activated = await postJson(
        base,
        `/api/problems/${id}/derived/grid-pathfinder/requirement-changes/${gridPathfinder.CHANGE_REQUIREMENT}/activate`,
        {}
      );
      assert.equal(activated.status, 200);
      assert.equal(activated.json.artifact.derivedStatus, "needs-work");
    });
  });
});
