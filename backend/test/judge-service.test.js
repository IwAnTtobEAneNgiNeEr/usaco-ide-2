"use strict";

// Tests for the parallel judge pool, cancellation, the SPJ (checker.cpp) path,
// and the DNS-rebinding Host guard. Compile-dependent cases skip themselves
// when g++ is not installed, so the suite stays green on tool-less machines.

const test = require("node:test");
const assert = require("node:assert/strict");

const judgeService = require("../src/judgeService");
const runCpp = require("../src/runCpp");
const { isAllowedHost } = require("../server");

// ---------------------------------------------------------------------------
// mapLimit — bounded-concurrency mapper that the judge pool runs on
// ---------------------------------------------------------------------------

test("mapLimit preserves input order in its results", async () => {
  const items = [50, 10, 30, 0, 20];
  const out = await judgeService.mapLimit(items, 3, async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    return ms * 2;
  });
  assert.deepEqual(out, [100, 20, 60, 0, 40]);
});

test("mapLimit never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;
  await judgeService.mapLimit(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
  });
  assert.ok(peak <= 3, `peak concurrency ${peak} > 3`);
  assert.ok(peak >= 2, `pool never actually ran in parallel (peak ${peak})`);
});

test("mapLimit handles empty input and limit larger than items", async () => {
  assert.deepEqual(await judgeService.mapLimit([], 4, async (x) => x), []);
  assert.deepEqual(await judgeService.mapLimit([1], 8, async (x) => x + 1), [2]);
});

// ---------------------------------------------------------------------------
// judgeConcurrency — pool sizing policy
// ---------------------------------------------------------------------------

test("judgeConcurrency is 1 for USACO file mode (shared cwd files)", () => {
  assert.equal(judgeService.judgeConcurrency(30, { name: "milk" }), 1);
});

test("judgeConcurrency never exceeds 4 nor the test count", () => {
  assert.ok(judgeService.judgeConcurrency(100, null) <= 4);
  assert.ok(judgeService.judgeConcurrency(2, null) <= 2);
  assert.equal(judgeService.judgeConcurrency(1, null), 1);
  assert.ok(judgeService.judgeConcurrency(100, null) >= 1);
});

// ---------------------------------------------------------------------------
// isAllowedHost — DNS-rebinding guard
// ---------------------------------------------------------------------------

test("isAllowedHost accepts loopback hosts with and without ports", () => {
  for (const h of ["localhost", "localhost:5050", "127.0.0.1", "127.0.0.1:5050", "[::1]", "[::1]:5050", "LOCALHOST:5050"]) {
    assert.equal(isAllowedHost(h), true, h);
  }
});

test("isAllowedHost rejects foreign / missing hosts", () => {
  for (const h of ["evil.example.com", "evil.example.com:5050", "127.0.0.1.evil.com", "", null, undefined]) {
    assert.equal(isAllowedHost(h), false, String(h));
  }
});

// ---------------------------------------------------------------------------
// compileAndJudge — integration (needs a real g++; skips when absent)
// ---------------------------------------------------------------------------

const SETTINGS = { compilerPath: "g++", cppStandard: "c++17", optimization: "-O2", timeMs: 3000, compareMode: "loose" };

async function gxxAvailable() {
  try { return (await runCpp.checkCompiler(SETTINGS)).available; } catch { return false; }
}

// Plain <iostream> (no bits/stdc++.h) keeps these compiles cheap — no PCH build.
const SUM_CODE = `#include <iostream>
int main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";return 0;}`;

const TESTS = [
  { id: "01", name: "Test 01", input: "1 2\n", expected: "3\n" },
  { id: "02", name: "Test 02", input: "10 20\n", expected: "30\n" },
  { id: "03", name: "Test 03", input: "-5 5\n", expected: "0\n" }
];

test("compileAndJudge: parallel pool produces ordered AC results", async (t) => {
  if (!(await gxxAvailable())) return t.skip("g++ not installed");
  const r = await judgeService.compileAndJudge({ code: SUM_CODE, settings: SETTINGS, tests: TESTS });
  assert.equal(r.verdict, "AC");
  assert.deepEqual(r.results.map((x) => x.testId), ["01", "02", "03"]);
  assert.equal(r.summary.passed, 3);
  assert.ok(!r.cancelled);
});

test("compileAndJudge: shouldStop skips remaining tests and flags cancelled", async (t) => {
  if (!(await gxxAvailable())) return t.skip("g++ not installed");
  const r = await judgeService.compileAndJudge({
    code: SUM_CODE, settings: SETTINGS, tests: TESTS, shouldStop: () => true
  });
  assert.equal(r.cancelled, true);
  assert.equal(r.results.length, 0);
});

test("compileAndJudge: SPJ checker verdict + message override plain compare", async (t) => {
  if (!(await gxxAvailable())) return t.skip("g++ not installed");
  // Checker accepts ANY output for even sums, rejects odd sums — independent of
  // the expected file, which is the whole point of an SPJ.
  const CHECKER = `#include <fstream>
#include <iostream>
int main(int argc,char**argv){if(argc<4)return 2;std::ifstream in(argv[1]);long long a,b;in>>a>>b;
if((a+b)%2==0){std::cout<<"even sum ok";return 0;}std::cout<<"odd sum rejected";return 1;}`;
  const tests = [
    { id: "01", name: "even", input: "2 2\n", expected: "ignored\n" },
    { id: "02", name: "odd", input: "2 3\n", expected: "5\n" }
  ];
  const r = await judgeService.compileAndJudge({ code: SUM_CODE, settings: SETTINGS, tests, checker: CHECKER });
  assert.equal(r.results[0].status, "AC");
  assert.equal(r.results[0].checkerMessage, "even sum ok");
  assert.equal(r.results[1].status, "WA"); // exact match, but the checker says no
  assert.equal(r.results[1].checkerMessage, "odd sum rejected");
  assert.equal(r.verdict, "WA");
});

test("compileAndJudge: broken checker surfaces as a named CE, not a crash", async (t) => {
  if (!(await gxxAvailable())) return t.skip("g++ not installed");
  const r = await judgeService.compileAndJudge({
    code: SUM_CODE, settings: SETTINGS, tests: TESTS, checker: "int main( {" // malformed
  });
  assert.equal(r.verdict, "CE");
  assert.equal(r.checkerBroken, true);
  assert.match(r.compile.stderr, /^checker\.cpp:/);
});
