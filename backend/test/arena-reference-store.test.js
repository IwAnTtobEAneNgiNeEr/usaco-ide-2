"use strict";

// Tests for arena/referenceStore.js — the Kho Tham Chiếu (S1). Pure trust
// logic (evaluateTrust) plus a real read/write/clear round trip against a
// throwaway zz-* problem, same convention as problem-store.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");

const referenceStore = require("../src/arena/referenceStore");
const problemStore = require("../src/problemStore");

async function withProblem(run) {
  const meta = await problemStore.createProblem({ title: "zz-arena-vault-test" });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
}

// ---- evaluateTrust (pure) ---------------------------------------------------

test("evaluateTrust: absent reference is never usable", () => {
  const t = referenceStore.evaluateTrust(referenceStore.defaultMeta(), "h1");
  assert.equal(t.usable, false);
  assert.equal(t.reason, "absent");
});

test("evaluateTrust: present but untrusted is not usable", () => {
  const meta = referenceStore.defaultMeta();
  meta.statementHash = "h1";
  meta.reference = { present: true, source: "ai-brute", trusted: false, samplesChecked: 0, verifiedAt: "" };
  const t = referenceStore.evaluateTrust(meta, "h1");
  assert.equal(t.usable, false);
  assert.equal(t.reason, "untrusted");
});

test("evaluateTrust: statement changed since save → stale, even if it was trusted", () => {
  const meta = referenceStore.defaultMeta();
  meta.statementHash = "h1";
  meta.reference = { present: true, source: "ai-brute", trusted: true, samplesChecked: 2, verifiedAt: "" };
  const t = referenceStore.evaluateTrust(meta, "h2-different");
  assert.equal(t.usable, false);
  assert.equal(t.reason, "stale-statement");
});

test("evaluateTrust: present + trusted + same statement → usable", () => {
  const meta = referenceStore.defaultMeta();
  meta.statementHash = "h1";
  meta.reference = { present: true, source: "manual", trusted: true, samplesChecked: 1, verifiedAt: "" };
  const t = referenceStore.evaluateTrust(meta, "h1");
  assert.equal(t.usable, true);
});

test("normalizeMeta heals a partial/old file instead of crashing", () => {
  const healed = referenceStore.normalizeMeta({ statementHash: "h1" });
  assert.equal(healed.reference.present, false);
  assert.equal(healed.generator.present, false);
  assert.equal(healed.gauntlet.lastResult, null);
});

// ---- read/write round trip (real fs, throwaway problem) --------------------

test("setReference persists code + trust metadata together; readMeta reflects it", async () => {
  await withProblem(async (id) => {
    const before = await referenceStore.readMeta(id);
    assert.equal(before.reference.present, false);

    const after = await referenceStore.setReference(id, "int main(){}", {
      source: "manual", trusted: true, samplesChecked: 3, statementHash: "abc",
    });
    assert.equal(after.reference.present, true);
    assert.equal(after.reference.source, "manual");
    assert.equal(after.reference.trusted, true);
    assert.equal(after.reference.samplesChecked, 3);
    assert.equal(after.statementHash, "abc");

    const code = await referenceStore.getReferenceCode(id);
    assert.equal(code, "int main(){}");

    const cleared = await referenceStore.clearReference(id);
    assert.equal(cleared.reference.present, false);
    assert.equal(await referenceStore.getReferenceCode(id), "");
  });
});

test("setGenerator + clearGenerator round trip independently of the reference", async () => {
  await withProblem(async (id) => {
    await referenceStore.setGenerator(id, "// gen", { source: "ai" });
    const meta = await referenceStore.readMeta(id);
    assert.equal(meta.generator.present, true);
    assert.equal(meta.generator.source, "ai");
    assert.equal(meta.reference.present, false); // untouched

    await referenceStore.clearGenerator(id);
    assert.equal((await referenceStore.readMeta(id)).generator.present, false);
  });
});

test("setValidator persists independently (S12 asset sharing the same vault)", async () => {
  await withProblem(async (id) => {
    await referenceStore.setValidator(id, "// validator", { source: "manual" });
    const meta = await referenceStore.readMeta(id);
    assert.equal(meta.validator.present, true);
    assert.equal(await referenceStore.getValidatorCode(id), "// validator");
  });
});

test("recordGauntletRun updates the gauntlet counters", async () => {
  await withProblem(async (id) => {
    const meta = await referenceStore.recordGauntletRun(id, { result: "survived", survivedRuns: 42 });
    assert.equal(meta.gauntlet.lastResult, "survived");
    assert.equal(meta.gauntlet.survivedRuns, 42);
    assert.ok(meta.gauntlet.lastRunAt);
  });
});
