"use strict";

// Route-level test for routes/arena-specimen.js — proves specimen-queue
// (merged problem-review + card-training due list) and scouting-report
// (recurring bugs cross-referenced by topic cluster) work end-to-end.
// Snapshot/restore data/arena-cards.json + data/student-model.json (real
// files by design, same technique as arena-cards-route.test.js). GUARDRAIL:
// both routes call problemStore.listProblems() with no filter — stub it to
// the throwaway ids this file creates (same reasoning as
// arena-upgrade-route.test.js's GUARDRAIL comment).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-arena-specimen-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const config = require("../src/config");
const problemStore = require("../src/problemStore");
const cardStore = require("../src/arena/cardStore");
const studentModel = require("../src/studentModel");
const { buildApp } = require("../server");

const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");
const STUDENT_MODEL_FILE = path.join(config.DATA_DIR, "student-model.json");
let cardsSnapshot;
let modelSnapshot;
test.before(async () => {
  cardsSnapshot = await fsp.readFile(CARDS_FILE, "utf8").catch(() => null);
  modelSnapshot = await fsp.readFile(STUDENT_MODEL_FILE, "utf8").catch(() => null);
});
test.after(async () => {
  if (cardsSnapshot == null) await fsp.rm(CARDS_FILE, { force: true }); else await fsp.writeFile(CARDS_FILE, cardsSnapshot, "utf8");
  if (modelSnapshot == null) await fsp.rm(STUDENT_MODEL_FILE, { force: true }); else await fsp.writeFile(STUDENT_MODEL_FILE, modelSnapshot, "utf8");
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

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
async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-specimen-route", ...input });
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
}
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }

function stubListProblems(ids) {
  const original = problemStore.listProblems;
  problemStore.listProblems = async () => ids.map((id) => ({ id, title: id, topic: "" }));
  return () => { problemStore.listProblems = original; };
}

const MS_PER_DAY = 86400000;
const daysAgoIso = (n) => new Date(Date.now() - n * MS_PER_DAY).toISOString();

test("GET specimen-queue: a due problem review and a due card both show up, most-overdue first", async () => {
  await withProblem({}, async (id) => {
    await problemStore.recordRun(id, { verdict: "AC" });
    await problemStore.updateProblem(id, { reviewCount: 0, lastReviewedAt: daysAgoIso(10) }); // 10 days overdue past interval 3

    await cardStore.mint(CARDS_FILE, "bien-tran", { evidence: "e", seenAt: daysAgoIso(4) }); // 1 day overdue past interval 3 (never trained)

    const restore = stubListProblems([id]);
    try {
      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/specimen-queue");
        assert.equal(r.status, 200);
        const types = r.json.items.map((i) => i.type);
        assert.ok(types.includes("problem"));
        assert.ok(types.includes("card"));
        // problem is 10-3=7 days overdue, card is 4-3=1 day overdue — problem must sort first.
        assert.equal(r.json.items[0].type, "problem");
      });
    } finally {
      restore();
    }
  });
});

test("GET specimen-queue: a not-yet-due card is excluded", async () => {
  await cardStore.mint(CARDS_FILE, "off-by-one", { evidence: "e", seenAt: daysAgoIso(1) }); // only 1 day old, interval is 3
  const restore = stubListProblems([]);
  try {
    await withServer(async (base) => {
      const r = await getJson(base, "/api/arena/specimen-queue");
      assert.ok(!r.json.items.some((i) => i.type === "card" && i.tag === "off-by-one"));
    });
  } finally {
    restore();
  }
});

test("GET scouting-report: only counts recurring-bug evidence from problems sharing the SAME topic cluster", async () => {
  await withProblem({ topic: "quy hoạch động" }, (dpTarget) => withProblem({ topic: "quy hoạch động" }, (dpOther) => withProblem({ topic: "đồ thị" }, async (graphOther) => {
    await studentModel.noteRecurringBug(STUDENT_MODEL_FILE, { tag: "sai-cong-thuc", seenAt: "2026-07-01", evidence: `problems/${dpOther}/moment/1.json` });
    await studentModel.noteRecurringBug(STUDENT_MODEL_FILE, { tag: "sai-cong-thuc", seenAt: "2026-07-02", evidence: `problems/${dpOther}/moment/2.json` });
    await studentModel.noteRecurringBug(STUDENT_MODEL_FILE, { tag: "off-by-one", seenAt: "2026-07-01", evidence: `problems/${graphOther}/moment/3.json` });

    // stubListProblems only fakes ids (topic:"") — this test needs real topics
    // per id for cluster matching, so stub listProblems directly instead.
    const originalListProblems = problemStore.listProblems;
    problemStore.listProblems = async () => ([
      { id: dpTarget, title: dpTarget, topic: "quy hoạch động" },
      { id: dpOther, title: dpOther, topic: "quy hoạch động" },
      { id: graphOther, title: graphOther, topic: "đồ thị" },
    ]);
    try {
      await withServer(async (base) => {
        const r = await getJson(base, `/api/problems/${dpTarget}/scouting-report`);
        assert.equal(r.status, 200);
        assert.equal(r.json.bugs.length, 1);
        assert.equal(r.json.bugs[0].tag, "sai-cong-thuc");
        assert.equal(r.json.bugs[0].count, 2);
      });
    } finally {
      problemStore.listProblems = originalListProblems;
    }
  })));
});
