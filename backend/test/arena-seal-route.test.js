"use strict";

// Route-level test for routes/arena-seal.js — proves the assembly (meta.history
// + match + Reference Vault gauntlet result + hintsUsed + reviewCount →
// arena/seal.js's computeSeal) is wired correctly end-to-end. GUARDRAIL: the
// /api/arena/seals archive calls problemStore.listProblems() with no filter —
// stub it to the throwaway ids this file creates (same reasoning as
// arena-upgrade-route.test.js's GUARDRAIL comment).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const { buildApp } = require("../server");

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-seal-route-test", ...input });
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
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }

// recordRun always stamps `at` with the real current time (ignores any `at`
// passed in) but always unshifts onto meta.history, so calling it in order
// still produces the correct newest-first chronology deriveSolveProfile needs.
async function seedAc(id, { rated = null, waBeforeAc = 0 } = {}) {
  for (let i = 0; i < waBeforeAc; i += 1) {
    await problemStore.recordRun(id, { verdict: "WA" });
  }
  await problemStore.recordRun(id, { verdict: "AC" });
  await problemStore.updateProblem(id, { match: { state: "closed", outcome: "ac", rated } });
}

test("GET seal on a never-attempted problem reports tier 0", async () => {
  await withProblem({}, async (id) => {
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.status, 200);
      assert.equal(r.json.seal.tier, 0);
      assert.equal(r.json.seal.tierName, "Chưa có Ấn");
    });
  });
});

test("GET seal on a Friendly AC reports Thô", async () => {
  await withProblem({}, async (id) => {
    await seedAc(id, { rated: false });
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.json.seal.tier, 1);
      assert.equal(r.json.seal.tierName, "Thô");
    });
  });
});

test("GET seal on a Rated AC whose Gauntlet survived, clean, reaches Tinh Luyện", async () => {
  await withProblem({}, async (id) => {
    await seedAc(id, { rated: true, waBeforeAc: 0 });
    await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: 40 });
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.json.seal.tier, 3);
      assert.equal(r.json.seal.tierName, "Tinh Luyện");
      assert.equal(r.json.seal.kintsugi.waCount, 0);
    });
  });
});

test("GET seal on a Rated AC with WA scars stops at Đã Tôi and reports the scar count", async () => {
  await withProblem({}, async (id) => {
    await seedAc(id, { rated: true, waBeforeAc: 3 });
    await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: 20 });
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.json.seal.tier, 2);
      assert.equal(r.json.seal.tierName, "Đã Tôi");
      assert.equal(r.json.seal.kintsugi.waCount, 3);
    });
  });
});

test("GET seal reflects hintsUsed capping the tier at Đã Tôi", async () => {
  await withProblem({}, async (id) => {
    await seedAc(id, { rated: true, waBeforeAc: 0 });
    await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: 20 });
    await problemStore.incrementHintsUsed(id);
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.json.seal.tier, 2);
    });
  });
});

test("GET seal reaches Chân Phẩm once reviewCount hits the 21-day checkpoint with no post-AC WA", async () => {
  await withProblem({}, async (id) => {
    await seedAc(id, { rated: true, waBeforeAc: 0 });
    await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: 20 });
    await problemStore.updateProblem(id, { reviewCount: 3 });
    await withServer(async (base) => {
      const r = await getJson(base, `/api/problems/${id}/seal`);
      assert.equal(r.json.seal.tier, 4);
      assert.equal(r.json.seal.tierName, "Chân Phẩm");
    });
  });
});

function stubListProblems(ids) {
  const original = problemStore.listProblems;
  problemStore.listProblems = async () => ids.map((id) => ({ id, title: id }));
  return () => { problemStore.listProblems = original; };
}

test("GET /api/arena/seals (Tàng Ấn) lists only tier>=1 problems, highest tier first", async () => {
  await withProblem({}, (idHigh) => withProblem({}, (idLow) => withProblem({}, async (idUnsolved) => {
    await seedAc(idHigh, { rated: true, waBeforeAc: 0 });
    await referenceStore.recordGauntletRun(idHigh, { result: "survived", survivedRuns: 20 });
    await seedAc(idLow, { rated: false });
    // idUnsolved stays untouched — tier 0, must be excluded from the archive.

    const restore = stubListProblems([idHigh, idLow, idUnsolved]);
    try {
      await withServer(async (base) => {
        const r = await getJson(base, "/api/arena/seals");
        assert.equal(r.status, 200);
        const ids = r.json.seals.map((s) => s.id);
        assert.ok(ids.includes(idHigh));
        assert.ok(ids.includes(idLow));
        assert.ok(!ids.includes(idUnsolved));
        assert.ok(r.json.seals.find((s) => s.id === idHigh).tier > r.json.seals.find((s) => s.id === idLow).tier);
      });
    } finally {
      restore();
    }
  })));
});
