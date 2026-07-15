"use strict";

// Integration test for GET /api/planner/session (README-LOOPS.md D1,
// README-AUTOPILOT.md M8) — proves the route wires real problemStore/
// reviewQueue/skills/studentModel data into planner.js correctly. The
// composition logic itself (priority order, budget fill, dedup) is already
// exhaustively covered by fixture tests in planner.test.js — this file only
// checks the plumbing. Real throwaway zz-* problems, same convention as
// problem-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-planner-route-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

test.after(async () => { await fsp.rm(TEST_ROOT, { recursive: true, force: true }); });

async function withProblems(count, run) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const meta = await problemStore.createProblem({ title: `zz-planner-${i}` });
    ids.push(meta.id);
  }
  try {
    return await run(ids);
  } finally {
    await Promise.all(ids.map((id) => problemStore.deleteProblem(id)));
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

test("GET /api/planner/session offers only unsolved problems as quota, respecting the budget", async () => {
  await withServer((base) => withProblems(2, async ([solvedId, unsolvedId]) => {
    await problemStore.updateProblem(solvedId, { status: "solved", topic: "graph", difficulty: "easy" });
    await problemStore.updateProblem(unsolvedId, { topic: "graph", difficulty: "easy" });

    const res = await fetch(`${base}/api/planner/session?budgetMinutes=30`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.plan.budgetMinutes, 30);

    const ids = body.plan.items.map((i) => i.id).filter(Boolean);
    assert.ok(!ids.includes(solvedId), "a solved problem must never be offered as a quota pick");
    // unsolvedId may or may not be picked depending on what else is in this
    // workspace, but if the plan picked ANY "new" item, it must not be the solved one.
    assert.ok(body.plan.items.every((i) => i.kind !== "new" || i.id !== solvedId));
  }));
});

test("GET /api/planner/session clamps a huge budgetMinutes and defaults a missing one", async () => {
  await withServer(async (base) => {
    const huge = await fetch(`${base}/api/planner/session?budgetMinutes=99999`);
    const hugeBody = await huge.json();
    assert.equal(hugeBody.plan.budgetMinutes, 240);

    const missing = await fetch(`${base}/api/planner/session`);
    const missingBody = await missing.json();
    assert.equal(missingBody.plan.budgetMinutes, 45);
  });
});
