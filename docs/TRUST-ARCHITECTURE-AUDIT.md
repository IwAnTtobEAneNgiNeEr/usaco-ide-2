# Trust and architecture audit

**Date:** 2026-06-30
**Scope:** canonical truth, attempt evidence, generated-test provenance, CI,
desktop persistence, and architecture claims. Frontend visual design is out of
scope.

## Reproducible baseline

Before implementation, the branch was `sprint2-workspace-environment` with
pre-existing modified backend/AI/workspace/Statement/style files and untracked
registry/trust prototypes. Nothing was deleted during baseline capture.

- Backend: 98 tests passed.
- Frontend: 16 tests passed.
- Syntax: 49 backend files, 52 frontend files, and `desktop/main.js` passed
  `node --check`.
- PowerShell blocked `npm.ps1`; `npm.cmd` was used to obtain the real baseline.
- Statement visual files and the existing style redesign were treated as
  concurrent frontend work, not as this audit's design surface.

## Canonical problem truth

`meta.json` now exposes these canonical fields:

| Field | Meaning |
|---|---|
| `workflowState` | Learner intent: `learning`, `reviewing`, or `archived` |
| `verdictState` | Judge/import state: `unsolved`, `attempted`, or `solved` |
| `firstAcceptedAt` | Earliest known AC timestamp, or `null` when legacy evidence has no timestamp |
| `lastVerdict` | Most recent judge verdict; it does not erase a prior solve |
| `attemptCount` | Cumulative recorded attempts |

Legacy `status` remains a derived compatibility projection. A later WA therefore
leaves `verdictState=solved` while `lastVerdict=WA`; list counters, stats,
progress, skills, boss analysis, contest readiness, and problem selection use
the canonical verdict semantics.

Topic truth is also explicit: `topic` is the authored primary field,
`primaryTopic` falls back to the first tag for old data, `normalizedTopic` is a
derived comparison key, and tags remain aliases. Analytics count one primary
topic per problem; contest readiness may match an alias; skill clusters derive
from the primary topic.

## Attempt ledger

`history.json` is the canonical attempt ledger. `meta.history` is retained only
as a bounded compatibility cache. On read, detailed legacy snapshots and light
metadata entries are merged without double-counting. Every new run, including a
compile failure with no snapshot, writes a ledger event containing:

- `eventId`, `problemId`, `timestamp`, and `action`;
- `verdict` and `testResultSummary`;
- `codeSnapshotHash` plus the existing inline restorable code snapshot when one
  exists;
- bounded stdout/stderr;
- `aiActionProvenance` when a future caller supplies it.

The ledger remains capped to the existing history retention limit; the
cumulative `attemptCount` continues beyond the retained event window. AI chat,
Coach actions, replay, and analytics are not yet generalized into this ledger.

## Test provenance and quality

Persisted tests use evidence labels, never numeric confidence:

- `official-sample`
- `user-provided`
- `generated-unverified`
- `generated-self-consistency-check`
- `verified-by-reference-solution`
- `cross-checked-independent-oracle`
- `stale-after-statement-change`
- `invalid-or-duplicate`

A generated reference may rewrite expected outputs only after matching at least
one statement-extracted official sample. Without official samples, matching
outputs are self-consistency evidence only. The student's own executable is not
used to upgrade provenance. AI-generated contest outputs are persisted as
`generated-unverified` rather than being called verified.

Exact generated-input duplicates are skipped. Whitespace-only near-duplicates
and malformed tests are flagged with cleanup recommendations. User-created
duplicates are preserved and labeled; no existing user test is silently
deleted. A statement edit stales generated/official-derived evidence while
preserving user-provided tests. A newly regenerated test may refresh the same
stale input in place.

## Architecture reduction

| Suspect | Classification / action |
|---|---|
| Provider/parser/analysis registries | Internal prototypes only; no startup bootstrap or public settings endpoint |
| Runtime workspace registry | Removed; fixed presets are the only supported contract |
| `workspace:suggested` | Removed because it had no subscriber |
| Unconsumed workspace policy fields | Removed from policy and docs |
| Workspace auto-detection | No longer replaces selected intent; manual layout changes persist as overrides |
| Workspace architecture document | Rewritten to list only production consumers |

The untracked registry prototype files were preserved because they pre-dated
this workstream, but production code and documentation do not claim they are a
wired extensibility pipeline.

## CI, release, and desktop persistence

- Root `npm test` runs backend and frontend suites.
- CI keeps the backend OS/Node matrix, includes boot smoke through the backend
  suite, and adds frontend tests on Node 22.
- A security policy, bug form, and PR template now exist.
- Release documents identify the project as beta. As audited, GitHub showed no
  published release; a local build is not an official artifact.
- Packaged Electron launches the backend with a per-user mutable-data root.
  Legacy `resources/workspace` and `resources/data` are copied only when the
  destination is absent; nothing is moved or overwritten.
- Invalid JSON now raises `CORRUPT_JSON` with its path instead of silently
  replacing user data with defaults.

## Remaining gaps

1. Contest problem lifecycle still has its own legacy `status`/history model;
   its generated tests now have provenance, but its attempt ledger is not yet
   unified with normal problems.
2. A legacy manually-declared solved problem may have `firstAcceptedAt=null`;
   inventing a timestamp would be dishonest.
3. The reference-solution label records its method, not mathematical certainty.
   An independent oracle path exists as a label but has no automated producer.
4. Near-duplicate detection is intentionally limited to safe whitespace
   normalization; semantic similarity is not guessed.
5. Multi-file ledger/meta updates are ordered and atomic per file, not one
   cross-file transaction. A future recovery audit can reconcile from the
   canonical ledger after an interrupted write.
6. No signed/reproducible desktop artifact pipeline exists yet.

## Final verification

- `npm test` from the repository root: 114 backend tests passed and 14 frontend
  tests passed.
- Backend suite includes the HTTP boot/health smoke test.
- `node --check`: all 110 backend, frontend, desktop, and test JavaScript/ESM
  files passed.
- `git diff --check`: passed after documentation whitespace cleanup.

## Frontend contract for the parallel UI workstream

Frontend code should display `workflowState` separately from `verdictState` and
show `lastVerdict` as the latest attempt, not as solved truth. Test UI should
render the exact provenance label and stale/quality warnings; it must not infer
a percentage, “high trust,” or “100% verified.” The frontend must not mutate
`lastVerdict`, `attemptCount`, or `firstAcceptedAt` directly.

The parallel frontend workstream should not change the lifecycle derivation,
ledger schema, provenance labels, statement-staleness behavior, corrupt-JSON
handling, or per-user desktop path without corresponding backend migration
tests.

## Next backend sprint

Unify contest attempts with the canonical ledger, add an explicit recovery/
migration command that audits all workspaces without rewriting them by default,
and implement a genuinely independent-oracle producer before exposing any
stronger verification wording.
