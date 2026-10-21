"use strict";
const fs = require("node:fs"), os = require("node:os");
const fingerprint = require("./judgeFingerprint"), { getCompilerIdentity } = require("./compilerIdentity"), fileStore = require("./fileStore");
const engine = { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, concurrencyPolicy: "half-cores-max4-reconfirm-tle-v1", runner: fingerprint.hash(fs.readFileSync(require.resolve("./runCpp"), "utf8") + fs.readFileSync(require.resolve("./judgeService"), "utf8")) };
async function capture(id, { scope = "full", onlyTestId } = {}) {
  const store = require("./problemStore"), settingsStore = require("./settingsStore");
  const settings = await settingsStore.getSettings(), compiler = await getCompilerIdentity(settings);
  return fileStore.withLock(`problem:${id}`, async () => {
    const [meta, code, allTests] = await Promise.all([store.readMeta(id), store.getFile(id, "code"), store.listTests(id)]);
    let tests = allTests.filter(t => t.oracle.state === "trusted");
    if (!tests.length && !allTests.length || scope === "scratch") {
      const [input, expected] = await Promise.all([store.getFile(id, "input"), store.getFile(id, "expected")]);
      tests = input.trim() || expected.trim() ? [{ id: "main", name: "Scratch (Input/Expected)", input, expected, oracle: { state: "trusted", method: "user-provided" } }] : [];
    }
    const effective = fingerprint.effectiveSettings(settings, meta), fileMode = fingerprint.fileModeFor(meta), checker = meta.usesChecker ? await store.getFile(id, "checker") : null;
    const inputs = fingerprint.buildInputs({ code, tests, settings: effective, compiler, checker, fileMode, scope, engine });
    const problemFingerprint = fingerprint.fingerprint(inputs);
    if (onlyTestId) inputs.tests = inputs.tests.filter(t => t.id === onlyTestId);
    if (onlyTestId) inputs.scope = "single";
    return { meta, inputs, judgeFingerprint: fingerprint.fingerprint(inputs), problemFingerprint, code, tests: inputs.tests, settings: { ...effective, compilerPath: compiler.resolved || effective.compilerPath, _toolchainFingerprint: compiler.digest }, fileMode, checker, candidateCount: allTests.length - allTests.filter(t => t.oracle.state === "trusted").length };
  });
}
async function contract(id, { intent = "competitive", context } = {}) {
  const store = require("./problemStore"), evidence = require("./evidenceStore"), model = require("./verifiedArtifact");
  const current = context || await capture(id), history = await store.listHistory(id);
  for (const legacy of current.meta.history || []) {
    if (!history.some(h => legacy.id ? h.id === legacy.id : h.at === legacy.at && h.type === legacy.type)) history.push(legacy);
  }
  const judges = history.filter(h => model.isJudgeEntry(h) && !h.cancelled && h.scope !== "single");
  const ordered = model.judgeHistory(judges);
  const latest = ordered.find(h => h.judgeFingerprint === current.judgeFingerprint) || ordered[0] || null;
  const ref = latest?.id ? await evidence.referenceForHistoryEntry(id, latest) : null;
  return model.buildContract({ meta: current.meta, history: judges, detailedHistory: history, currentFingerprint: current.judgeFingerprint, fingerprintVerifiable: !current.inputs.compiler.unverifiable, evidence: ref, intent, candidateCount: current.candidateCount });
}
module.exports = { capture, contract };
