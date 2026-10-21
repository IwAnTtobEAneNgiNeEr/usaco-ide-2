# Truth Core contract (current)

Authoritative implementation: backend/src/truthModel.js, judgeService.js, problemStore.js, verifiedArtifact.js and routes/problems.js; inspect exports when changing the contract. Regression entry points: backend/test/truth-campaign.test.js and truth-core-contract.test.js. Historical VERIFIED-ARTIFACT-API.md describes an older contract and must not override the implementation/tests.

The complete judge fingerprint binds source snapshot, trusted testcase contents/order/expected outputs, comparator/checker, compiler identity/flags, engine version, resource limits and file I/O. An immutable JudgeAttempt records the fingerprint/input snapshot, source/hash, compile evidence, per-test evidence and verdict. CE preserves exact source and compiler stderr across restart. Legacy evidence remains readable but does not create current verification by itself.

Current full AC means an accepted full-suite attempt matches the current fingerprint. Relevant edits make it stale without deleting accepted history. Reverting to the same complete inputs may restore matching current evidence. List/detail/nextAction use the backend projection; do not infer current AC from a historical verdict, non-empty expected output or frontend cache. Failed, cancelled, scratch and single-test attempts do not confer full-suite AC.

AI provenance and oracle trust are separate. Generated expected output, helper compilation and matching statement samples do not constitute an independent oracle. Generated tests remain candidates until an explicit authorized review/trusted verification path records a content-bound receipt. A failed/missing AI reference cannot silently replace the trusted suite. Content edits invalidate stale receipts; client-supplied verified claims are not authority.

stdout, stderr and USACO file output are capped at the configured byte limit; overflow returns explicit OUTPUT_LIMIT evidence. This bounds captured evidence, not all temporary disk consumption. IDs are validated before filesystem work; containment/link checks reduce traversal risk but do not defeat arbitrary hostile processes changing the filesystem concurrently. Provider redaction protects configured material/recognized forms, not every possible secret.

Any future migration must back up data, name a schema version and preserve original attempt bytes. Do not edit historical records to make a current view appear verified.
