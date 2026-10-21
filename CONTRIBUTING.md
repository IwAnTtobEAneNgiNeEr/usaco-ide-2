# Contributing

Read AGENTS.md and docs/operations/development.md first. Work from the verified patched source, not the old extracted ZIP. Establish real upstream ancestry before creating commits for synchronization. No GitHub destination/authentication has been confirmed for this snapshot.

Keep changes small and reviewable. Preserve the Express/vanilla-JS/file persistence architecture and Truth Core invariants. Functional fixes start with a failing regression; preserve failures and explain intentional contract changes. Do not update snapshots/assertions merely to conceal failures.

Run node scripts/verify-repository.cjs for static checks. Judge tests and the server belong in the verified MXC environment on the borrowed machine, using owned temporary data and fresh browser profiles. Record actual pass/fail/skip counts and browser evidence for affected user flows. npm test is not a safe stock-runner CI subset.

Submit source identity, scope, exact changes, validation evidence, risks and rollback. Check staged paths for secrets, data/, workspace/, profiles, archives, dependencies and binaries. Ignore patterns do not protect previously tracked files. Never attach raw runtime logs without review: local event/research data and HTTP URLs can contain sensitive material.

Remote push/creation/settings, releases, merge, destructive cleanup and history rewrites require specific owner approval. Security reports follow SECURITY.md. The PR template is a review aid, not an authorization or proof that checks passed.
