"use strict";

// Tests for the pure counterexample shrink engine (WA Autopsy core).
// The engine never touches the judge or AI: it only sees an input string and
// an isInteresting(candidate) oracle. "Interesting" is composed by the
// orchestrator as: [student output wrong] AND [reference ok] AND [input valid].
// Here we simulate that oracle with cheap synchronous predicates.

const test = require("node:test");
const assert = require("node:assert/strict");

const { shrinkInput, normalizeInput } = require("../src/autopsy/shrink");

// ---- helpers -------------------------------------------------------------------

function parseLines(s) {
  return s.split("\n").map((l) => l.trim()).filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)));
}

// Format "n \n v1 \n v2 ... vn" (one value per line). Valid iff the header
// matches the number of value lines and every token is an integer.
function nPerLineValid(s) {
  const lines = s.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const n = Number(lines[0]);
  if (!Number.isInteger(n) || n < 1 || lines.length - 1 !== n) return null;
  const vals = lines.slice(1).map((l) => Number(l));
  if (vals.some((v) => !Number.isInteger(v))) return null;
  return vals;
}

// ---- normalizeInput --------------------------------------------------------------

test("normalizeInput collapses whitespace and strips edge blank lines", () => {
  assert.equal(normalizeInput("  1\t 2 \r\n\r\n3   4\r\n\r\n\r\n"), "1 2\n\n3 4");
  assert.equal(normalizeInput("5"), "5");
});

// ---- count-linked line removal + numeric minimization ----------------------------

test("shrinks 'n + n lines' input to the single offending value", async () => {
  // Buggy student sums absolute values → wrong iff any value is negative.
  const values = [5, 8, 3, 12, 44, 7, 9, 2, 6, 11, -7, 13];
  const original = `${values.length}\n${values.join("\n")}`;
  const oracle = (s) => {
    const vals = nPerLineValid(s);
    return vals !== null && vals.some((v) => v < 0);
  };

  const res = await shrinkInput(original, oracle, { maxRuns: 2000 });
  assert.equal(res.input, "1\n-1");
  assert.equal(res.improved, true);
  assert.ok(res.runs > 0 && res.runs <= 2000);
  assert.ok(res.toBytes < res.fromBytes);
});

// ---- token removal on a single line + bisection to a threshold -------------------

test("shrinks 'n on line 1, values on line 2' down to the 100 threshold", async () => {
  // Buggy student breaks iff any value >= 100. Minimal certificate: "1\n100".
  const original = "6\n3 250 7 999 4 12";
  const oracle = (s) => {
    const lines = s.split("\n").filter((l) => l.length > 0);
    if (lines.length !== 2) return false;
    const n = Number(lines[0]);
    const vals = lines[1].split(/\s+/).map(Number);
    if (!Number.isInteger(n) || n < 1 || vals.length !== n) return false;
    if (vals.some((v) => !Number.isInteger(v))) return false;
    return vals.some((v) => v >= 100);
  };

  const res = await shrinkInput(original, oracle, { maxRuns: 2000 });
  assert.equal(res.input, "1\n100");
});

// ---- linked repair of the SECOND header token (graph-style "n m") ----------------

test("shrinks a graph input, repairing m and respecting vertex bounds", async () => {
  // Bug triggers on self-loops. Validity: m edges follow, endpoints in 1..n.
  // Single-token moves cannot lower "4 4" (u==v must hold), so the local
  // minimum is n=4, m=1, one edge "4 4" — still a perfect tiny certificate.
  const original = "6 5\n1 2\n2 3\n4 4\n5 6\n1 6";
  const oracle = (s) => {
    const lines = s.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) return false;
    const head = lines[0].split(/\s+/).map(Number);
    if (head.length !== 2) return false;
    const [n, m] = head;
    if (!Number.isInteger(n) || !Number.isInteger(m) || n < 1 || m < 1) return false;
    if (lines.length - 1 !== m) return false;
    const edges = lines.slice(1).map((l) => l.split(/\s+/).map(Number));
    if (edges.some((e) => e.length !== 2 || e.some((x) => !Number.isInteger(x) || x < 1 || x > n))) return false;
    return edges.some(([u, v]) => u === v);
  };

  const res = await shrinkInput(original, oracle, { maxRuns: 2000 });
  assert.equal(res.input, "4 1\n4 4");
});

// ---- production scale -------------------------------------------------------------

test("distills a 2000-line input to a 2-line certificate on a modest budget", async () => {
  const values = Array.from({ length: 2000 }, (_, i) => (i === 37 ? -7 : (i * 13) % 97 + 1));
  const original = `${values.length}\n${values.join("\n")}`;
  const oracle = (s) => {
    const vals = nPerLineValid(s);
    return vals !== null && vals.some((v) => v < 0);
  };

  const res = await shrinkInput(original, oracle, { maxRuns: 1200 });
  assert.equal(res.input, "1\n-1");
  assert.ok(res.runs < 800, `expected < 800 runs, used ${res.runs}`);
  assert.ok(res.fromBytes > 5000 && res.toBytes === 4);
});

// ---- budget --------------------------------------------------------------------

test("respects maxRuns and returns best-so-far", async () => {
  const original = "10\n" + Array.from({ length: 10 }, (_, i) => i + 1).join("\n");
  let calls = 0;
  const oracle = (s) => {
    calls += 1;
    const vals = nPerLineValid(s);
    return vals !== null; // everything valid is interesting → endless shrink room
  };
  const res = await shrinkInput(original, oracle, { maxRuns: 15 });
  assert.ok(res.runs <= 15);
  assert.equal(calls, res.runs);
  assert.ok(oracle(res.input)); // whatever it returns must still be interesting
});

// ---- guards --------------------------------------------------------------------

test("throws when the original input is not interesting", async () => {
  await assert.rejects(() => shrinkInput("1\n1", () => false), /not interesting/i);
});

test("is deterministic for a deterministic oracle", async () => {
  const original = "5\n9 -3 7 -8 2";
  const oracle = (s) => {
    const lines = s.split("\n").filter((l) => l.length > 0);
    if (lines.length !== 2) return false;
    const n = Number(lines[0]);
    const vals = lines[1].split(/\s+/).map(Number);
    if (!Number.isInteger(n) || n < 1 || vals.length !== n || vals.some((v) => !Number.isInteger(v))) return false;
    return vals.some((v) => v < 0);
  };
  const a = await shrinkInput(original, oracle, { maxRuns: 2000 });
  const b = await shrinkInput(original, oracle, { maxRuns: 2000 });
  assert.equal(a.input, b.input);
  assert.equal(a.runs, b.runs);
  assert.equal(a.input, "1\n-1");
});
