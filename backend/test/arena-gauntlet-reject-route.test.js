"use strict";

// Route-level test for the Gauntlet reject escape hatch
// (routes/arena-reference.js: POST /api/problems/:id/gauntlet/reject).
//
// The Gauntlet judges a student with an AI-written generator + reference. When
// that verdict is bogus (illegal generated input, or a wrong reference answer),
// the student must be able to undo it — otherwise a phantom failing test and a
// "broken" seal verdict trap them forever. These tests prove the undo:
//   - a rejected counterexample test is deleted from the suite,
//   - the Gauntlet verdict returns to neutral (null) so the seal isn't held back,
//   - fault "input" drops the generator; fault "reference" drops the reference,
//     forcing the next Gauntlet to regenerate the offending oracle.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const { buildApp } = require("../server");

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-gauntlet-reject-test" });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
}
function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try { resolve(await run(`http://127.0.0.1:${port}`)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, json: await r.json() };
}

test("reject with fault=input deletes the phantom test, neutralizes the verdict, drops the generator", async () => {
  await withProblem(async (id) => {
    // Simulate a Gauntlet that broke the student: a persisted generator, a
    // "broken" verdict, and the auto-added counterexample test.
    await referenceStore.setGenerator(id, "int main(){}", { source: "ai" });
    await referenceStore.recordGauntletRun(id, { result: "broken", survivedRuns: 12 });
    const added = await problemStore.addTest(id, { name: "gauntlet-13", input: "1\n", expected: "42\n", generatedBy: "ai" });

    await withServer(async (base) => {
      const r = await postJson(base, `/api/problems/${id}/gauntlet/reject`, { testId: added.id, fault: "input" });
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, true);
      assert.equal(r.json.fault, "input");
      assert.ok(r.json.cleared.includes("test"));
      assert.ok(r.json.cleared.includes("verdict"));
      assert.ok(r.json.cleared.includes("generator"));
    });

    const tests = await problemStore.listTests(id);
    assert.ok(!tests.some((t) => t.id === added.id), "phantom test must be gone");
    const vault = await referenceStore.readMeta(id);
    assert.equal(vault.gauntlet.lastResult, null, "verdict must be neutral, not broken");
    assert.equal(vault.generator.present, false, "generator must be dropped so it regenerates");
  });
});

test("reject with fault=reference drops the reference instead of the generator", async () => {
  await withProblem(async (id) => {
    await referenceStore.setReference(id, "int main(){}", { source: "ai-brute", trusted: true, samplesChecked: 2 });
    await referenceStore.setGenerator(id, "int main(){}", { source: "ai" });
    await referenceStore.recordGauntletRun(id, { result: "broken", survivedRuns: 5 });

    await withServer(async (base) => {
      const r = await postJson(base, `/api/problems/${id}/gauntlet/reject`, { fault: "reference" });
      assert.equal(r.json.ok, true);
      assert.ok(r.json.cleared.includes("reference"));
      assert.ok(!r.json.cleared.includes("generator"));
    });

    const vault = await referenceStore.readMeta(id);
    assert.equal(vault.reference.present, false, "reference must be dropped");
    assert.equal(vault.generator.present, true, "generator must be untouched");
    assert.equal(vault.gauntlet.lastResult, null);
  });
});

test("reject without a testId still neutralizes the verdict (no crash)", async () => {
  await withProblem(async (id) => {
    await referenceStore.recordGauntletRun(id, { result: "broken", survivedRuns: 3 });
    await withServer(async (base) => {
      const r = await postJson(base, `/api/problems/${id}/gauntlet/reject`, {});
      assert.equal(r.json.ok, true);
      assert.equal(r.json.fault, "input"); // defaults to input
    });
    const vault = await referenceStore.readMeta(id);
    assert.equal(vault.gauntlet.lastResult, null);
  });
});
