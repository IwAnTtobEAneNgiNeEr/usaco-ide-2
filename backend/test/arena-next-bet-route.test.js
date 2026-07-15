"use strict";

// Route-level test for routes/arena-next-bet.js — proves the HTTP wiring
// (candidate assembly, Mystery Bet commit/open/reroll) works end-to-end.
// Snapshot/restore arena-rating.json + arena-next-bet.json (real data/ files
// by design — same technique as arena-cards-route.test.js). GUARDRAIL: this
// route calls problemStore.listProblems() with no filter — every test stubs
// it to ONLY the throwaway ids it created, same reasoning as
// arena-upgrade-route.test.js's GUARDRAIL comment (a bulk-listing route test
// that forgets this WILL walk the real live workspace).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const problemStore = require("../src/problemStore");
const { buildApp } = require("../server");

const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");
const NEXT_BET_FILE = path.join(config.DATA_DIR, "arena-next-bet.json");
let ratingSnapshot;
let nextBetSnapshot;
test.before(async () => {
  ratingSnapshot = await fsp.readFile(RATING_FILE, "utf8").catch(() => null);
  nextBetSnapshot = await fsp.readFile(NEXT_BET_FILE, "utf8").catch(() => null);
});
test.after(async () => {
  if (ratingSnapshot == null) await fsp.rm(RATING_FILE, { force: true }); else await fsp.writeFile(RATING_FILE, ratingSnapshot, "utf8");
  if (nextBetSnapshot == null) await fsp.rm(NEXT_BET_FILE, { force: true }); else await fsp.writeFile(NEXT_BET_FILE, nextBetSnapshot, "utf8");
});

async function resetNextBetFile() {
  await fsp.rm(NEXT_BET_FILE, { force: true });
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
async function withProblem(input, run) {
  const meta = await problemStore.createProblem(input);
  try { return await run(meta.id); } finally { await problemStore.deleteProblem(meta.id); }
}
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

function stubListProblems(ids) {
  const original = problemStore.listProblems;
  problemStore.listProblems = async () => ids.map((id) => ({ id }));
  return () => { problemStore.listProblems = original; };
}

test("GET next-bet: a surrendered match shows up under revenge, not self-select", async () => {
  await withProblem({ title: "zz-nextbet-revenge" }, async (id) => {
    await problemStore.updateProblem(id, {
      analysis: { cfRating: 1300 },
      match: { state: "surrendered", rated: true, outcome: "surrender", surrenderedAt: Date.now(), waCount: 2, openedAt: Date.now(), closedAt: null, adjournedAt: null, ratedEligible: {} },
    });
    const restore = stubListProblems([id]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/next-bet");
        assert.equal(r.status, 200);
        assert.equal(r.json.revenge.length, 1);
        assert.equal(r.json.revenge[0].id, id);
        assert.ok(typeof r.json.revenge[0].stakes.win === "number");
        assert.ok(!r.json.selfSelect.some((c) => c.id === id));
      });
    } finally {
      restore();
    }
  });
});

test("GET next-bet: an unsolved in-band problem shows up under self-select, sorted closest-first", async () => {
  // Pin the player rating to a known value for this test — RATING_FILE is
  // the REAL data/arena-rating.json (restored by test.after at the very end,
  // never per-test), so it carries whatever the student's actual live rating
  // currently is. Asserting a specific closest-first ORDER against real,
  // drifting production data is inherently flaky (this test broke the moment
  // real play pushed the rating past the midpoint of these two fixtures'
  // cfRatings) — pin it so the assertion tests the SORT, not today's Elo.
  await fsp.writeFile(RATING_FILE, JSON.stringify({ version: 1, rating: 1000, gamesPlayed: 0, band: 350, seeded: true, history: [] }), "utf8");
  await withProblem({ title: "zz-nextbet-close" }, (idClose) => withProblem({ title: "zz-nextbet-far" }, async (idFar) => {
    await problemStore.updateProblem(idClose, { analysis: { cfRating: 1010 } });
    await problemStore.updateProblem(idFar, { analysis: { cfRating: 1140 } });
    const restore = stubListProblems([idClose, idFar]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/next-bet");
        assert.deepEqual(r.json.selfSelect.map((c) => c.id), [idClose, idFar]);
      });
    } finally {
      restore();
    }
  }));
});

test("GET next-bet: Mystery Bet is redacted (no id/title/topic) until opened, but shows the rating band + stakes", async () => {
  await withProblem({ title: "zz-nextbet-mystery", topic: "dp" }, async (id) => {
    await problemStore.updateProblem(id, { analysis: { cfRating: 1050 } });
    const restore = stubListProblems([id]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/next-bet");
        assert.ok(r.json.mysteryBet);
        assert.equal(r.json.mysteryBet.opened, false);
        assert.equal(r.json.mysteryBet.id, undefined);
        assert.equal(r.json.mysteryBet.title, undefined);
        assert.equal(r.json.mysteryBet.topic, undefined);
        assert.equal(r.json.mysteryBet.cfRating, 1050);
        assert.ok(typeof r.json.mysteryBet.stakes.win === "number");
      });
    } finally {
      restore();
    }
  });
});

test("POST mystery/open reveals the full problem; a repeat GET then shows opened:true", async () => {
  await withProblem({ title: "zz-nextbet-open", topic: "graph" }, async (id) => {
    await problemStore.updateProblem(id, { analysis: { cfRating: 1050 } });
    const restore = stubListProblems([id]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        await getJson(base, "/api/arena/next-bet"); // commits the mystery pick
        const opened = await postJson(base, "/api/arena/next-bet/mystery/open", {});
        assert.equal(opened.status, 200);
        assert.equal(opened.json.problem.id, id);
        assert.equal(opened.json.problem.topic, "graph");

        const again = await getJson(base, "/api/arena/next-bet");
        assert.equal(again.json.mysteryBet.opened, true);
        assert.equal(again.json.mysteryBet.id, id);
      });
    } finally {
      restore();
    }
  });
});

test("POST mystery/reroll: refused once opened", async () => {
  await withProblem({ title: "zz-nextbet-reroll-blocked" }, async (id) => {
    await problemStore.updateProblem(id, { analysis: { cfRating: 1050 } });
    const restore = stubListProblems([id]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        await getJson(base, "/api/arena/next-bet");
        await postJson(base, "/api/arena/next-bet/mystery/open", {});
        const r = await postJson(base, "/api/arena/next-bet/mystery/reroll", {});
        assert.equal(r.status, 409);
        assert.equal(r.json.reason, "already-opened");
      });
    } finally {
      restore();
    }
  });
});

test("POST mystery/reroll: succeeds pre-open, picking a DIFFERENT eligible problem", async () => {
  await withProblem({ title: "zz-nextbet-reroll-a" }, (idA) => withProblem({ title: "zz-nextbet-reroll-b" }, async (idB) => {
    await problemStore.updateProblem(idA, { analysis: { cfRating: 1050 } });
    await problemStore.updateProblem(idB, { analysis: { cfRating: 1060 } });
    const restore = stubListProblems([idA, idB]);
    await resetNextBetFile();
    try {
      await withServer(async (base) => {
        const first = await getJson(base, "/api/arena/next-bet");
        const firstPickCommitted = await fsp.readFile(NEXT_BET_FILE, "utf8");
        const before = JSON.parse(firstPickCommitted).mysteryPick.problemId;

        const r = await postJson(base, "/api/arena/next-bet/mystery/reroll", {});
        assert.equal(r.status, 200);
        assert.equal(r.json.mysteryBet.opened, false);

        const afterFile = JSON.parse(await fsp.readFile(NEXT_BET_FILE, "utf8"));
        assert.notEqual(afterFile.mysteryPick.problemId, before);
        assert.ok([idA, idB].includes(afterFile.mysteryPick.problemId));
      });
    } finally {
      restore();
    }
  }));
});

test("GET next-bet: a Mystery Bet already solved through another door is cleared and replaced", async () => {
  await withProblem({ title: "zz-nextbet-solved-elsewhere" }, (idSolved) => withProblem({ title: "zz-nextbet-fresh" }, async (idFresh) => {
    await problemStore.updateProblem(idSolved, { analysis: { cfRating: 1050 } });
    await problemStore.updateProblem(idFresh, { analysis: { cfRating: 1050 } });
    const restore = stubListProblems([idSolved, idFresh]);
    await resetNextBetFile();
    try {
      const nextBetStore = require("../src/arena/nextBetStore");
      await nextBetStore.commitPick(NEXT_BET_FILE, idSolved);
      // The student solved it through revenge/self-select instead — mark it AC'd.
      await problemStore.updateProblem(idSolved, { match: { state: "closed", outcome: "ac", rated: true } });

      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/next-bet");
        assert.ok(r.json.mysteryBet);
        assert.notEqual(r.json.mysteryBet.cfRating, undefined);
        const stored = JSON.parse(await fsp.readFile(NEXT_BET_FILE, "utf8"));
        assert.equal(stored.mysteryPick.problemId, idFresh);
      });
    } finally {
      restore();
    }
  }));
});
