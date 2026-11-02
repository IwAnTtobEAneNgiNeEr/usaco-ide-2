# Release readiness checklist

No release/deployment is authorized by this file. The app is local-only; verify the actual Git checkout, intended base and owner permissions before synchronization. The original ZIP does not acquire Git ancestry retroactively.

- [ ] Verify source/changed-file manifests and preserve original + Truth Core evidence.
- [ ] Establish actual remote/default branch/history, owner authorization and plan-dependent security capabilities.
- [ ] Review staged paths and secret-scan results; exclude runtime, dependencies, browser profiles and generated binaries.
- [ ] Run static repository check, contained targeted/full suite and affected real browser flows; link actual counts and known failures.
- [ ] Preserve immutable attempts, exact CE evidence, oracle candidate separation and fingerprint freshness.
- [ ] Review backend advisories individually. No blanket audit fix or auto-merge.
- [ ] Revalidate supported Node/GCC/platforms. Electron/desktop has a separate lockfile but still requires version/security review and packaging-content inspection; no desktop release is validated here.
- [ ] Review the actual branch workflows, permissions, action pins and latest-head checks. Integration CI is static-only and does not prove Judge or browser behavior.
- [ ] Confirm owned data backup/restore and rollback before any migration. Never ship user-data, credentials or profiles.
- [ ] Reassess hosted process/network/filesystem isolation and memory/disk quotas before any web work. Local tests do not resolve these blockers.
- [ ] Obtain specific owner approval before push, merge, release or settings changes. Preserve ancestry and use reviewed revert commits for rollback.
