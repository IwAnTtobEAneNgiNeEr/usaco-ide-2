# USACO IDE: agent entry point

## Authority and scope
- This source is a ZIP-derived working copy carrying the verified Truth Core changes. Do not invent Git history or treat the original ZIP as the latest implementation.
- Read README.md, docs/security/truth-core.md and docs/operations/development.md before changes. Historical docs/reference/legacy-product-direction.md and docs/HANDOVER.md are context, not competing instructions.
- Start at the project root. Without a Git root, Codex discovers project instructions from its working directory only; explicitly read this file when starting in a subdirectory. No nested instruction file is needed today.
- Backend: Express/CommonJS, backend/server.js and backend/src/. Frontend: vanilla ES modules in frontend/. File persistence: USER_DATA_ROOT/data and workspace. desktop/ is an optional Electron package; it was not validated in this campaign.

## Environment and commands
- Node 24 is the validated development line; package engines >=18 is historical metadata, not a current support guarantee. Reuse an available g++ and npm. Never install globally on a borrowed machine.
- Dependency setup on a trusted environment: npm ci --prefix backend --ignore-scripts. It changes node_modules; do not repeat it when working dependencies already exist.
- Safe static entry: node scripts/verify-repository.cjs (or npm run check:repo). It parses syntax/JSON and checks repository hygiene, without importing application modules, running tests, compiling C++, installing packages or accessing network.
- Runtime entry: npm start. Before starting, set USACO_IDE_USER_DATA_DIR to a new owned directory, USACO_IDE_HOST=127.0.0.1 and USACO_COMPANION_PORT=0. A fresh data root still does not isolate C++ from the OS.
- npm test runs the full compiler suite. On the borrowed Windows setup, run it only through the existing verified MXC wrapper. See operations/development.md for exact campaign wrapper commands and test groups. Create the sandbox-selected TEMP only after containment validation. Fail closed if MXC fails; no elevated/unelevated/full-access fallback.

## Truth Core invariants
- Current AC requires a full-suite accepted immutable attempt whose complete judge fingerprint matches current inputs. Source, trusted test contents/order, checker, toolchain/flags, limits and file I/O all matter.
- Editing relevant inputs makes the projection stale, retaining historical attempts. List/detail/nextAction must share the backend contract.
- AI output and sample-matching AI references are candidates, not independently trusted oracles. No auto-trust based on non-empty expected output or client verification claims. Preserve explicit review receipts and content hashes.
- Preserve exact submitted source, compiler evidence (including CE), per-test evidence and fingerprint across restart. Cancelled/single-test attempts never grant full AC.
- Validate IDs and containment before any filesystem access. Keep stdout/stderr/file-output byte caps and configured-secret redaction. These controls are not filesystem/process isolation or universal DLP.
- Keep legacy data readable. Any migration needs explicit versioning, backup and rollback; never silently rewrite historical attempts.

## Change and verification discipline (project policy)
- Inspect -> reproduce -> regression test -> implement -> verify -> refactor. Do not weaken tests to hide failures. Keep changes small and preserve current architecture.
- Governance/docs changes must preserve application bytes. Functional work must reproduce defects before behavior changes and run targeted plus relevant existing tests in containment.
- Critical changes also need real browser E2E with a fresh profile and synthetic data: AC -> edit -> STALE -> WA, CE reload/restart, AI candidates excluded, Stop/import where relevant. Record actual counts, failures and retries.
- No credentials, private data, profiles, caches, node_modules, generated binaries or raw runtime evidence in Git/delivery. .gitignore does not remove already tracked data; inspect the actual index when Git is available. Heuristic scanning is not proof of absence.
- Never commit generated user data from tests. Explicitly own and check the resolved USER_DATA_ROOT; environment variables can override the test helper's default isolation.
- Keep the MXC child view of source, launcher scripts, browser commands and configuration read-only. Writable runtime/evidence must never be evaluated as host commands. The governance wrapper grants writes only to owned runtime/temp/test-data/user-data/evidence/validation and denies credential homes; recheck these boundaries after any profile change.
- No web migration, authentication, deployment, database or framework rewrite without a separate task. Do not claim local Judge execution is safe for hosted/multi-user use.

## Permission boundaries and handoff
- Stay within the task-owned copy. Do not edit the original ZIP, protected baselines, personal profiles, credentials, global config, ACLs, Windows policies, registry, firewall or permanent PATH.
- No destructive cleanup. Inventory and propose recoverable quarantine first. Never stop an unrecognized process.
- Remote creation, push, settings/visibility changes, merge, release, history rewrite and deletion need specific owner approval. A repository URL or local test success is not that approval.
- If Git history/auth is uncertain, stop at reconciliation; do not initialize fabricated ancestry. Never copy existing user credentials. Let the owner authenticate manually if needed.
- Handoff: source identity and before/after SHA-256, exact changed files, commands/environment, pass/fail/skip counts and evidence paths, risks/blockers, rollback, and next task. Use logical commits only on established Git ancestry; otherwise keep an explicit change manifest.
