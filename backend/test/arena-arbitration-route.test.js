"use strict";

// Route-level tests for routes/arena-arbitration.js (S12): real g++, no AI
// dependency (arbitration only reads a vault reference that's pre-seeded
// directly, same technique as arena-reference-route.test.js's pre-populated-
// vault case) — throwaway zz-* problems.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const { statementHash } = require("../src/trustLayer");
const { buildApp } = require("../server");

const STATEMENT = ["# Sum", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "6", "```"].join("\n");
const REFERENCE_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-arbitration-route-test", statement: STATEMENT });
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
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("arbitrate: without a trusted vault reference, returns UNVERIFIABLE (never guesses)", async () => {
  await withProblem((id) => withServer(async (base) => {
    const { test: t } = await postJsonAddTest(base, id, { input: "3\n1 2 3\n", expected: "999" });
    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/arbitrate`, { code: REFERENCE_CODE });
    assert.equal(r.status, 200);
    assert.equal(r.json.verdict, "unverifiable");
  }));
});

async function postJsonAddTest(base, id, body) {
  const r = await postJson(base, `/api/problems/${id}/tests`, body);
  return r.json;
}

test("arbitrate: a test with a WRONG recorded expected is ruled bad-test and auto-corrected", async () => {
  await withProblem((id) => withServer(async (base) => {
    await referenceStore.setReference(id, REFERENCE_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
    const { test: t } = await postJsonAddTest(base, id, { input: "3\n1 2 3\n", expected: "999" }); // wrong on purpose

    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/arbitrate`, { code: REFERENCE_CODE });
    assert.equal(r.json.verdict, "bad-test");
    assert.equal(r.json.refundEligible, true);
    assert.equal(r.json.testUpdated, true);

    const tests = await problemStore.listTests(id);
    const updated = tests.find((x) => x.id === t.id);
    assert.equal(updated.expected.trim(), "6");
    assert.match(updated.reason, /Phiên Tòa Test/);
  }));
});

test("arbitrate: a correct test + genuinely buggy student code rules student-wrong, never touches the test", async () => {
  await withProblem((id) => withServer(async (base) => {
    await referenceStore.setReference(id, REFERENCE_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
    const { test: t } = await postJsonAddTest(base, id, { input: "3\n1 2 3\n", expected: "6\n" });
    const buggyCode = "#include <bits/stdc++.h>\nint main(){int n;std::cin>>n;std::cout<<0;}";

    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/arbitrate`, { code: buggyCode });
    assert.equal(r.json.verdict, "student-wrong");
    assert.equal(r.json.refundEligible, false);
    assert.equal(r.json.testUpdated, false);

    const tests = await problemStore.listTests(id);
    assert.equal(tests.find((x) => x.id === t.id).expected.trim(), "6");
  }));
});

test("arbitrate: official-sample tests are never put on trial", async () => {
  await withProblem((id) => withServer(async (base) => {
    const { test: t } = await postJsonAddTest(base, id, { input: "3\n1 2 3\n", expected: "6", provenance: "official-sample" });
    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/arbitrate`, { code: REFERENCE_CODE });
    assert.equal(r.status, 400);
  }));
});

test("validate: rejects when there is no validator saved yet", async () => {
  await withProblem((id) => withServer(async (base) => {
    const { test: t } = await postJsonAddTest(base, id, { input: "3\n1 2 3\n", expected: "6" });
    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/validate`);
    assert.equal(r.status, 400);
  }));
});

async function putJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("validate: flags (never deletes) a test whose input violates the validator", async () => {
  await withProblem((id) => withServer(async (base) => {
    const validatorCode = "#include <bits/stdc++.h>\nusing namespace std;\nint main(){int n; if(!(cin>>n)) return 1; if(n<1||n>5) return 1; return 0;}";
    const put = await putJson(base, `/api/problems/${id}/validator`, { code: validatorCode }); // arena-reference.js's PUT route (S1 vault)
    assert.equal(put.status, 200);

    const { test: t } = await postJsonAddTest(base, id, { input: "999\n", expected: "anything" }); // n=999 violates n<=5
    const r = await postJson(base, `/api/problems/${id}/tests/${t.id}/validate`);
    assert.equal(r.json.valid, false);
    assert.equal(r.json.flagged, true);

    const tests = await problemStore.listTests(id);
    assert.match(tests.find((x) => x.id === t.id).reason, /Người Gác Cổng/);
  }));
});
