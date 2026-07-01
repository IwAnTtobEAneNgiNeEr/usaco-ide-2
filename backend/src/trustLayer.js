"use strict";

const crypto = require("crypto");

// Evidence labels only. None of these is a probability or a promise that a
// test is correct; each says exactly where the test/output came from.
const PROVENANCE = Object.freeze({
  OFFICIAL_SAMPLE: "official-sample",
  USER_PROVIDED: "user-provided",
  GENERATED_UNVERIFIED: "generated-unverified",
  GENERATED_SELF_CHECK: "generated-self-consistency-check",
  VERIFIED_REFERENCE: "verified-by-reference-solution",
  CROSS_CHECKED_ORACLE: "cross-checked-independent-oracle",
  STALE: "stale-after-statement-change",
  INVALID_DUPLICATE: "invalid-or-duplicate"
});
const ALLOWED = new Set(Object.values(PROVENANCE));

function statementHash(statement) {
  return crypto.createHash("sha256").update(String(statement || "")).digest("hex");
}

function exactInput(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/, "");
}

function tokenInput(value) {
  return exactInput(value).trim().split(/\s+/).filter(Boolean).join(" ");
}

function normalizeOutput(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "");
}

function normalizeProvenance(value, generatedBy) {
  if (ALLOWED.has(value)) return value;
  return generatedBy === "ai" ? PROVENANCE.GENERATED_UNVERIFIED : PROVENANCE.USER_PROVIDED;
}

function auditTestQuality(tests) {
  const list = Array.isArray(tests) ? tests : [];
  const issues = [];
  const exactSeen = new Map();
  const tokenSeen = new Map();

  list.forEach((test, index) => {
    const exact = exactInput(test && test.input);
    const token = tokenInput(test && test.input);
    if (!exact) issues.push({ type: "empty-input", severity: "warning", indexes: [index] });
    if (exactSeen.has(exact)) {
      issues.push({ type: "duplicate-input", severity: "error", indexes: [exactSeen.get(exact), index] });
    } else {
      exactSeen.set(exact, index);
    }
    if (token && tokenSeen.has(token) && exactSeen.get(exact) === index) {
      issues.push({ type: "near-duplicate-whitespace", severity: "warning", indexes: [tokenSeen.get(token), index] });
    } else if (token) {
      tokenSeen.set(token, index);
    }
    if (test && test.expectedKnown && !normalizeOutput(test.expected)) {
      issues.push({ type: "empty-output-claimed-known", severity: "error", indexes: [index] });
    }
  });
  return issues;
}

function applyProvenance({ tests, samples, statement }) {
  const list = Array.isArray(tests) ? tests : [];
  const hash = statementHash(statement);
  const official = new Set((Array.isArray(samples) ? samples : []).map((sample) =>
    `${exactInput(sample && sample.input)}\u0000${normalizeOutput(sample && (sample.output != null ? sample.output : sample.expected))}`
  ));

  for (const test of list) {
    delete test.confidence;
    delete test.verifiedBy;
    delete test.bruteVerified;
    delete test.bruteMismatch;
    const key = `${exactInput(test.input)}\u0000${normalizeOutput(test.expected)}`;
    if (official.has(key)) test.provenance = PROVENANCE.OFFICIAL_SAMPLE;
    else test.provenance = normalizeProvenance(test.provenance, "ai");
    test.statementHash = hash;
    test.quality = { lowQuality: false, flags: [] };
  }

  const issues = auditTestQuality(list);
  for (const issue of issues) {
    for (const index of issue.indexes) {
      const test = list[index];
      if (!test) continue;
      test.quality.lowQuality = true;
      if (!test.quality.flags.includes(issue.type)) test.quality.flags.push(issue.type);
    }
    if (issue.type === "duplicate-input") {
      const duplicate = list[issue.indexes[1]];
      if (duplicate) duplicate.provenance = PROVENANCE.INVALID_DUPLICATE;
    }
  }
  return summarize(list, issues);
}

function summarize(tests, existingIssues) {
  const list = Array.isArray(tests) ? tests : [];
  const counts = {};
  for (const test of list) {
    const label = normalizeProvenance(test && test.provenance, test && test.generatedBy);
    counts[label] = (counts[label] || 0) + 1;
  }
  const issues = existingIssues || auditTestQuality(list);
  const recommendations = [];
  if (issues.some((issue) => issue.type === "duplicate-input")) recommendations.push("Review exact duplicate inputs; generated duplicates are skipped when persisted.");
  if (issues.some((issue) => issue.type === "near-duplicate-whitespace")) recommendations.push("Review whitespace-only input variations before keeping both tests.");
  if (list.some((test) => test && test.provenance === PROVENANCE.GENERATED_UNVERIFIED)) recommendations.push("Validate generated-unverified outputs against an independent oracle or official data.");
  return { counts, issues, recommendations, total: list.length };
}

module.exports = {
  PROVENANCE,
  ALLOWED_PROVENANCE: ALLOWED,
  statementHash,
  exactInput,
  tokenInput,
  normalizeOutput,
  normalizeProvenance,
  auditTestQuality,
  applyProvenance,
  summarize
};
