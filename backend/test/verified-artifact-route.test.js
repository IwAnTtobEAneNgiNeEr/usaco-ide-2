"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { buildApp } = require("../server");
const problemStore = require("../src/problemStore");
const runCpp = require("../src/runCpp");
const settingsStore = require("../src/settingsStore");

const SUM = "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<'\\n';}\n";
const WRONG = "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a-b<<'\\n';}\n";
const CE = "int main( {\n";
const RE = "#include <iostream>\nint main(){int* p=nullptr;*p=1;}\n";
const TLE = "int main(){for(;;){}}\n";

async function compilerAvailable() {
  try { return (await runCpp.checkCompiler(await settingsStore.getSettings())).available; }
  catch { return false; }
}

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-verified-artifact", ...input });
  try { return await run(meta.id); }
  finally { await problemStore.deleteProblem(meta.id); }
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

test("Run AC returns evidence but never creates completion", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withProblem({ input: "1 2\n", expected: "3\n", code: SUM }, async (id) => {
    await withServer(async (base) => {
      const result = await postJson(base, `/api/problems/${id}/run`, { code: SUM });
      assert.equal(result.status, 200);
      assert.equal(result.json.verdict, "AC");
      assert.ok(result.json.evidence && result.json.evidence.runId);
      assert.equal(result.json.completion.created, false);
      assert.equal(result.json.completion.verified, false);
      assert.equal(result.json.completion.freshWin, false);
      assert.equal(result.json.nextAction.id, "judge-full-suite");

      const meta = await problemStore.readMeta(id);
      assert.equal(meta.history[0].type, "run");
      assert.equal(meta.history[0].id, result.json.evidence.runId);
    });
  });
});

test("WA/CE/RE/TLE Judge responses link the exact history run, code snapshot, and test", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withProblem({ code: WRONG, timeLimitMs: 2000 }, async (id) => {
    await problemStore.addTest(id, { id: "01", name: "sum", input: "1 2\n", expected: "3\n" });
    await withServer(async (base) => {
      for (const [verdict, code] of [["WA", WRONG], ["CE", CE], ["RE", RE], ["TLE", TLE]]) {
        if (verdict === "TLE") await problemStore.updateProblem(id, { timeLimitMs: 80 });
        const response = await postJson(base, `/api/problems/${id}/judge`, { code });
        assert.equal(response.status, 200, verdict);
        assert.equal(response.json.verdict, verdict, verdict);
        assert.equal(response.json.completion.created, false, verdict);
        assert.equal(response.json.completion.freshWin, false, verdict);
        assert.ok(response.json.nextAction.reason, verdict);
        assert.ok(response.json.evidence && response.json.evidence.href, verdict);

        const evidenceResponse = await fetch(`${base}${response.json.evidence.href}`);
        assert.equal(evidenceResponse.status, 200, verdict);
        const { evidence } = await evidenceResponse.json();
        assert.equal(evidence.run.id, response.json.evidence.runId, verdict);
        assert.equal(evidence.run.type, "judge", verdict);
        assert.equal(evidence.run.verdict, verdict, verdict);
        assert.equal(evidence.codeSnapshot.code, code, verdict);
        assert.equal(evidence.test.testId, "01", verdict);
        assert.equal(evidence.test.input, "1 2\n", verdict);

        const meta = await problemStore.readMeta(id);
        assert.equal(meta.history[0].id, evidence.run.id, verdict);
        assert.equal(meta.history[0].verdict, verdict, verdict);
      }

      const artifactResponse = await fetch(`${base}/api/problems/${id}/verified-artifact`);
      assert.equal(artifactResponse.status, 200);
      const { artifact } = await artifactResponse.json();
      assert.equal(artifact.derivedStatus, "needs-work");
      assert.equal(artifact.evidence.verdict, "TLE");
      assert.equal(artifact.nextAction.id, "return-to-work");
    });
  });
});

test("a new AC verifies once; re-judging an old AC is never a fresh or Rated win", async (t) => {
  if (!(await compilerAvailable())) return t.skip("g++ not installed");
  await withProblem({ code: SUM }, async (id) => {
    await problemStore.addTest(id, { name: "sum", input: "1 2\n", expected: "3\n" });
    await problemStore.recordRun(id, {
      type: "judge", verdict: "AC", passed: 1, total: 1,
      snapshot: { code: SUM, stdout: "3\n", stderr: "" },
    });

    await withServer(async (base) => {
      const response = await postJson(base, `/api/problems/${id}/judge`, { code: SUM, intent: "derive-module" });
      assert.equal(response.status, 200);
      assert.equal(response.json.verdict, "AC");
      assert.equal(response.json.completion.verified, true);
      assert.equal(response.json.completion.created, false);
      assert.equal(response.json.completion.freshWin, false);
      assert.equal(response.json.completion.ratedProgress, false);
      assert.equal(response.json.nextAction.id, "create-grid-pathfinder");
      assert.ok(!response.json.arena || !response.json.arena.rating);

      const artifactResponse = await fetch(`${base}/api/problems/${id}/verified-artifact?intent=derive-module`);
      const { artifact } = await artifactResponse.json();
      assert.equal(artifact.derivedStatus, "verified");
      assert.equal(artifact.freshness.freshWin, false);
      assert.equal(artifact.freshness.ratedProgress, false);
      assert.equal(artifact.evidence.runId, response.json.evidence.runId);
    });
  });
});
