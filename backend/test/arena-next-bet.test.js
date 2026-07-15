"use strict";

// Tests for arena/nextBet.js — pure core of "Kèo 3 cửa" (Revenge / Self-select
// / Mystery Bet). Takes already-flattened candidate records (no fs, no
// Date.now()) — same "pure core given already-loaded facts" convention as
// arena/upgrade.js's evaluateCandidate.

const test = require("node:test");
const assert = require("node:assert/strict");

const nextBet = require("../src/arena/nextBet");

function candidate(overrides = {}) {
  return {
    id: "bai-x", title: "Bài X", topic: "dp", tags: ["dp"],
    cfRating: 1200, updatedAt: "2026-07-01T00:00:00.000Z",
    matchState: "none", matchOutcome: null, matchRated: null, solved: false, gauntletLastResult: null,
    ...overrides,
  };
}

// ---- pickRevenge ------------------------------------------------------------

test("pickRevenge: a surrendered match is a real debt", () => {
  const list = [candidate({ id: "a", matchState: "surrendered" })];
  const out = nextBet.pickRevenge(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "a");
});

test("pickRevenge: an AC whose Gauntlet later broke it is also a debt (redemption)", () => {
  const list = [candidate({ id: "b", matchState: "closed", matchOutcome: "ac", matchRated: true, solved: true, gauntletLastResult: "broken" })];
  const out = nextBet.pickRevenge(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b");
});

test("pickRevenge: a clean AC that survived the Gauntlet is NOT a debt", () => {
  const list = [candidate({ id: "c", matchState: "closed", matchOutcome: "ac", solved: true, gauntletLastResult: "survived" })];
  assert.equal(nextBet.pickRevenge(list).length, 0);
});

test("pickRevenge: a never-attempted or still-open problem is NOT a debt", () => {
  const list = [candidate({ id: "d", matchState: "none" }), candidate({ id: "e", matchState: "open" }), candidate({ id: "f", matchState: "adjourned" })];
  assert.equal(nextBet.pickRevenge(list).length, 0);
});

test("pickRevenge: sorts most-recently-touched debt first", () => {
  const list = [
    candidate({ id: "old", matchState: "surrendered", updatedAt: "2026-06-01T00:00:00.000Z" }),
    candidate({ id: "new", matchState: "surrendered", updatedAt: "2026-07-05T00:00:00.000Z" }),
  ];
  const out = nextBet.pickRevenge(list);
  assert.deepEqual(out.map((c) => c.id), ["new", "old"]);
});

// ---- pickSelfSelect ----------------------------------------------------------

test("pickSelfSelect: only unsolved problems within the Elo band qualify", () => {
  const list = [
    candidate({ id: "in-band", cfRating: 1250 }),
    candidate({ id: "too-far", cfRating: 3000 }),
    candidate({ id: "already-solved", cfRating: 1250, matchState: "closed", matchOutcome: "ac", solved: true }),
    candidate({ id: "no-rating", cfRating: 0 }),
  ];
  const out = nextBet.pickSelfSelect(list, 1200, { bandWidth: 150 });
  assert.deepEqual(out.map((c) => c.id), ["in-band"]);
});

test("pickSelfSelect: excludeIds removes already-offered-elsewhere candidates (e.g. revenge)", () => {
  const list = [candidate({ id: "a", cfRating: 1200 }), candidate({ id: "b", cfRating: 1210 })];
  const out = nextBet.pickSelfSelect(list, 1200, { excludeIds: ["a"] });
  assert.deepEqual(out.map((c) => c.id), ["b"]);
});

test("pickSelfSelect: sorts closest-to-current-rating first", () => {
  const list = [
    candidate({ id: "far", cfRating: 1340 }),
    candidate({ id: "close", cfRating: 1210 }),
  ];
  const out = nextBet.pickSelfSelect(list, 1200, { bandWidth: 150 });
  assert.deepEqual(out.map((c) => c.id), ["close", "far"]);
});

// ---- pickMysteryBet -----------------------------------------------------------

test("pickMysteryBet: picks one eligible candidate deterministically via the injected randomFn", () => {
  const list = [candidate({ id: "a", cfRating: 1200 }), candidate({ id: "b", cfRating: 1210 }), candidate({ id: "c", cfRating: 1220 })];
  const picked = nextBet.pickMysteryBet(list, 1200, { bandWidth: 150, randomFn: () => 0 });
  assert.equal(picked.id, "a");
  const pickedLast = nextBet.pickMysteryBet(list, 1200, { bandWidth: 150, randomFn: () => 0.999 });
  assert.equal(pickedLast.id, "c");
});

test("pickMysteryBet: returns null when the eligible pool is empty", () => {
  const list = [candidate({ id: "solved", matchState: "closed", matchOutcome: "ac", solved: true })];
  assert.equal(nextBet.pickMysteryBet(list, 1200, { bandWidth: 150 }), null);
});

test("pickMysteryBet/pickSelfSelect: solved via legacy fields (no match struct at all) is still excluded", () => {
  // The real bug this guards: a problem solved BEFORE the Arena's match
  // bookkeeping existed has matchState "none" but IS solved — the route
  // computes `solved` via arena/match.js's wasEverSolved, which also checks
  // lastVerdict/status/history, not just matchState.
  const list = [candidate({ id: "legacy-solved", cfRating: 1200, matchState: "none", solved: true })];
  assert.equal(nextBet.pickMysteryBet(list, 1200, { bandWidth: 150 }), null);
  assert.equal(nextBet.pickSelfSelect(list, 1200, { bandWidth: 150 }).length, 0);
});

test("pickMysteryBet: respects excludeIds (e.g. don't repick the currently-committed one on reroll)", () => {
  const list = [candidate({ id: "a", cfRating: 1200 })];
  assert.equal(nextBet.pickMysteryBet(list, 1200, { excludeIds: ["a"] }), null);
});

// ---- redactCandidate ----------------------------------------------------------

test("redactCandidate: strips id/title/topic/tags — nothing that could leak identity via slug", () => {
  const c = candidate({ id: "hai-con-tro-nang-cao", title: "Hai con trỏ nâng cao", topic: "two-pointer", tags: ["two-pointer"], cfRating: 1300 });
  const redacted = nextBet.redactCandidate(c);
  assert.equal(redacted.id, undefined);
  assert.equal(redacted.title, undefined);
  assert.equal(redacted.topic, undefined);
  assert.equal(redacted.tags, undefined);
  assert.equal(redacted.cfRating, 1300); // band IS shown — only topic/identity is hidden
});

// ---- withStakes ----------------------------------------------------------------

test("withStakes: attaches win/lose/expected + riskLabel + nextTierGap using the Elo engine", () => {
  const c = candidate({ cfRating: 1200 });
  const out = nextBet.withStakes(c, { rating: 1000, gamesPlayed: 0 });
  assert.ok(typeof out.stakes.win === "number");
  assert.ok(typeof out.stakes.lose === "number");
  assert.ok(out.riskLabel);
  assert.ok(typeof out.nextTierGap === "number");
});
