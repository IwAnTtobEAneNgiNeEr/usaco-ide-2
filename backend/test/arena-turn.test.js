"use strict";

// Integration tests for arena/turn.js — the non-pure edge wiring match.js (S2)
// + rating.js (S3/S4) into real problemStore/referenceStore state, using
// throwaway zz-* problems (problem-store.test.js convention).
//
// ratingStore's actual disk writes are swapped for an in-memory fake for the
// duration of this file (same monkey-patch technique this codebase already
// uses for ai.generateHelper/settingsStore.getAiSettings) — turn.js's
// RATING_FILE constant points at the REAL data/arena-rating.json, and this
// suite must never touch that real file.

const test = require("node:test");
const assert = require("node:assert/strict");

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const ratingStore = require("../src/arena/ratingStore");
const turn = require("../src/arena/turn");
const { statementHash } = require("../src/trustLayer");

const STATEMENT = ["# Sum", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "6", "```"].join("\n");

function fakeRatingStore() {
  let state = { rating: 1000, gamesPlayed: 0, history: [] };
  const calls = [];
  return {
    install() {
      const orig = { applyAndSave: ratingStore.applyAndSave, load: ratingStore.load };
      ratingStore.applyAndSave = async (_file, args) => {
        calls.push(args);
        const before = state.rating;
        const delta = args.verdict === "surrender" ? -10 : 20; // fixed, deterministic — the real math is rating.test.js's job
        state = { rating: before + delta, gamesPlayed: state.gamesPlayed + 1, history: [{ id: `e${calls.length}`, ...args, delta, ratingBefore: before, ratingAfter: before + delta }, ...state.history] };
        return { state, entry: state.history[0] };
      };
      ratingStore.load = async () => state;
      return { restore: () => Object.assign(ratingStore, orig), calls, state: () => state };
    },
  };
}

async function withProblem(input, run) {
  const meta = await problemStore.createProblem({ title: "zz-arena-turn-test", statement: STATEMENT, ...input });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
}

async function makeFullyEligible(id) {
  await referenceStore.setReference(id, "int main(){}", {
    source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT),
  });
  const meta = await problemStore.readMeta(id);
  await problemStore.updateProblem(id, { analysis: { ...(meta.analysis || {}), cfRating: 1300, ratingConfirmed: true } });
}

// ---- computeEligibility ------------------------------------------------------

test("computeEligibility: fresh problem is ineligible on all three counts", async () => {
  await withProblem({}, async (id) => {
    const meta = await problemStore.readMeta(id);
    const e = await turn.computeEligibility(id, meta, STATEMENT);
    assert.equal(e.sample, true); // STATEMENT has a real sample block
    assert.equal(e.reference, false);
    assert.equal(e.problemRatingConfirmed, false);
  });
});

test("computeEligibility: all three conditions true after vault + confirm", async () => {
  await withProblem({}, async (id) => {
    await makeFullyEligible(id);
    const meta = await problemStore.readMeta(id);
    const e = await turn.computeEligibility(id, meta, STATEMENT);
    assert.equal(e.sample, true);
    assert.equal(e.reference, true);
    assert.equal(e.problemRatingConfirmed, true);
  });
});

test("computeEligibility: reference goes stale after the statement changes", async () => {
  await withProblem({}, async (id) => {
    await makeFullyEligible(id);
    const changedStatement = STATEMENT + "\n(edited)";
    const meta = await problemStore.readMeta(id);
    const e = await turn.computeEligibility(id, meta, changedStatement);
    assert.equal(e.reference, false);
  });
});

// ---- onJudgeVerdict -----------------------------------------------------------

test("onJudgeVerdict: AC with full eligibility closes RATED and applies a rating delta", async () => {
  const fake = fakeRatingStore().install();
  try {
    await withProblem({}, async (id) => {
      await makeFullyEligible(id);
      const result = await turn.onJudgeVerdict({ id, verdict: "AC" });
      assert.equal(result.event, "closed-ac");
      assert.equal(result.match.rated, true);
      assert.ok(result.rating);
      assert.equal(result.rating.problemId, id);
      assert.equal(fake.calls.length, 1);
      assert.equal(fake.calls[0].verdict, "AC");
      assert.equal(fake.calls[0].waBeforeAc, 0);

      const persisted = (await problemStore.readMeta(id)).match;
      assert.equal(persisted.state, "closed");
      assert.equal(persisted.rated, true);
    });
  } finally {
    fake.restore();
  }
});

test("onJudgeVerdict: AC without eligibility closes FRIENDLY, rating untouched", async () => {
  const fake = fakeRatingStore().install();
  try {
    await withProblem({}, async (id) => {
      const result = await turn.onJudgeVerdict({ id, verdict: "AC" });
      assert.equal(result.match.rated, false);
      assert.equal(result.rating, null);
      assert.equal(fake.calls.length, 0);
    });
  } finally {
    fake.restore();
  }
});

test("onJudgeVerdict: WA increments waCount and never closes the match", async () => {
  const fake = fakeRatingStore().install();
  try {
    await withProblem({}, async (id) => {
      await turn.onJudgeVerdict({ id, verdict: "WA" });
      const r2 = await turn.onJudgeVerdict({ id, verdict: "WA" });
      assert.equal(r2.event, "fail");
      assert.equal(r2.match.state, "open");
      assert.equal(r2.match.waCount, 2);
      assert.equal(fake.calls.length, 0);
    });
  } finally {
    fake.restore();
  }
});

test("onJudgeVerdict: waBeforeAc carries the real WA count into the rating call", async () => {
  const fake = fakeRatingStore().install();
  try {
    await withProblem({}, async (id) => {
      await makeFullyEligible(id);
      await turn.onJudgeVerdict({ id, verdict: "WA" });
      await turn.onJudgeVerdict({ id, verdict: "WA" });
      await turn.onJudgeVerdict({ id, verdict: "WA" });
      await turn.onJudgeVerdict({ id, verdict: "AC" });
      assert.equal(fake.calls.length, 1);
      assert.equal(fake.calls[0].waBeforeAc, 3);
    });
  } finally {
    fake.restore();
  }
});

test("onJudgeVerdict: CE returns null and touches nothing", async () => {
  await withProblem({}, async (id) => {
    const result = await turn.onJudgeVerdict({ id, verdict: "CE" });
    assert.equal(result, null);
    const meta = await problemStore.readMeta(id);
    assert.equal(meta.match, null);
  });
});

// ---- surrender / adjourn -------------------------------------------------------

test("surrenderMatch: rated surrender applies a (negative) rating delta", async () => {
  const fake = fakeRatingStore().install();
  try {
    await withProblem({}, async (id) => {
      await makeFullyEligible(id);
      await turn.onJudgeVerdict({ id, verdict: "WA" }); // open the match
      const result = await turn.surrenderMatch(id);
      assert.equal(result.match.state, "surrendered");
      assert.equal(result.match.rated, true);
      assert.ok(result.rating);
      assert.equal(fake.calls[0].verdict, "surrender");
    });
  } finally {
    fake.restore();
  }
});

test("surrenderMatch: nothing live to surrender is a harmless no-op", async () => {
  await withProblem({}, async (id) => {
    const result = await turn.surrenderMatch(id);
    assert.equal(result.match.state, "none");
    assert.equal(result.rating, null);
  });
});

test("adjournMatch: open → adjourned, persisted; never touches rating", async () => {
  await withProblem({}, async (id) => {
    await turn.onJudgeVerdict({ id, verdict: "WA" });
    const result = await turn.adjournMatch(id);
    assert.equal(result.match.state, "adjourned");
    const persisted = (await problemStore.readMeta(id)).match;
    assert.equal(persisted.state, "adjourned");
  });
});

// ---- getMatchStatus -------------------------------------------------------------

test("getMatchStatus: reports live eligibility and the CONFIRMED problem rating", async () => {
  await withProblem({}, async (id) => {
    await makeFullyEligible(id);
    const status = await turn.getMatchStatus(id);
    assert.equal(status.wouldBeRated, true);
    assert.equal(status.problemRating, 1300);
    assert.equal(status.match.state, "none"); // no judge run yet
  });
});
