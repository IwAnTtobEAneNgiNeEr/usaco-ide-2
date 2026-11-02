# Contributing

Read AGENTS.md and docs/operations/development.md first. Work from the verified patched source, not the old extracted ZIP. Verify the current checkout's real ancestry, intended base, remote and permissions before synchronization; a Git remote does not retroactively establish ZIP ancestry.

Keep changes small and reviewable. Preserve the Express/vanilla-JS/file persistence architecture and Truth Core invariants. Functional fixes start with a failing regression; preserve failures and explain intentional contract changes. Do not update snapshots/assertions merely to conceal failures.

Run node scripts/verify-repository.cjs for static checks. Judge tests and the server belong in the verified MXC environment on the borrowed machine, using owned temporary data and fresh browser profiles. Record actual pass/fail/skip counts and browser evidence for affected user flows. npm test is not a safe stock-runner CI subset.

Submit source identity, scope, exact changes, validation evidence, risks and rollback. Check staged paths for secrets, data/, workspace/, profiles, archives, dependencies and binaries. Ignore patterns do not protect previously tracked files. Never attach raw runtime logs without review: local event/research data and HTTP URLs can contain sensitive material.

For multi-step work, use the task record and handoff in docs/agent-work/START.md. Before finishing, commit the reviewed task-owned files locally when authorized and safe; distinguish local commit, remote branch and PR. A plan, hook or passing CI is not permission to push or merge.

Remote push/creation/settings, releases, merge, destructive cleanup and history rewrites require specific owner approval. Security reports follow SECURITY.md. The PR template is a review aid, not an authorization or proof that checks passed.
