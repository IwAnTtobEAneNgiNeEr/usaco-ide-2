# Test generation and oracle trust

AI-generated input/expected pairs are untrusted candidates. A non-empty expected output, expectedKnown flag, compilable helper or helper matching statement samples never creates independently verified judge truth. If reference compile fails, samples mismatch, verification is unavailable or budgets expire, review is still required.

Generation can show preview and add selected candidates, but candidates are excluded from normal full-suite judging. Explicit authorized review uses a backend content-bound receipt; editing content invalidates earlier review. Trusted user/imported tests and AI provenance are distinct concerns. Never bypass this distinction through a frontend flag or automatic fallback to scratch judging.

Inspect backend routes/ai.js, problemStore.js and the current contract in security/truth-core.md. Tests truth-campaign.test.js, truth-core-contract.test.js, test-generation.test.js and verify-tests.test.js cover reference failure, candidate exclusion and review/edit boundaries. Sample matching alone cannot establish a correct oracle for unseen cases.

Before importing/generated tests, validate IDs/paths and review both input and expected output. Keep generated artifacts, prompts and provider material out of Git unless explicitly sanitized and owned.

## Synthesized harder variants (W1)

The “Bản nâng cấp” create action records `origin: "ai-generated"` and
`derivedFrom: { id, title }` for the problem that produced the AI result. A result
cannot be attached to a different currently selected problem. The reading brief
and synthesis result identify AI content and the need to review tests; this is
an informational notice, not a multi-user draft/review workflow.

Copied source samples remain context, not independently verified expected
outputs for the modified problem. The existing `/process` provenance and store
receipt rules keep AI variant samples as candidates, including cached process
results. A content-bound explicit review can authorize a test as before.
Ordinary non-AI sample handling is unchanged. Existing problem metadata and
historical receipts are not migrated by this patch.

`frontend/test/synthesizer-provenance.test.mjs` exercises the actual create
handler, real store, and `/process` handler with a fake router/provider/reference
verifier. Judge input selection uses a mock compiler identity; no C++ is run.
Run it with `node --test frontend/test/synthesizer-provenance.test.mjs`.
Browser/HTTP E2E and contained compiler/Judge checks are separate merge gates;
these tests do not establish their completion.
