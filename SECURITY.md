# Security policy and limits

This ZIP-derived local source has no established upstream branch/release identity or verified private security contact. Do not infer a support promise from a branch name, README URL, tests or this file.

## Supported use boundary

Use only as a local, single-user development tool inside the verified containment environment. Keep HOST=127.0.0.1 and disable the optional Companion listener when unused. No hosted/multi-user execution is approved. g++ output executes with the backend's OS permissions; the app lacks OS process isolation, enforceable memory/disk quotas, authentication and a complete CSRF/Origin policy. A hostname guard alone is insufficient.

Truth Core enforces fingerprint freshness, immutable attempt evidence, AI candidate separation, bounded output, path validation and configured-secret redaction. See docs/security/truth-core.md for precise scope and docs/security/threat-model.md for residual risks. These are not universal sanitization or isolation guarantees.

## Reporting

Do not post keys, user-data, browser profiles, participant data, source containing secrets or exploitable private details in public issues. Share a synthetic reproduction, affected source manifest/version and redacted symptoms first. Ask the repository owner for a private channel. GitHub private vulnerability reporting can be used only after the owner confirms the destination and enables/supports it; no contact address or enabled feature is asserted here.

If a real credential is exposed, the owner must revoke/rotate it at its provider. Removing a file or adding an ignore rule does not revoke it or remove Git history. Do not rewrite shared history without a separately reviewed response plan.

## Supply chain and automation

Backend npm ci --ignore-scripts uses the lockfile. Advisory checks are point-in-time and may still find unfixed issues; never run blanket audit fixes. Electron is separately packaged, unvalidated and lacks a lockfile in this snapshot. CI uses pinned official actions, read-only contents permission and no deployment/secrets. Dependabot proposals require review; no auto-merge is configured. Actual GitHub plan, settings and permissions must be checked by the owner before activation.

This policy does not certify compliance with OWASP, NIST or a hosted-execution security standard.
