"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RUNNER_ISOLATION,
  prepareStressRequest,
  runStress
} = require("../src/stressEngine");

const SETTINGS = { timeMs: 2000, compareMode: "loose", epsilon: 1e-6 };
const SOURCES = {
  generatorCode: "GENERATOR",
  bruteCode: "BRUTE",
  solutionCode: "SOLUTION"
};

function options(overrides = {}, prepareDeps = {}) {
  const parsed = prepareStressRequest({
    ...SOURCES,
    mode: "correctness",
    seedMode: "fixed",
    seedStart: 10,
    testCount: 2,
    ...overrides
  }, SETTINGS, prepareDeps);
  assert.equal(parsed.ok, true, parsed.error);
  return parsed.value;
}

function programForCode(code) {
  if (code === SOURCES.generatorCode) return "generator";
  if (code === SOURCES.bruteCode) return "brute";
  if (code === SOURCES.solutionCode) return "solution";
  return "unknown";
}

function makeFakeRunner(overrides = {}) {
  const state = { compiles: [], runs: [], cleanups: [], compares: [], events: [] };
  const compileStandalone = overrides.compileStandalone || (async ({ code }) => {
    const program = programForCode(code);
    state.compiles.push(program);
    return {
      ok: true,
      binaryPath: program,
      workdir: `work-${program}`,
      timeMs: program === "generator" ? 11 : program === "brute" ? 12 : 13,
      stderr: ""
    };
  });
  const runBinary = overrides.runBinary || (async ({ binaryPath, input, args }) => {
    const seed = args && args[0];
    state.runs.push({ program: binaryPath, input, args });
    if (binaryPath === "generator") return { status: "OK", stdout: `${seed}\n`, stderr: "", runtimeMs: 1 };
    if (binaryPath === "brute") return { status: "OK", stdout: `answer:${String(input).trim()}`, stderr: "", runtimeMs: 2 };
    return { status: "OK", stdout: `answer:${String(input).trim()}`, stderr: "", runtimeMs: 3 };
  });
  const compareOutput = overrides.compareOutput || ((expected, actual, mode, opts) => {
    state.compares.push({ expected, actual, mode, opts });
    const ok = expected === actual;
    return { ok, diff: ok ? null : { line: 1, expected, actual } };
  });
  const cleanupWorkdir = overrides.cleanupWorkdir || (async (workdir) => { state.cleanups.push(workdir); });
  return {
    state,
    deps: {
      settings: SETTINGS,
      compileStandalone: async (args) => compileStandalone(args, state),
      runBinary: async (args) => runBinary(args, state),
      compareOutput: (...args) => compareOutput(...args),
      cleanupWorkdir: async (workdir) => cleanupWorkdir(workdir, state),
      onEvent: (frame) => state.events.push(frame),
      ...(overrides.deps || {})
    }
  };
}

test("prepareStressRequest: fixed seedStart is exact, random seed is injectable, and code limits are enforced", () => {
  const fixed = prepareStressRequest({
    ...SOURCES,
    seedMode: "fixed",
    seedStart: 23,
    testCount: 3,
    compareMode: "token",
    epsilon: 0.001,
    timeMs: 900
  }, SETTINGS);
  assert.equal(fixed.ok, true);
  assert.equal(fixed.value.seedStart, 23);
  assert.equal(fixed.value.seedMode, "fixed");
  assert.equal(fixed.value.compareMode, "token");
  assert.equal(fixed.value.epsilon, 0.001);
  assert.equal(fixed.value.timeMs, 900);

  const random = prepareStressRequest({ ...SOURCES, seedMode: "random", testCount: 2 }, SETTINGS, {
    randomSeed: (maxStart) => { assert.ok(maxStart > 700); return 700; }
  });
  assert.equal(random.ok, true);
  assert.equal(random.value.seedStart, 700);

  const tooLarge = prepareStressRequest({ ...SOURCES, generatorCode: "12345" }, SETTINGS, { maxCodeBytes: 4 });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.field, "generatorCode");

  const badFixed = prepareStressRequest({ ...SOURCES, seedMode: "fixed", seedStart: "abc" }, SETTINGS);
  assert.equal(badFixed.ok, false);
  assert.equal(badFixed.field, "seedStart");
});

test("correctness mode compiles three programs and runs Generator -> Brute -> Solution for every exact seed", async () => {
  const fake = makeFakeRunner();
  const result = await runStress(options({ seedStart: 40, testCount: 2 }), fake.deps);

  assert.equal(result.type, "done");
  assert.equal(result.ok, true);
  assert.equal(result.attempted, 2);
  assert.equal(result.seedStart, 40);
  assert.equal(result.seedEnd, 41);
  assert.equal(result.nextSeed, 42);
  assert.equal(result.runnerIsolation, RUNNER_ISOLATION);
  assert.deepEqual(fake.state.compiles, ["generator", "brute", "solution"]);
  assert.deepEqual(fake.state.runs.map((r) => r.program), [
    "generator", "brute", "solution",
    "generator", "brute", "solution"
  ]);
  assert.deepEqual(fake.state.runs.filter((r) => r.program === "generator").map((r) => r.args), [
    ["40", "correctness"], ["41", "correctness"]
  ]);
  assert.deepEqual(fake.state.events.filter((e) => e.type === "test").map((e) => [e.index, e.seed, e.verdict]), [
    [1, 40, "AC"], [2, 41, "AC"]
  ]);
  assert.deepEqual(fake.state.cleanups.sort(), ["work-brute", "work-generator", "work-solution"]);
});

test("WA stops immediately and returns seed, full outputs, stderr records, diff, and timings", async () => {
  const fake = makeFakeRunner({
    runBinary: async ({ binaryPath, input, args }, state) => {
      const seed = args && args[0];
      state.runs.push({ program: binaryPath, input, args });
      if (binaryPath === "generator") return { status: "OK", stdout: `${seed}\n`, stderr: "gen-note", runtimeMs: 4 };
      if (binaryPath === "brute") return { status: "OK", stdout: `right:${String(input).trim()}`, stderr: "brute-note", runtimeMs: 5 };
      const wrong = String(input).trim() === "51";
      return { status: "OK", stdout: `${wrong ? "wrong" : "right"}:${String(input).trim()}`, stderr: "solution-note", runtimeMs: 6 };
    }
  });
  const result = await runStress(options({ seedStart: 50, testCount: 5 }), fake.deps);

  assert.equal(result.type, "failure");
  assert.equal(result.verdict, "WA");
  assert.equal(result.stage, "compare");
  assert.equal(result.program, "solution");
  assert.equal(result.found, true);
  assert.equal(result.index, 2);
  assert.equal(result.seed, 51);
  assert.equal(result.nextSeed, 52);
  assert.equal(result.input, "51\n");
  assert.equal(result.expected, "right:51");
  assert.equal(result.actual, "wrong:51");
  assert.equal(result.generator.stderr, "gen-note");
  assert.equal(result.brute.stderr, "brute-note");
  assert.equal(result.solution.stderr, "solution-note");
  assert.deepEqual(result.timings, { generatorMs: 4, bruteMs: 5, solutionMs: 6, totalMs: 15 });
  assert.deepEqual(result.diff, { line: 1, expected: "right:51", actual: "wrong:51" });
  assert.equal(fake.state.runs.length, 6, "nothing after the first mismatch may run");
  assert.deepEqual(fake.state.events.filter((e) => e.type === "test").map((e) => e.seed), [50]);
});

test("a Brute TLE is terminal and Solution is never run on that untrusted input", async () => {
  const fake = makeFakeRunner({
    runBinary: async ({ binaryPath, input, args }, state) => {
      state.runs.push({ program: binaryPath, input, args });
      if (binaryPath === "generator") return { status: "OK", stdout: "case\n", runtimeMs: 1 };
      if (binaryPath === "brute") return { status: "TLE", stdout: "partial", stderr: "oracle slow", runtimeMs: 2000 };
      throw new Error("Solution must not run after Brute failed");
    }
  });
  const result = await runStress(options({ testCount: 4 }), fake.deps);

  assert.equal(result.type, "failure");
  assert.equal(result.program, "brute");
  assert.equal(result.verdict, "TLE");
  assert.equal(result.found, false);
  assert.equal(result.brute.stderr, "oracle slow");
  assert.equal(result.solution, null);
  assert.deepEqual(fake.state.runs.map((r) => r.program), ["generator", "brute"]);
});

test("a Solution RE/TLE keeps the trusted Brute answer and all process diagnostics", async () => {
  const fake = makeFakeRunner({
    runBinary: async ({ binaryPath, input, args }, state) => {
      state.runs.push({ program: binaryPath, input, args });
      if (binaryPath === "generator") return { status: "OK", stdout: "7\n", stderr: "", runtimeMs: 1 };
      if (binaryPath === "brute") return { status: "OK", stdout: "49\n", stderr: "", runtimeMs: 2 };
      return { status: "RE", stdout: "partial", stderr: "segmentation fault", runtimeMs: 3 };
    }
  });
  const result = await runStress(options({ testCount: 3 }), fake.deps);

  assert.equal(result.type, "failure");
  assert.equal(result.program, "solution");
  assert.equal(result.verdict, "RE");
  assert.equal(result.found, true);
  assert.equal(result.expected, "49\n");
  assert.equal(result.actual, "partial");
  assert.equal(result.solution.stderr, "segmentation fault");
  assert.equal(result.timings.totalMs, 6);
});

test("performance mode ignores Brute source and compiles/runs only Generator + Solution", async () => {
  const prepared = prepareStressRequest({
    ...SOURCES,
    bruteCode: "x".repeat(1000),
    mode: "performance",
    seedMode: "fixed",
    seedStart: 90,
    testCount: 2
  }, SETTINGS, { maxCodeBytes: 20 });
  assert.equal(prepared.ok, true, "unused Brute must not block Performance Mode");

  const fake = makeFakeRunner();
  const result = await runStress(prepared.value, fake.deps);

  assert.equal(result.type, "done");
  assert.deepEqual(fake.state.compiles, ["generator", "solution"]);
  assert.deepEqual(fake.state.runs.map((r) => r.program), ["generator", "solution", "generator", "solution"]);
  assert.equal(fake.state.compares.length, 0);
  assert.deepEqual(fake.state.runs.filter((r) => r.program === "generator").map((r) => r.args), [
    ["90", "performance"], ["91", "performance"]
  ]);
  assert.deepEqual(result.performanceRuns.map((p) => [p.seed, p.timeMs]), [[90, 3], [91, 3]]);
  assert.deepEqual(result.performanceSummary, { averageMs: 3, maxMs: 3 });
  assert.deepEqual(fake.state.events.filter((e) => e.type === "test").map((e) => e.verdict), ["OK", "OK"]);
});

test("a later compile throw still cleans every workdir created earlier", async () => {
  const fake = makeFakeRunner({
    compileStandalone: async ({ code }, state) => {
      const program = programForCode(code);
      state.compiles.push(program);
      if (program === "brute") throw new Error("disk write failed");
      return { ok: true, binaryPath: program, workdir: `work-${program}`, timeMs: 1 };
    }
  });
  const result = await runStress(options(), fake.deps);

  assert.equal(result.type, "failure");
  assert.equal(result.stage, "internal");
  assert.equal(result.program, "brute");
  assert.match(result.error, /disk write failed/);
  assert.deepEqual(fake.state.compiles, ["generator", "brute"]);
  assert.deepEqual(fake.state.cleanups, ["work-generator"]);
});

test("compile CE stops before later compiles and cleans successful and failed build directories", async () => {
  const fake = makeFakeRunner({
    compileStandalone: async ({ code }, state) => {
      const program = programForCode(code);
      state.compiles.push(program);
      if (program === "brute") return { ok: false, workdir: "work-brute", stderr: "syntax error", timeMs: 9 };
      return { ok: true, binaryPath: program, workdir: `work-${program}`, timeMs: 1 };
    }
  });
  const result = await runStress(options(), fake.deps);

  assert.equal(result.type, "failure");
  assert.equal(result.stage, "compile");
  assert.equal(result.program, "brute");
  assert.equal(result.verdict, "CE");
  assert.match(result.error, /syntax error/);
  assert.deepEqual(fake.state.compiles, ["generator", "brute"]);
  assert.deepEqual(fake.state.cleanups.sort(), ["work-brute", "work-generator"]);
});

test("cancellation is observed between Brute and Solution and still cleans all binaries", async () => {
  let checks = 0;
  const fake = makeFakeRunner({ deps: {
    shouldStop: () => { checks += 1; return checks >= 6; }
  } });
  const result = await runStress(options({ testCount: 5 }), fake.deps);

  assert.equal(result.type, "cancelled");
  assert.equal(result.cancelled, true);
  assert.equal(result.stage, "after-brute");
  assert.equal(result.attempted, 1);
  assert.deepEqual(fake.state.runs.map((r) => r.program), ["generator", "brute"]);
  assert.equal(fake.state.cleanups.length, 3);
});

// ---- subtask plan (chế độ thi đấu — exam batches) --------------------------------

test("prepareStressRequest: a subtask plan sets testCount to the plan total and survives into options", () => {
  const parsed = prepareStressRequest({
    ...SOURCES, mode: "correctness", seedMode: "fixed", seedStart: 1,
    subtasks: [
      { id: 1, name: "Biên nhỏ", count: 10 },
      { id: 2, name: "Ngẫu nhiên lớn", count: 90 }
    ]
  }, SETTINGS);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.value.testCount, 100);
  assert.equal(parsed.value.subtasks.length, 2);
});

test("prepareStressRequest: duplicate subtask ids / oversize totals are rejected", () => {
  const dup = prepareStressRequest({
    ...SOURCES, subtasks: [{ id: 1, count: 5 }, { id: 1, count: 5 }]
  }, SETTINGS);
  assert.equal(dup.ok, false);
  const huge = prepareStressRequest({
    ...SOURCES, subtasks: [{ id: 1, count: 500 }, { id: 2, count: 500 }, { id: 3, count: 500 }]
  }, SETTINGS);
  assert.equal(huge.ok, false);
});

test("runStress: each test's generator receives argv[3] = its subtask id, and the done result carries perSubtask tallies", async () => {
  const opts = options({
    seedStart: 1,
    testCount: undefined,
    subtasks: [{ id: 1, name: "Biên", count: 2 }, { id: 3, name: "Lớn", count: 3 }]
  });
  const { deps, state } = makeFakeRunner();
  const result = await runStress(opts, deps);
  assert.equal(result.type, "done");

  const genRuns = state.runs.filter((r) => r.program === "generator");
  assert.deepEqual(genRuns.map((r) => r.args[2]), ["1", "1", "3", "3", "3"], "subtask id must ride argv[3] per block");

  assert.deepEqual(result.perSubtask, [
    { id: 1, name: "Biên", total: 2, ran: 2, passed: 2 },
    { id: 3, name: "Lớn", total: 3, ran: 3, passed: 3 }
  ]);
});

test("runStress: a WA inside a subtask block tags the failure with that subtask", async () => {
  const opts = options({
    seedStart: 1,
    testCount: undefined,
    subtasks: [{ id: 1, name: "Biên", count: 2 }, { id: 2, name: "Lớn", count: 2 }]
  });
  // Solution diverges from brute on the 3rd input (first test of subtask 2).
  const { deps } = makeFakeRunner({
    compareOutput: (expected, actual) => (String(actual).includes(":3") ? { ok: false, diff: { line: 1 } } : { ok: true })
  });
  const result = await runStress(opts, deps);
  assert.equal(result.type, "failure");
  assert.equal(result.verdict, "WA");
  assert.deepEqual(result.subtask, { id: 2, name: "Lớn" });
  assert.equal(result.perSubtask.find((s) => s.id === 1).passed, 2);
});
