"use strict";

const runCpp = require("./runCpp");

function compact(value, fallback) {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
  return (normalized || fallback).slice(0, 2400);
}

function runFailure(label, run) {
  const output = compact([run && run.stderr, run && run.stdout].filter(Boolean).join("\n"), "không có output");
  return `${label} thất bại (${run && run.status || "unknown"}): ${output}`;
}

function result(kind, outcome, durationMs, detail) {
  return { kind, outcome, durationMs: Math.max(0, Number(durationMs) || 0), detail: compact(detail, `${kind} không trả chi tiết.`) };
}

async function runUnitBinary(binaryPath, label, settings) {
  const run = await runCpp.runBinary({ binaryPath, input: "", timeMs: settings && settings.timeMs });
  const compared = run.status === "OK" ? runCpp.compareOutput("OK\n", run.stdout, "loose") : { ok: false };
  return {
    ok: run.status === "OK" && compared.ok,
    run,
    detail: run.status !== "OK"
      ? runFailure(label, run)
      : compared.ok
        ? `${label} pass và in OK.`
        : `${label} sai output: expected "OK", got ${JSON.stringify(compact(run.stdout, "(rỗng)"))}.`,
  };
}

async function runBenchmark(binaryPath, spec, settings) {
  const iterations = Math.min(Math.max(Number(spec.iterations) || 3, 1), 20);
  const runs = [];
  for (let index = 0; index < iterations; index += 1) {
    runs.push(await runCpp.runBinary({
      binaryPath,
      input: spec.input || "",
      timeMs: settings && settings.timeMs,
    }));
  }
  const failed = runs.find((run) => run.status !== "OK");
  const durationMs = runs.reduce((sum, run) => sum + (run.runtimeMs || 0), 0);
  if (failed) return result("benchmark", "fail", durationMs, runFailure("Benchmark", failed));
  const average = durationMs / iterations;
  const limit = Math.max(Number(spec.maxAverageMs) || 2000, 1);
  return average <= limit
    ? result("benchmark", "pass", durationMs, `Benchmark ${iterations} lượt pass; trung bình ${average.toFixed(1)}ms (ngưỡng ${limit}ms).`)
    : result("benchmark", "fail", durationMs, `Benchmark quá chậm: trung bình ${average.toFixed(1)}ms, ngưỡng ${limit}ms.`);
}

async function runSimulation(spec, settings) {
  let built;
  try {
    built = await runCpp.compileProject({ files: spec.files, settings });
    if (!built.ok) {
      return result("simulation", "fail", built.timeMs, `Simulation không biên dịch được: ${compact(built.stderr, "g++ không trả chi tiết.")}`);
    }
    const details = [];
    let durationMs = built.timeMs || 0;
    for (const testCase of spec.cases || []) {
      const run = await runCpp.runBinary({ binaryPath: built.binaryPath, input: testCase.input, timeMs: settings && settings.timeMs });
      durationMs += run.runtimeMs || 0;
      if (run.status !== "OK") return result("simulation", "fail", durationMs, runFailure(`Simulation case "${testCase.name}"`, run));
      const checked = spec.validate(testCase, run.stdout);
      details.push(checked.detail);
      if (!checked.ok) return result("simulation", "fail", durationMs, checked.detail);
    }
    return result("simulation", "pass", durationMs, `Simulation pass ${(spec.cases || []).length} case: ${details.join(" ")}`);
  } finally {
    if (built) await runCpp.cleanupWorkdir(built.workdir);
  }
}

async function runProjectVerifiers({ plan, settings }) {
  let publicBuild;
  let hiddenBuild;
  const evidence = [];
  try {
    publicBuild = await runCpp.compileProject({ files: plan.publicFiles, settings });
    if (publicBuild.ok) hiddenBuild = await runCpp.compileStandalone({ code: plan.hiddenCode, settings });
    const compileDuration = (publicBuild.timeMs || 0) + (hiddenBuild && hiddenBuild.timeMs || 0);
    if (!publicBuild.ok) {
      evidence.push(result("compile", "fail", compileDuration, `Multi-file compile thất bại: ${compact(publicBuild.stderr, "g++ không trả chi tiết.")}`));
      return evidence;
    }
    if (!hiddenBuild.ok) {
      evidence.push(result("compile", "fail", compileDuration, `Hidden verifier compile thất bại: ${compact(hiddenBuild.stderr, "g++ không trả chi tiết.")}`));
      return evidence;
    }
    evidence.push(result("compile", "pass", compileDuration, `Biên dịch multi-file thành công (${publicBuild.fileCount} file, public + hidden verifier).`));

    const publicUnit = await runUnitBinary(publicBuild.binaryPath, "Public unit test", settings);
    const hiddenUnit = await runUnitBinary(hiddenBuild.binaryPath, "Hidden unit test", settings);
    const unitDuration = (publicUnit.run.runtimeMs || 0) + (hiddenUnit.run.runtimeMs || 0);
    const unitOk = publicUnit.ok && hiddenUnit.ok;
    evidence.push(result(
      "unit-test",
      unitOk ? "pass" : "fail",
      unitDuration,
      unitOk ? `${publicUnit.detail} ${hiddenUnit.detail}` : [publicUnit, hiddenUnit].find((item) => !item.ok).detail,
    ));

    if (unitOk && plan.benchmark) evidence.push(await runBenchmark(publicBuild.binaryPath, plan.benchmark, settings));
    if (plan.simulation) evidence.push(await runSimulation(plan.simulation, settings));
    return evidence;
  } finally {
    if (publicBuild) await runCpp.cleanupWorkdir(publicBuild.workdir);
    if (hiddenBuild) await runCpp.cleanupWorkdir(hiddenBuild.workdir);
  }
}

module.exports = { runProjectVerifiers };
