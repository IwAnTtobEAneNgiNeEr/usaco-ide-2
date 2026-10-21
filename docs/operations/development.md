# Development, tests and recovery

## Source and setup

Use the full governance app tree, not the older ZIP or a changes-only overlay. Source identity is established by the campaign SOURCE_OF_TRUTH.md and SHA-256 manifests; no Git ancestry is implied. Keep runtime and backups outside source. Reuse working dependencies; for a clean trusted environment use Node 24 and npm ci --prefix backend --ignore-scripts. Check the lockfile before installation. Optional desktop packaging is not part of this verified setup.

Static check (no app import, compiler, tests or network): node scripts/verify-repository.cjs. It checks JSON/syntax/hygiene with size/time limits. It is heuristic and does not replace a secret scanner or actual Git index inspection.

## Borrowed Windows: verified MXC only

Let KIT be the existing usaco-audit-kit directory. The isolated governance source is KIT/runs/governance-001/app. Use the existing portable PowerShell 7 executable or a working pwsh; the wrapper sets process-only paths and reuses Node/GCC/backend dependencies.

The final governance profile exposes source and host control scripts/commands/configuration read-only to the sandboxed child, denies both credential homes, and permits writes only in owned runtime/temp/test-data/user-data/evidence/validation. Do not broaden this to the entire kit/run or evaluate runtime artifacts as host commands. Host-side editing of the owned source remains a separate authorized development action. Revalidate preflight and regressions after a permissions change.

~~~powershell
pwsh -NoProfile -File "$KIT/runs/governance-001/scripts/exec-mxc.ps1" -Task preflight
pwsh -NoProfile -File "$KIT/runs/governance-001/scripts/exec-mxc.ps1" -Task repo-check
pwsh -NoProfile -File "$KIT/runs/governance-001/scripts/exec-mxc.ps1" -Task suite -Group 'truth-campaign.test.js,truth-core-contract.test.js'
pwsh -NoProfile -File "$KIT/runs/governance-001/scripts/exec-mxc.ps1" -Task suite -Group all.test.js
pwsh -NoProfile -File "$KIT/runs/governance-001/scripts/exec-mxc.ps1" -Task server
~~~

Set $KIT manually to the existing kit location; these are development validation wrappers, not an unattended audit. Server runs foreground on 127.0.0.1:15070 with Companion disabled. Data is new campaign user-data; suite runs use distinct test-data roots. Stop only the known owned process using scripts/stop-server.ps1 after verifying its parent/path. Do not stop another listener or widen permissions. No authentication or existing user profile is copied.

Do not execute npm test, student binaries or the backend directly on the borrowed host. In any new environment revalidate the sandbox before compiler tests. Failed MXC or missing compiler is a blocker, never a reason to skip and report PASS.

## Regression and browser evidence

Minimum targeted set: truth-campaign, truth-core-contract, judge-service, problem-store, persistence, verified-artifact, verified-artifact-route, verified-artifact-integration, verify-tests, trust-layer, test-generation, statement-samples, smoke, backend-patch (confirm exact filenames against backend/test). Full suite is npm test's inventory and must be contained. Preserve TAP counts, failing attempts and actual environment versions.

Use a new profile with synthetic data for browser checks. Required affected flows: AC -> expected edit -> stale -> WA, CE inspect after reload/restart, wrong AI expected excluded, cancelled/single attempts not full AC, import/Stop and unchanged persistence. Headless Chrome with its sandbox enabled is used locally; no personal cookies. Browser evidence and compiler output remain in the kit and are reviewed before export.

## Backup, rollback and resumption

Before a data/schema change: stop the owned server, copy the entire owned USER_DATA_ROOT to a new timestamped backup, record hashes/schema/source identity, validate the copy and test restore into a new location. Never overwrite a user's only data copy. Keep sensitive backups out of Git/ZIP delivery. No migration was necessary for governance.

Campaign rollback needs no data migration: stop owned processes, retain the governance directory unchanged, and start a NEW disposable copy from the protected Truth Core baseline. Verify its manifest. Keep both copies until the owner reviews; do not delete or overwrite them. For future established Git ancestry, revert reviewed commits on a new branch; do not reset/force-push shared history.

On resumption, read AGENTS.md, latest source/changed-file manifests and regression evidence; verify protected baselines, current tooling/MXC and owned paths. Re-run only checks justified by new changes. Record unverified platforms, manual steps and outstanding security/dependency work. The scripts/analyze-events.js legacy tool reads repository data directly; do not run it on participant data without a separately authorized owned copy.
