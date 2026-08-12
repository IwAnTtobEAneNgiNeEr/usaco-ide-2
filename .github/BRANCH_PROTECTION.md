# GitHub branch policy

The repository follows a protected-`main` workflow:

1. Every feature, fix, documentation, or dependency update starts from `main` in a separate branch: `feature/*`, `fix/*`, `docs/*`, `chore/*`, or `release/*`.
2. `main` accepts changes only through a pull request. Direct pushes, force-pushes, and branch deletion are disabled.
3. The pull request must have one Code Owner approval, resolved conversations, and a passing `ci-gate` check from GitHub Actions.
4. The branch must be up to date with `main`, and linear history is required. Prefer squash merge for small feature branches.
5. Stale approvals are dismissed after new commits. The latest push must receive approval again.

Apply the server-side rule once with an administrator token:

```powershell
$env:GH_TOKEN = 'your-short-lived-repository-admin-token'
powershell -ExecutionPolicy Bypass -File .\scripts\apply-github-protection.ps1
Remove-Item Env:GH_TOKEN
```

The script only configures the `main` branch and does not store the token. GitHub Rulesets are the preferred UI equivalent if the repository later grows beyond one protected branch. The local hook prevents direct commits/pushes to `main`, but only GitHub-side protection can enforce the policy for every collaborator.
