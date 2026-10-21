## Problem and resulting behavior

Describe the trigger, before/after behavior and scope. Link the source commit or ZIP manifest identity; do not invent ancestry.

## Validation

- [ ] Static repository check passed (attach actual output).
- [ ] Relevant regression tests ran in verified containment; actual pass/fail/skip counts and evidence linked.
- [ ] Affected critical browser flows verified with synthetic data and a fresh profile, or explicit reason not applicable.
- [ ] Truth Core freshness/oracle/immutable-history invariants preserved.
- [ ] Staged files reviewed: no credentials, user-data, profiles, dependencies, binaries or raw sensitive logs.

## Risks and rollback

Describe migrations, backup/restore, unresolved risks and reversibility. CI only covers static checks; it does not verify the Judge or hosted isolation. No push/merge/release/settings permission is implied by this template.
