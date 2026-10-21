"use strict";
const { fingerprint } = require("./judgeFingerprint");
const { exactInput, normalizeOutput, statementHash } = require("./trustLayer");
function contentHash(test) { return fingerprint({ input: String(test.input ?? ""), expected: String(test.expected ?? "") }); }
function receipt(test, method, statement) { return { state: "trusted", method, contentHash: contentHash(test), ...(method === "statement-sample" ? { statementHash: statementHash(statement) } : {}) }; }
function candidate(test, reason = "AI output requires explicit review") { return { state: "candidate", method: "unverified", contentHash: contentHash(test), reason }; }
function initial(test, statement, origin) {
  if (test.generatedBy !== "ai") return receipt(test, "user-provided");
  // Never accept a client-supplied oracle/provenance/expectedKnown claim.
  const samples = require("./ai").extractSamples(statement);
  if (origin !== "ai-generated" && samples.some(s => exactInput(s.input) === exactInput(test.input) && normalizeOutput(s.output) === normalizeOutput(test.expected))) return receipt(test, "statement-sample", statement);
  return candidate(test);
}
function read(test, stored, statement) {
  const value = stored && typeof stored === "object" ? stored : null;
  if (!value) return test.generatedBy === "ai" ? candidate(test, "Legacy AI output has no verification receipt") : receipt(test, "user-provided");
  if (value.state !== "trusted" || value.contentHash !== contentHash(test)) return candidate(test, "Candidate or contents changed since review");
  if (!["user-provided", "user-reviewed", "statement-sample"].includes(value.method)) return candidate(test, "Unsupported verification method");
  if (value.method === "statement-sample" && value.statementHash !== statementHash(statement)) return candidate(test, "Statement changed since sample verification");
  return { ...value };
}
module.exports = { contentHash, receipt, candidate, initial, read };
