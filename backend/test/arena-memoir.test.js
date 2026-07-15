"use strict";

// Tests for arena/memoir.js (S10) — pure peak-end narrative logic. No fs.

const test = require("node:test");
const assert = require("node:assert/strict");
const memoir = require("../src/arena/memoir");

test("buildMemoir: nothing happened → falls back to the first existing note as peak", () => {
  const r = memoir.buildMemoir({ analysis: { attempts: 0 }, notes: ["Chưa có lần nộp nào để tổng kết."] });
  assert.equal(r.peak, "Chưa có lần nộp nào để tổng kết.");
  assert.deepEqual(r.lines, ["Chưa có lần nộp nào để tổng kết."]);
});

test("buildMemoir: clean first-try AC (no rating, no cards) becomes the peak", () => {
  const r = memoir.buildMemoir({ analysis: { attempts: 1, acAt: 1000 }, notes: ["✅ AC ngay lần nộp đầu tiên."] });
  assert.equal(r.peak, "Sạch: AC nộp phát một.");
});

test("buildMemoir: a comeback AC (waBeforeAc >= 2) outranks a plain rating gain as peak", () => {
  const r = memoir.buildMemoir({
    analysis: { attempts: 3, acAt: 5000 },
    notes: [],
    ratingDelta: { delta: 22, waBeforeAc: 3, ratingBefore: 1000, ratingAfter: 1022 },
  });
  assert.match(r.peak, /Comeback: AC sau 3 lần WA \(\+22 điểm\)\./);
  assert.ok(r.lines.includes(r.peak));
});

test("buildMemoir: a plain (non-comeback) rated AC is reported but is NOT elevated to peak over other signals", () => {
  const r = memoir.buildMemoir({
    analysis: { attempts: 1, acAt: 1000 },
    notes: [],
    ratingDelta: { delta: 5, waBeforeAc: 0, ratingBefore: 1000, ratingAfter: 1005 },
  });
  assert.ok(r.lines.includes("AC (+5 điểm)."));
});

test("buildMemoir: a surrender (negative delta) is reported honestly, never dressed up", () => {
  const r = memoir.buildMemoir({ analysis: { attempts: 2 }, notes: [], ratingDelta: { delta: -8, waBeforeAc: 0 } });
  assert.ok(r.lines.includes("Đầu hàng (-8 điểm)."));
});

test("buildMemoir: catching a brand-new species is the highest-priority peak, above a comeback", () => {
  const r = memoir.buildMemoir({
    analysis: { attempts: 3, acAt: 1000 },
    notes: [],
    ratingDelta: { delta: 22, waBeforeAc: 3 },
    cardsWon: [{ tag: "bien-tran", tagLabel: "Tràn số (overflow)", isNew: true }],
  });
  assert.equal(r.peak, "Bắt được loài mới: Tràn số (overflow).");
});

test("buildMemoir: a re-caught (not new) species doesn't generate a 'loài mới' line", () => {
  const r = memoir.buildMemoir({
    analysis: { attempts: 1, acAt: 1000 },
    notes: [],
    cardsWon: [{ tag: "bien-tran", tagLabel: "Tràn số (overflow)", isNew: false }],
  });
  assert.ok(!r.lines.some((l) => l.includes("loài mới")));
});

test("buildMemoir: existing Game Review notes are always carried through, never dropped", () => {
  const r = memoir.buildMemoir({
    analysis: { attempts: 2 },
    notes: ["⚠ Không có lần test tay nào trước khi nộp — thử chạy thử trước khi nộp lần sau."],
    ratingDelta: { delta: 10, waBeforeAc: 0 },
  });
  assert.ok(r.lines.includes("⚠ Không có lần test tay nào trước khi nộp — thử chạy thử trước khi nộp lần sau."));
  assert.ok(r.lines.includes("AC (+10 điểm)."));
});

// ---- buildSessionReel --------------------------------------------------------

test("buildSessionReel: an empty day is reported honestly, not a fabricated narrative", () => {
  const r = memoir.buildSessionReel([]);
  assert.equal(r.hasMatches, false);
  assert.equal(r.matchCount, 0);
});

test("buildSessionReel: ratingStart/ratingEnd read the FIRST/LAST chronological entries", () => {
  const entries = [
    { at: "t1", ratingDelta: { delta: 10, ratingBefore: 1000, ratingAfter: 1010 } },
    { at: "t2", ratingDelta: { delta: -5, ratingBefore: 1010, ratingAfter: 1005 } },
    { at: "t3", ratingDelta: { delta: 20, ratingBefore: 1005, ratingAfter: 1025 } },
  ];
  const r = memoir.buildSessionReel(entries);
  assert.equal(r.ratingStart, 1000);
  assert.equal(r.ratingEnd, 1025);
  assert.equal(r.matchCount, 3);
});

test("buildSessionReel: bestMatch picks the entry with the highest rating delta", () => {
  const entries = [
    { at: "t1", ratingDelta: { delta: 5 } },
    { at: "t2", ratingDelta: { delta: 30 } },
    { at: "t3", ratingDelta: { delta: -10 } },
  ];
  const r = memoir.buildSessionReel(entries);
  assert.equal(r.bestMatch.at, "t2");
});

test("buildSessionReel: counts new cards across the whole day", () => {
  const entries = [
    { at: "t1", cardsWon: [{ tag: "a", isNew: true }, { tag: "b", isNew: false }] },
    { at: "t2", cardsWon: [{ tag: "c", isNew: true }] },
  ];
  const r = memoir.buildSessionReel(entries);
  assert.equal(r.newCardsCount, 2);
});

// ---- cardsWonForProblem -------------------------------------------------------

test("cardsWonForProblem: matches cards whose evidence points at this problem", () => {
  const cards = {
    "bien-tran": { tag: "bien-tran", label: "Tràn số", firstCaughtAt: new Date(1000).toISOString(), evidence: ["problems/p1/moment/1000.json"] },
    "off-by-one": { tag: "off-by-one", label: "Off-by-one", firstCaughtAt: new Date(2000).toISOString(), evidence: ["problems/p2/moment/2000.json"] },
  };
  const won = memoir.cardsWonForProblem(cards, "p1");
  assert.equal(won.length, 1);
  assert.equal(won[0].tag, "bien-tran");
});

test("cardsWonForProblem: isNew is true exactly when this problem's evidence IS the first-ever catch", () => {
  const cards = {
    "bien-tran": {
      tag: "bien-tran", label: "Tràn số",
      firstCaughtAt: new Date(1000).toISOString(), // first caught via p1
      evidence: ["problems/p1/moment/1000.json", "problems/p2/moment/5000.json"],
    },
  };
  assert.equal(memoir.cardsWonForProblem(cards, "p1")[0].isNew, true);
  assert.equal(memoir.cardsWonForProblem(cards, "p2")[0].isNew, false);
});

test("cardsWonForProblem: a problem with no matching evidence yields nothing", () => {
  const cards = { "bien-tran": { tag: "bien-tran", firstCaughtAt: "x", evidence: ["problems/other/moment/1.json"] } };
  assert.deepEqual(memoir.cardsWonForProblem(cards, "p1"), []);
});
