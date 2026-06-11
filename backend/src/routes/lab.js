"use strict";

// lab.js — heavy CP power-tools that drive the g++ judge in a loop:
//   • Stress Tester       POST /api/problems/:id/stress
//       Compiles a generator + a brute/reference + the user's solution, then
//       runs many random cases comparing main vs brute, returning the SMALLEST
//       (first) failing input it finds. The classic "find my bug" tool.
//   • Complexity Profiler POST /api/problems/:id/profile
//       Runs the solution on generated inputs of growing N, measures runtime,
//       and fits a log-log slope to estimate the empirical Big-O.
//
// Both reuse runCpp.compileStandalone / runBinary. Generators receive a single
// argv: the seed (stress) or the size N (profile).

const express = require("express");
const problemStore = require("../problemStore");
const settingsStore = require("../settingsStore");
const runCpp = require("../runCpp");
const { asyncHandler, requireProblem } = require("./_util");

const router = express.Router();

const COMPILER_MISSING = "Không tìm thấy g++. Cài MinGW/g++ hoặc cấu hình compiler trong Settings.";

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(n, lo), hi);
}

// Compile a labelled program; returns {ok, binaryPath, workdir, stderr, compilerMissing}.
async function build(label, code, settings) {
  const r = await runCpp.compileStandalone({ code: code || "", settings });
  return { label, ...r };
}

// ---------------------------------------------------------------------------
// Stress Tester
// ---------------------------------------------------------------------------
router.post("/:id/stress", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const body = req.body || {};

  const genCode = String(body.genCode || "");
  const bruteCode = String(body.bruteCode || "");
  let mainCode = typeof body.mainCode === "string" ? body.mainCode : null;
  if (mainCode == null) mainCode = await problemStore.getFile(id, "code");

  if (!genCode.trim()) return res.status(400).json({ ok: false, error: "Thiếu code Generator." });
  if (!bruteCode.trim()) return res.status(400).json({ ok: false, error: "Thiếu code Brute-force / reference." });

  const iterations = clampInt(body.iterations, 1, 1000, 100);
  const timeMs = clampInt(body.timeMs, 100, 10000, settings.timeMs || 2000);
  const BUDGET_MS = 30000; // overall wall-clock cap so a slow brute can't hang the server
  const startedAt = Date.now();

  const builds = [];
  try {
    const gen = await build("generator", genCode, settings);
    const brute = await build("brute", bruteCode, settings);
    const main = await build("main", mainCode, settings);
    builds.push(gen, brute, main);

    for (const b of builds) {
      if (b.compilerMissing) return res.json({ ok: false, compilerMissing: true, error: COMPILER_MISSING });
      if (!b.ok) return res.json({ ok: false, stage: "compile", which: b.label, error: `Lỗi biên dịch ${b.label}`, stderr: b.stderr });
    }

    let ran = 0;
    for (let seed = 1; seed <= iterations; seed++) {
      if (Date.now() - startedAt > BUDGET_MS) {
        return res.json({ ok: true, found: false, ran, budgetHit: true });
      }
      ran = seed;
      const g = await runCpp.runBinary({ binaryPath: gen.binaryPath, input: "", timeMs, args: [String(seed)] });
      if (g.status !== "OK") {
        return res.json({ ok: false, stage: "generator", error: `Generator lỗi ở seed ${seed} (${g.status}).`, stderr: g.stderr });
      }
      const input = g.stdout;

      const m = await runCpp.runBinary({ binaryPath: main.binaryPath, input, timeMs });
      const b = await runCpp.runBinary({ binaryPath: brute.binaryPath, input, timeMs });

      // Main crashed/timed out → that itself is a failing case worth surfacing.
      if (m.status !== "OK") {
        return res.json({ ok: true, found: true, seed, iteration: seed, kind: m.status,
          input, expected: b.status === "OK" ? b.stdout : "", got: m.stdout, mainStderr: m.stderr });
      }
      if (b.status !== "OK") {
        return res.json({ ok: false, stage: "brute", error: `Brute lỗi ở seed ${seed} (${b.status}). Brute quá chậm? Giảm kích thước generator.`, stderr: b.stderr });
      }
      const cmp = runCpp.compareOutput(b.stdout, m.stdout, settings.compareMode, { epsilon: settings.epsilon });
      if (!cmp.ok) {
        return res.json({ ok: true, found: true, seed, iteration: seed, kind: "WA",
          input, expected: b.stdout, got: m.stdout, diff: cmp.diff });
      }
    }
    return res.json({ ok: true, found: false, ran });
  } finally {
    await Promise.all(builds.map((b) => runCpp.cleanupWorkdir(b.workdir)));
  }
}));

// ---------------------------------------------------------------------------
// Complexity Profiler
// ---------------------------------------------------------------------------

// Least-squares slope of log(time) vs log(n) → mapped to a Big-O label.
function estimateComplexity(points) {
  const pts = points.filter((p) => p.status === "OK" && p.timeMs >= 1 && p.n > 0);
  if (pts.length < 3) return { label: "?", slope: null, note: "Cần ít nhất 3 mốc đo hợp lệ (tăng kích thước / time limit)." };
  const xs = pts.map((p) => Math.log(p.n));
  const ys = pts.map((p) => Math.log(p.timeMs));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  let label;
  if (slope < 0.35) label = "O(1) / O(log n)";
  else if (slope < 1.15) label = "O(n)";
  else if (slope < 1.45) label = "O(n log n)";
  else if (slope < 1.8) label = "O(n·√n)";
  else if (slope < 2.4) label = "O(n²)";
  else if (slope < 3.4) label = "O(n³)";
  else label = `O(n^${slope.toFixed(1)})`;
  return { label, slope: Number(slope.toFixed(2)), note: "Ước lượng theo độ dốc log-log; chỉ mang tính tham khảo." };
}

router.post("/:id/profile", requireProblem, asyncHandler(async (req, res) => {
  const id = req.problemId;
  const settings = await settingsStore.getSettings();
  const body = req.body || {};

  const genCode = String(body.genCode || "");
  let mainCode = typeof body.mainCode === "string" ? body.mainCode : null;
  if (mainCode == null) mainCode = await problemStore.getFile(id, "code");
  if (!genCode.trim()) return res.status(400).json({ ok: false, error: "Thiếu code Generator (đọc N = argv[1])." });

  let sizes = Array.isArray(body.sizes) ? body.sizes.map((s) => clampInt(s, 1, 5_000_000, 0)).filter(Boolean) : [];
  if (sizes.length === 0) sizes = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000];
  sizes = [...new Set(sizes)].sort((a, b) => a - b).slice(0, 12);

  const timeMs = clampInt(body.timeMs, 100, 10000, Math.max(settings.timeMs || 2000, 4000));
  const BUDGET_MS = 35000;
  const startedAt = Date.now();

  const builds = [];
  try {
    const gen = await build("generator", genCode, settings);
    const main = await build("main", mainCode, settings);
    builds.push(gen, main);
    for (const b of builds) {
      if (b.compilerMissing) return res.json({ ok: false, compilerMissing: true, error: COMPILER_MISSING });
      if (!b.ok) return res.json({ ok: false, stage: "compile", which: b.label, error: `Lỗi biên dịch ${b.label}`, stderr: b.stderr });
    }

    // Warm-up + overhead baseline. The first spawn after compile is slow, and
    // every run carries a fixed process/IO cost that flattens the log-log slope.
    // Run main on a near-empty input (gen with arg "1") to measure that floor,
    // then subtract it from each timing so the fit sees compute time only.
    let baseline = 0;
    {
      const gw = await runCpp.runBinary({ binaryPath: gen.binaryPath, input: "", timeMs, args: ["1"] });
      if (gw.status === "OK") {
        await runCpp.runBinary({ binaryPath: main.binaryPath, input: gw.stdout, timeMs }); // discard (cold)
        let b = Infinity;
        for (let r = 0; r < 2; r++) {
          const m = await runCpp.runBinary({ binaryPath: main.binaryPath, input: gw.stdout, timeMs });
          if (m.status === "OK") b = Math.min(b, m.runtimeMs);
        }
        if (Number.isFinite(b)) baseline = b;
      }
    }

    const points = [];
    for (const nSize of sizes) {
      if (Date.now() - startedAt > BUDGET_MS) break;
      const g = await runCpp.runBinary({ binaryPath: gen.binaryPath, input: "", timeMs, args: [String(nSize)] });
      if (g.status !== "OK") { points.push({ n: nSize, timeMs: 0, status: "GEN_" + g.status }); break; }
      // Run twice, keep the MIN runtime — minimum is the least-noisy estimate of
      // true compute time (scheduler hiccups/IO only ever add time).
      let best = Infinity, status = "OK";
      for (let r = 0; r < 2; r++) {
        const m = await runCpp.runBinary({ binaryPath: main.binaryPath, input: g.stdout, timeMs });
        status = m.status;
        if (m.status === "OK") best = Math.min(best, m.runtimeMs);
        else break;
      }
      // `timeMs` = raw wall time (shown on the chart). `compute` = overhead-
      // subtracted time used for the Big-O fit.
      const raw = status === "OK" ? Math.round(best) : 0;
      points.push({ n: nSize, timeMs: raw, compute: status === "OK" ? Math.max(1, Math.round(best - baseline)) : 0, status });
      if (status === "TLE") break; // no point going larger
    }
    const estimate = estimateComplexity(points.map((p) => ({ n: p.n, timeMs: p.compute, status: p.status })));
    estimate.baselineMs = Math.round(baseline);
    // If even the compute-only signal is tiny, the estimate is unreliable.
    const okCompute = points.filter((p) => p.status === "OK").map((p) => p.compute);
    if (okCompute.length && Math.max(...okCompute) < 8) {
      estimate.note = "Thời gian tính toán quá nhỏ so với chi phí khởi động — tăng kích thước N để ước lượng chính xác hơn.";
      estimate.label = estimate.label + " (?)";
    }
    return res.json({ ok: true, points, estimate });
  } finally {
    await Promise.all(builds.map((b) => runCpp.cleanupWorkdir(b.workdir)));
  }
}));

module.exports = router;
