"use strict";

// Stress Test v2 core. This module deliberately knows nothing about Express,
// problemStore, or SSE. Compile/run/compare/cleanup are injected so the state
// machine can be tested without g++ and reused by buffered or streaming routes.
//
// Generator argv contract:
//   argv[1] = the exact seed for this test
//   argv[2] = "correctness" | "performance"
//   argv[3] = subtask id (ONLY when the request carries a `subtasks` plan —
//             the contest-realistic "exam" batches; absent otherwise, which is
//             backwards-compatible with every existing generator)
// A correctness generator should keep inputs small enough for Brute. A
// performance generator should branch on argv[2] and emit a near-constraint
// input. Extra argv values are backwards-compatible with existing generators.

const crypto = require("crypto");
const { LIMITS } = require("./config");

const RUNNER_ISOLATION = "local-process";
const MODES = new Set(["correctness", "performance"]);
const SEED_MODES = new Set(["fixed", "random"]);
const COMPARE_MODES = new Set(["loose", "strict", "token", "float"]);
const MAX_TESTS = 1000;
const MAX_SEED = 1_000_000_000;
const DEFAULT_BUDGET_MS = 30_000;
const MAX_BUDGET_MS = 300_000;

function clampInt(value, lo, hi, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, lo), hi);
}

function sourceFrom(body, primary, legacy) {
  if (typeof body[primary] === "string") return body[primary];
  if (legacy && typeof body[legacy] === "string") return body[legacy];
  return "";
}

function invalid(error, field, details) {
  return { ok: false, status: 400, error, field, ...(details ? { details } : {}) };
}

function validateSource(label, field, code, maxCodeBytes) {
  if (!code.trim()) return invalid(`Thiếu code ${label}.`, field);
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > maxCodeBytes) {
    return invalid(
      `${label} vượt giới hạn ${maxCodeBytes} bytes.`,
      field,
      { bytes, maxCodeBytes }
    );
  }
  return null;
}

/**
 * Parse and validate the v2 request. `seedStart` is always the exact first
 * seed, not a hidden base offset. Replaying seed S means seedStart=S,
 * testCount=1; continuing means seedStart=S+1.
 */
function prepareStressRequest(body = {}, settings = {}, deps = {}) {
  const mode = body.mode == null ? "correctness" : String(body.mode).trim().toLowerCase();
  if (!MODES.has(mode)) return invalid("mode phải là correctness hoặc performance.", "mode");

  const generatorCode = sourceFrom(body, "generatorCode", "genCode");
  const bruteCode = sourceFrom(body, "bruteCode");
  const solutionCode = sourceFrom(body, "solutionCode", "mainCode");
  const maxCodeBytes = Number(deps.maxCodeBytes) > 0 ? Number(deps.maxCodeBytes) : LIMITS.maxCodeBytes;

  const sourceError = validateSource("Generator", "generatorCode", generatorCode, maxCodeBytes)
    || validateSource("Solution", "solutionCode", solutionCode, maxCodeBytes)
    || (mode === "correctness" ? validateSource("Brute Force", "bruteCode", bruteCode, maxCodeBytes) : null);
  if (sourceError) return sourceError;

  // Optional subtask plan (contest-realistic batches). When present, the run
  // walks each subtask's block of seeds in order and the generator receives
  // the subtask id as argv[3]; testCount becomes the plan's total.
  let subtasks = null;
  if (body.subtasks != null) {
    if (!Array.isArray(body.subtasks) || body.subtasks.length === 0 || body.subtasks.length > 12) {
      return invalid("subtasks phải là mảng 1-12 phần tử.", "subtasks");
    }
    const ids = new Set();
    subtasks = [];
    for (const s of body.subtasks) {
      const id = Math.round(Number(s && s.id));
      if (!Number.isInteger(id) || id < 1 || id > 99) return invalid("subtask id phải là số nguyên 1-99.", "subtasks");
      if (ids.has(id)) return invalid(`subtask id ${id} bị trùng.`, "subtasks");
      ids.add(id);
      const count = clampInt(s && s.count, 1, 500, 0);
      if (!count) return invalid(`subtask ${id} cần count từ 1-500.`, "subtasks");
      subtasks.push({ id, name: String((s && s.name) || `Subtask ${id}`).slice(0, 80), count });
    }
    const total = subtasks.reduce((a, s) => a + s.count, 0);
    if (total > MAX_TESTS) return invalid(`Tổng số test của các subtask (${total}) vượt trần ${MAX_TESTS}.`, "subtasks");
  }

  const testCount = subtasks
    ? subtasks.reduce((a, s) => a + s.count, 0)
    : clampInt(body.testCount != null ? body.testCount : body.iterations, 1, MAX_TESTS, 100);
  const timeMs = clampInt(body.timeMs, 100, LIMITS.maxTimeMs, Number(settings.timeMs) || 2000);
  const budgetMs = clampInt(body.budgetMs, 1000, MAX_BUDGET_MS, DEFAULT_BUDGET_MS);

  const requestedCompareMode = body.compareMode == null ? (settings.compareMode || "loose") : body.compareMode;
  const compareMode = String(requestedCompareMode).trim().toLowerCase();
  if (!COMPARE_MODES.has(compareMode)) {
    return invalid("compareMode phải là loose, strict, token hoặc float.", "compareMode");
  }
  const epsilonRaw = body.epsilon == null ? settings.epsilon : body.epsilon;
  const epsilon = Number(epsilonRaw) > 0 ? Number(epsilonRaw) : 1e-6;

  const hasSeedStart = body.seedStart !== undefined && body.seedStart !== null && body.seedStart !== "";
  const seedMode = body.seedMode == null
    ? (hasSeedStart ? "fixed" : "random")
    : String(body.seedMode).trim().toLowerCase();
  if (!SEED_MODES.has(seedMode)) return invalid("seedMode phải là fixed hoặc random.", "seedMode");

  const maxStart = MAX_SEED - testCount + 1;
  let seedStart;
  if (seedMode === "fixed") {
    const n = Number(body.seedStart);
    if (!Number.isInteger(n) || n < 0 || n > maxStart) {
      return invalid(`seedStart phải là số nguyên trong [0, ${maxStart}].`, "seedStart");
    }
    seedStart = n;
  } else {
    const randomSeed = typeof deps.randomSeed === "function"
      ? deps.randomSeed
      : (maxInclusive) => crypto.randomInt(0, maxInclusive + 1);
    seedStart = Number(randomSeed(maxStart));
    if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > maxStart) {
      return invalid("Bộ sinh seed trả về giá trị không hợp lệ.", "seedStart");
    }
  }

  return {
    ok: true,
    value: {
      mode,
      generatorCode,
      bruteCode: mode === "correctness" ? bruteCode : "",
      solutionCode,
      testCount,
      timeMs,
      budgetMs,
      compareMode,
      epsilon,
      seedMode,
      seedStart,
      subtasks,
      runnerIsolation: RUNNER_ISOLATION
    }
  };
}

/** Map a 1-based test index onto its subtask (contiguous blocks in plan
 *  order), or null when the run has no subtask plan. */
function subtaskForIndex(subtasks, index) {
  if (!Array.isArray(subtasks) || !subtasks.length) return null;
  let upto = 0;
  for (const s of subtasks) {
    upto += s.count;
    if (index <= upto) return s;
  }
  return subtasks[subtasks.length - 1];
}

function asRunRecord(run) {
  const r = run && typeof run === "object" ? run : {};
  return {
    status: typeof r.status === "string" ? r.status : "RE",
    stdout: r.stdout == null ? "" : String(r.stdout),
    stderr: r.stderr == null ? "" : String(r.stderr),
    timeMs: Number.isFinite(Number(r.runtimeMs)) ? Number(r.runtimeMs) : 0
  };
}

function testTimings(generator, brute, solution) {
  const generatorMs = generator ? generator.timeMs : 0;
  const bruteMs = brute ? brute.timeMs : 0;
  const solutionMs = solution ? solution.timeMs : 0;
  return {
    generatorMs,
    bruteMs,
    solutionMs,
    totalMs: generatorMs + bruteMs + solutionMs
  };
}

function baseResult(options, attempted, startedAt, now, compileTimings) {
  const seedEnd = attempted > 0 ? options.seedStart + attempted - 1 : null;
  return {
    mode: options.mode,
    seedMode: options.seedMode,
    seedStart: options.seedStart,
    seedEnd,
    nextSeed: options.seedStart + attempted,
    testCount: options.testCount,
    attempted,
    compareMode: options.compareMode,
    epsilon: options.epsilon,
    timeMs: options.timeMs,
    compileTimings: { ...compileTimings },
    elapsedMs: Math.max(0, now() - startedAt),
    runnerIsolation: RUNNER_ISOLATION
  };
}

function cancelledResult(options, attempted, index, seed, stage, startedAt, now, compileTimings) {
  return {
    type: "cancelled",
    ok: false,
    cancelled: true,
    found: false,
    index,
    seed,
    stage,
    ...baseResult(options, attempted, startedAt, now, compileTimings)
  };
}

function failureResult({
  options, attempted, index, seed, stage, program, verdict, input,
  generator, brute, solution, diff, compilerMissing, error,
  startedAt, now, compileTimings, performanceRuns
}) {
  const timings = testTimings(generator, brute, solution);
  return {
    type: "failure",
    ok: false,
    found: program === "solution" || stage === "compare",
    stage,
    program,
    verdict,
    index,
    seed,
    input: input == null ? "" : String(input),
    expected: brute ? brute.stdout : "",
    actual: solution ? solution.stdout : "",
    generator: generator || null,
    brute: brute || null,
    solution: solution || null,
    diff: diff || null,
    timings,
    compilerMissing: compilerMissing || undefined,
    error: error || undefined,
    performanceRuns: performanceRuns || undefined,
    ...baseResult(options, attempted, startedAt, now, compileTimings)
  };
}

function safeStop(shouldStop) {
  try { return Boolean(shouldStop()); } catch { return true; }
}

async function runStress(options, deps = {}) {
  const compileStandalone = deps.compileStandalone;
  const runBinary = deps.runBinary;
  const cleanupWorkdir = deps.cleanupWorkdir;
  const compareOutput = deps.compareOutput;
  const onEvent = typeof deps.onEvent === "function" ? deps.onEvent : () => {};
  const shouldStop = typeof deps.shouldStop === "function" ? deps.shouldStop : () => false;
  const now = typeof deps.now === "function" ? deps.now : () => Date.now();
  const startedAt = now();
  const builds = [];
  const binaries = {};
  const compileTimings = {};
  const performanceRuns = [];
  let attempted = 0;
  let activeIndex = null;
  let activeSeed = null;
  let activeStage = "compile";

  const emit = (frame) => {
    try { onEvent(frame); } catch { /* UI/stream callbacks must not break the run */ }
  };

  const internalFailure = (error, program) => failureResult({
    options,
    attempted,
    index: activeIndex,
    seed: activeSeed,
    stage: "internal",
    program: program || activeStage || "engine",
    verdict: "RE",
    input: "",
    error: error && error.message ? error.message : String(error || "Internal Stress error"),
    startedAt,
    now,
    compileTimings,
    performanceRuns
  });

  try {
    if (typeof compileStandalone !== "function" || typeof runBinary !== "function"
      || typeof cleanupWorkdir !== "function" || typeof compareOutput !== "function") {
      return internalFailure(new Error("Stress runner dependencies are incomplete."), "engine");
    }

    emit({
      type: "start",
      mode: options.mode,
      seedMode: options.seedMode,
      seedStart: options.seedStart,
      testCount: options.testCount,
      timeMs: options.timeMs,
      budgetMs: options.budgetMs,
      compareMode: options.compareMode,
      epsilon: options.epsilon,
      subtasks: options.subtasks || undefined,
      runnerIsolation: RUNNER_ISOLATION
    });

    // Per-subtask tallies for the contest-realistic scoreboard.
    const perSubtask = Array.isArray(options.subtasks)
      ? options.subtasks.map((s) => ({ id: s.id, name: s.name, total: s.count, ran: 0, passed: 0 }))
      : null;
    const tallyFor = (st) => (perSubtask && st ? perSubtask.find((x) => x.id === st.id) : null);

    const programs = [
      ["generator", options.generatorCode],
      ...(options.mode === "correctness" ? [["brute", options.bruteCode]] : []),
      ["solution", options.solutionCode]
    ];

    for (const [program, code] of programs) {
      activeStage = "compile";
      if (safeStop(shouldStop)) {
        return cancelledResult(options, attempted, null, null, "compile", startedAt, now, compileTimings);
      }

      let built;
      try {
        built = await compileStandalone({ code, settings: deps.settings });
      } catch (error) {
        return internalFailure(error, program);
      }
      // Register each workdir immediately. A later compile may throw, but every
      // already-created directory will still be cleaned by the finally block.
      if (built && built.workdir) builds.push(built);
      binaries[program] = built || {};
      compileTimings[program] = Number(built && built.timeMs) || 0;

      const compileOk = Boolean(built && built.ok && !built.compilerMissing);
      emit({
        type: "compile",
        program,
        status: compileOk ? "OK" : "CE",
        timeMs: compileTimings[program],
        stderr: built && built.stderr ? String(built.stderr) : "",
        cached: Boolean(built && built.cached),
        compilerMissing: Boolean(built && built.compilerMissing)
      });

      if (!compileOk) {
        return failureResult({
          options,
          attempted,
          index: null,
          seed: null,
          stage: "compile",
          program,
          verdict: "CE",
          input: "",
          compilerMissing: Boolean(built && built.compilerMissing),
          error: built && built.stderr ? String(built.stderr) : `Không biên dịch được ${program}.`,
          startedAt,
          now,
          compileTimings,
          performanceRuns
        });
      }
    }

    for (let index = 1; index <= options.testCount; index += 1) {
      const seed = options.seedStart + index - 1;
      const subtask = subtaskForIndex(options.subtasks, index);
      const subtaskInfo = subtask ? { id: subtask.id, name: subtask.name } : undefined;
      activeIndex = index;
      activeSeed = seed;
      activeStage = "generator";

      if (safeStop(shouldStop)) {
        return cancelledResult(options, attempted, index, seed, "before-test", startedAt, now, compileTimings);
      }
      if (now() - startedAt >= options.budgetMs) {
        const times = performanceRuns.map((p) => p.timeMs);
        return {
          type: "done",
          ok: true,
          found: false,
          budgetHit: true,
          perSubtask: perSubtask || undefined,
          performanceRuns: options.mode === "performance" ? performanceRuns : undefined,
          performanceSummary: options.mode === "performance" ? {
            averageMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
            maxMs: times.length ? Math.max(...times) : 0
          } : undefined,
          ...baseResult(options, attempted, startedAt, now, compileTimings)
        };
      }

      attempted = index;
      const tally = tallyFor(subtask);
      if (tally) tally.ran += 1;
      let generator;
      try {
        generator = asRunRecord(await runBinary({
          binaryPath: binaries.generator.binaryPath,
          input: "",
          timeMs: options.timeMs,
          args: [String(seed), options.mode, ...(subtask ? [String(subtask.id)] : [])]
        }));
      } catch (error) {
        generator = asRunRecord({ status: "RE", stderr: error && error.message, runtimeMs: 0 });
      }
      const input = generator.stdout;
      if (generator.status !== "OK") {
        return {
          subtask: subtaskInfo, perSubtask: perSubtask || undefined,
          ...failureResult({
            options, attempted, index, seed, stage: "run", program: "generator",
            verdict: generator.status, input, generator,
            startedAt, now, compileTimings, performanceRuns
          })
        };
      }

      if (safeStop(shouldStop)) {
        return cancelledResult(options, attempted, index, seed, "after-generator", startedAt, now, compileTimings);
      }

      let brute = null;
      if (options.mode === "correctness") {
        activeStage = "brute";
        try {
          brute = asRunRecord(await runBinary({
            binaryPath: binaries.brute.binaryPath,
            input,
            timeMs: options.timeMs
          }));
        } catch (error) {
          brute = asRunRecord({ status: "RE", stderr: error && error.message, runtimeMs: 0 });
        }
        if (brute.status !== "OK") {
          return {
            subtask: subtaskInfo, perSubtask: perSubtask || undefined,
            ...failureResult({
              options, attempted, index, seed, stage: "run", program: "brute",
              verdict: brute.status, input, generator, brute,
              startedAt, now, compileTimings, performanceRuns
            })
          };
        }
        if (safeStop(shouldStop)) {
          return cancelledResult(options, attempted, index, seed, "after-brute", startedAt, now, compileTimings);
        }
      }

      activeStage = "solution";
      let solution;
      try {
        solution = asRunRecord(await runBinary({
          binaryPath: binaries.solution.binaryPath,
          input,
          timeMs: options.timeMs
        }));
      } catch (error) {
        solution = asRunRecord({ status: "RE", stderr: error && error.message, runtimeMs: 0 });
      }

      if (solution.status !== "OK") {
        return {
          subtask: subtaskInfo, perSubtask: perSubtask || undefined,
          ...failureResult({
            options, attempted, index, seed, stage: "run", program: "solution",
            verdict: solution.status, input, generator, brute, solution,
            startedAt, now, compileTimings, performanceRuns
          })
        };
      }

      const timings = testTimings(generator, brute, solution);
      if (options.mode === "correctness") {
        activeStage = "compare";
        let comparison;
        try {
          comparison = compareOutput(brute.stdout, solution.stdout, options.compareMode, { epsilon: options.epsilon });
        } catch (error) {
          return internalFailure(error, "compare");
        }
        if (!comparison || !comparison.ok) {
          return {
            subtask: subtaskInfo, perSubtask: perSubtask || undefined,
            ...failureResult({
              options, attempted, index, seed, stage: "compare", program: "solution",
              verdict: "WA", input, generator, brute, solution,
              diff: comparison && comparison.diff,
              startedAt, now, compileTimings, performanceRuns
            })
          };
        }
        if (tally) tally.passed += 1;
        emit({ type: "test", index, seed, verdict: "AC", timings, subtask: subtaskInfo });
      } else {
        if (tally) tally.passed += 1;
        performanceRuns.push({ index, seed, timeMs: solution.timeMs, timings });
        emit({ type: "test", index, seed, verdict: "OK", timings, subtask: subtaskInfo });
      }
    }

    const times = performanceRuns.map((p) => p.timeMs);
    return {
      type: "done",
      ok: true,
      found: false,
      budgetHit: false,
      perSubtask: perSubtask || undefined,
      performanceRuns: options.mode === "performance" ? performanceRuns : undefined,
      performanceSummary: options.mode === "performance" ? {
        averageMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        maxMs: times.length ? Math.max(...times) : 0
      } : undefined,
      ...baseResult(options, attempted, startedAt, now, compileTimings)
    };
  } catch (error) {
    return internalFailure(error, activeStage);
  } finally {
    await Promise.allSettled(builds.map((built) => cleanupWorkdir(built.workdir)));
  }
}

module.exports = {
  RUNNER_ISOLATION,
  MAX_TESTS,
  MAX_SEED,
  prepareStressRequest,
  subtaskForIndex,
  runStress
};
