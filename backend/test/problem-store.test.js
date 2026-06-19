"use strict";

// Tests for problemStore's write serialization (the per-problem lock), bulk
// test import (addTests + POST /tests/bulk), history-snapshot caps, the
// /workspace bundle endpoint, and the personal code template.
//
// These run against the real workspace/ using throwaway zz-* problems that are
// always deleted afterwards (the house rule: never touch user problems).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fsp = require("node:fs/promises");

const problemStore = require("../src/problemStore");
const settingsStore = require("../src/settingsStore");
const { DEFAULT_TEMPLATE, TEMPLATE_FILE, LIMITS } = require("../src/config");
const { buildApp } = require("../server");

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-store-test", ...input });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
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

// ---------------------------------------------------------------------------
// Per-problem write lock — concurrent mutations must not lose updates
// ---------------------------------------------------------------------------

test("concurrent addTest calls produce unique sequential ids", async () => {
  await withProblem({}, async (id) => {
    const added = await Promise.all(
      Array.from({ length: 8 }, (_, i) => problemStore.addTest(id, { input: `${i}\n`, expected: `${i}\n` }))
    );
    const ids = added.map((t) => t.id);
    assert.equal(new Set(ids).size, 8, `duplicate test ids assigned: ${ids.join(",")}`);
    const tests = await problemStore.listTests(id);
    assert.equal(tests.length, 8);
  });
});

test("concurrent recordRun calls keep every history entry", async () => {
  await withProblem({}, async (id) => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        problemStore.recordRun(id, { type: "run", verdict: i % 2 ? "AC" : "WA", timeMs: i })
      )
    );
    const meta = await problemStore.readMeta(id);
    assert.equal(meta.history.length, 10, "a concurrent write dropped history entries");
  });
});

test("recordRun racing updateProblem loses neither change", async () => {
  await withProblem({}, async (id) => {
    await Promise.all([
      problemStore.recordRun(id, { type: "judge", verdict: "AC", passed: 3, total: 3 }),
      problemStore.updateProblem(id, { status: "solved" })
    ]);
    const meta = await problemStore.readMeta(id);
    assert.equal(meta.lastVerdict, "AC");
    assert.equal(meta.status, "solved");
    assert.equal(meta.history.length, 1);
  });
});

// ---------------------------------------------------------------------------
// addTests — bulk import semantics
// ---------------------------------------------------------------------------

test("addTests appends after existing ids and writes names/reasons", async () => {
  await withProblem({}, async (id) => {
    await problemStore.addTest(id, { input: "a\n", expected: "b\n" }); // -> 01
    const { added, skipped } = await problemStore.addTests(id, [
      { name: "3", input: "1\n", expected: "2\n" },
      { name: "7", input: "x\n", expected: "y\n", generatedBy: "ai", reason: "edge" }
    ]);
    assert.equal(skipped.length, 0);
    assert.deepEqual(added.map((t) => t.id), ["02", "03"]);
    assert.deepEqual(added.map((t) => t.name), ["3", "7"]);
    assert.equal(added[1].generatedBy, "ai");
    const tests = await problemStore.listTests(id);
    assert.deepEqual(tests.map((t) => t.id), ["01", "02", "03"]);
    assert.equal(tests[2].reason, "edge");
  });
});

test("addTests skips oversized items and everything past the test limit", async () => {
  await withProblem({}, async (id) => {
    const big = "x".repeat(LIMITS.maxInputBytes + 1);
    const { added, skipped } = await problemStore.addTests(id, [
      { name: "ok", input: "1\n", expected: "1\n" },
      { name: "huge", input: big, expected: "1\n" }
    ]);
    assert.equal(added.length, 1);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /MB/);
    assert.equal(skipped[0].name, "huge");
  });
});

// ---------------------------------------------------------------------------
// recordRun — snapshot caps (history.json must stay bounded)
// ---------------------------------------------------------------------------

test("history snapshots cap stdout/stderr but never the code", async () => {
  await withProblem({}, async (id) => {
    const bigOut = "o".repeat(200 * 1024);
    const code = "int main(){}\n" + "// pad\n".repeat(100);
    await problemStore.recordRun(id, {
      type: "run", verdict: "OK", snapshot: { code, stdout: bigOut, stderr: "fine" }
    });
    const [snap] = await problemStore.listHistory(id);
    assert.ok(snap.stdout.length < 70 * 1024, `stdout not capped (${snap.stdout.length})`);
    assert.match(snap.stdout, /cắt bớt/);
    assert.equal(snap.stderr, "fine");
    assert.equal(snap.code, code);
  });
});

// ---------------------------------------------------------------------------
// Personal code template (data/template.cpp)
// ---------------------------------------------------------------------------

test("code template: built-in by default, custom round-trip, blank resets", async (t) => {
  const before = await fsp.readFile(TEMPLATE_FILE, "utf8").catch(() => null);
  t.after(async () => {
    if (before == null) await fsp.rm(TEMPLATE_FILE, { force: true });
    else await fsp.writeFile(TEMPLATE_FILE, before, "utf8");
  });

  await fsp.rm(TEMPLATE_FILE, { force: true });
  assert.equal(await settingsStore.getCodeTemplate(), DEFAULT_TEMPLATE);
  assert.deepEqual(await settingsStore.readTemplateState(), { template: DEFAULT_TEMPLATE, custom: false });

  const mine = "#include <iostream>\nint main(){ /* my starter */ }\n";
  assert.deepEqual(await settingsStore.saveCodeTemplate(mine), { template: mine, custom: true });
  assert.equal(await settingsStore.getCodeTemplate(), mine);

  // New problems scaffold from the custom template.
  await withProblem({}, async (id) => {
    assert.equal(await problemStore.getFile(id, "code"), mine);
  });

  // Whitespace-only template = reset to built-in.
  assert.deepEqual(await settingsStore.saveCodeTemplate("  \n"), { template: DEFAULT_TEMPLATE, custom: false });
  assert.equal(await settingsStore.getCodeTemplate(), DEFAULT_TEMPLATE);
});

test("code template: oversized template is rejected with a 400-shaped error", async () => {
  await assert.rejects(
    () => settingsStore.saveCodeTemplate("x".repeat(LIMITS.maxCodeBytes + 1)),
    (err) => err.status === 400
  );
});

// ---------------------------------------------------------------------------
// Routes — /workspace bundle + /tests/bulk
// ---------------------------------------------------------------------------

test("GET /api/problems/:id/workspace bundles meta, files and tests", async () => {
  await withProblem({ statement: "đề bài", input: "5\n", expected: "25\n" }, async (id) => {
    await problemStore.addTest(id, { input: "2\n", expected: "4\n", name: "sample" });
    const body = await withServer(async (base) => {
      const res = await fetch(`${base}/api/problems/${id}/workspace`);
      assert.equal(res.status, 200);
      return res.json();
    });
    assert.equal(body.problem.id, id);
    assert.equal(body.statement, "đề bài");
    assert.equal(body.input, "5\n");
    assert.equal(body.expected, "25\n");
    assert.ok(typeof body.code === "string" && body.code.length > 0);
    assert.equal(body.tests.length, 1);
    assert.equal(body.tests[0].name, "sample");
  });
});

test("POST /api/problems/:id/tests/bulk adds pairs and reports skips", async () => {
  await withProblem({}, async (id) => {
    const body = await withServer(async (base) => {
      const res = await fetch(`${base}/api/problems/${id}/tests/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tests: [
            { name: "1", input: "1\n", expected: "1\n" },
            { name: "2", input: "2\n", expected: "4\n" }
          ]
        })
      });
      assert.equal(res.status, 201);
      return res.json();
    });
    assert.equal(body.added.length, 2);
    assert.equal(body.skipped.length, 0);
    assert.deepEqual((await problemStore.listTests(id)).map((t) => t.name), ["1", "2"]);
  });
});

test("POST /tests/bulk with an empty payload is a 400", async () => {
  await withProblem({}, async (id) => {
    const status = await withServer(async (base) => {
      const res = await fetch(`${base}/api/problems/${id}/tests/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tests: [] })
      });
      return res.status;
    });
    assert.equal(status, 400);
  });
});
