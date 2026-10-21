# Test generation and oracle trust

AI-generated input/expected pairs are untrusted candidates. A non-empty expected output, expectedKnown flag, compilable helper or helper matching statement samples never creates independently verified judge truth. If reference compile fails, samples mismatch, verification is unavailable or budgets expire, review is still required.

Generation can show preview and add selected candidates, but candidates are excluded from normal full-suite judging. Explicit authorized review uses a backend content-bound receipt; editing content invalidates earlier review. Trusted user/imported tests and AI provenance are distinct concerns. Never bypass this distinction through a frontend flag or automatic fallback to scratch judging.

Inspect backend routes/ai.js, problemStore.js and the current contract in security/truth-core.md. Tests truth-campaign.test.js, truth-core-contract.test.js, test-generation.test.js and verify-tests.test.js cover reference failure, candidate exclusion and review/edit boundaries. Sample matching alone cannot establish a correct oracle for unseen cases.

Before importing/generated tests, validate IDs/paths and review both input and expected output. Keep generated artifacts, prompts and provider material out of Git unless explicitly sanitized and owned.
