"use strict";
const crypto = require("node:crypto");
const { LIMITS } = require("./config");
const SCHEMA = "usaco.judge-inputs.v1";
const hash = value => crypto.createHash("sha256").update(String(value == null ? "" : value)).digest("hex");
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, stable(value[k])]));
  return value;
}
function fingerprint(value) { return hash(JSON.stringify(stable(value))); }
function effectiveSettings(settings, meta = {}) {
  return {
    compilerPath: String(settings.compilerPath || "g++"),
    cppStandard: String(settings.cppStandard || "c++17"),
    optimization: String(settings.optimization || "-O2"),
    timeMs: Math.min(Math.max(Number(meta.timeLimitMs) > 0 ? Number(meta.timeLimitMs) : Number(settings.timeMs) || 2000, 100), LIMITS.maxTimeMs),
    compareMode: ["strict", "token", "float"].includes(settings.compareMode) ? settings.compareMode : "loose",
    epsilon: Number(settings.epsilon) > 0 ? Number(settings.epsilon) : 1e-6,
    memoryLimitMB: Number(settings.memoryLimitMB) || 0,
  };
}
function fileModeFor(meta = {}) {
  if (!meta.usacoMode || !meta.fileName) return null;
  const name = String(meta.fileName).replace(/[^\w.\-]/g, "");
  return name ? { name } : null;
}
function buildInputs({ code = "", tests = [], checker = null, settings, compiler, fileMode = null, scope = "full", engine }) {
  const inputs = {
    schema: SCHEMA, scope,
    source: { code, sha256: hash(code) },
    // Exact bytes and execution order; labels/trust metadata cannot substitute for expected output.
    tests: tests.map(t => ({ id: t.id, name: t.name || "", input: String(t.input ?? ""), expected: String(t.expected ?? ""), oracle: t.oracle || { state: "trusted", method: "user-provided" } })),
    checker: checker ? { code: checker, sha256: hash(checker) } : null,
    comparator: { mode: settings.compareMode, epsilon: settings.epsilon },
    compiler: { ...compiler, standard: settings.cppStandard, optimization: settings.optimization, fixedFlags: ["-pipe"], implementation: "gcc-single-source-v1" },
    limits: { timeMs: settings.timeMs, compileMs: LIMITS.compileTimeoutMs, stdoutBytes: LIMITS.maxOutputBytes, stderrBytes: LIMITS.maxStderrBytes, checkerTimeMs: 10000, memoryLimitMB: settings.memoryLimitMB, memoryEnforced: false },
    fileMode, engine,
  };
  inputs.problemRevision = fingerprint({ source: inputs.source, tests: inputs.tests, checker: inputs.checker, fileMode: inputs.fileMode });
  return inputs;
}
module.exports = { SCHEMA, hash, fingerprint, stable, effectiveSettings, fileModeFor, buildInputs };
