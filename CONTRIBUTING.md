# Contributing to USACO IDE 2.0

Thanks for your interest! This project is intentionally small and local-first. Contributions
that keep it that way are very welcome.

## Project principles (please keep these)

1. **Local-first.** No accounts, no cloud, no telemetry. The app runs on the user's machine.
2. **Zero build step on the frontend.** Vanilla ES modules, no framework, no bundler.
3. **Minimal dependencies.** The backend has a *single* runtime dependency (Express). Don't
   add heavyweight deps without a strong reason.
4. **It must work offline.** AI is the only feature allowed to need the network.
5. **Your data is just files.** Keep the file-per-problem model; never require a database.

## Getting set up

```bash
git clone https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2.git
cd usaco-ide-2
npm run setup     # installs backend deps
npm start         # http://127.0.0.1:5050
npm test          # run the backend test suite
```

You need Node ≥ 18 and `g++` on `PATH` (some tests self-skip without a compiler).

## Git and GitHub workflow

Install the repository hooks once after cloning:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-git-workflow.ps1
```

The setup enables `fetch.prune`, `pull.rebase`, worktree safety checks, and automatic
post-commit push for non-protected branches. Before pushing, the hook runs the backend tests
when the commit touches backend/runtime files. If tests fail, the push is blocked. Every
automatic push also creates a local `safety/<branch>-<timestamp>-<sha>` tag first, so the
commit can be recovered even if the branch later needs to be repaired.

The hook never auto-merges or auto-rebases a branch that is behind or has diverged on GitHub;
it stops and asks for an explicit `git pull --rebase`. It also skips pushing while the worktree
contains additional uncommitted files. Use `git config --local sync.autoPush false` to disable
automatic push temporarily.

Create a branch before every change:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Commit and push only that branch. Open a draft PR early, wait for `ci-gate`, request review,
then merge through GitHub. Never force-push `main`; use `git revert <merge-commit>` for a safe
rollback. For a feature branch, a recovery point can be restored with
`git switch -c rescue/<name> safety/<tag>`.

## Before you open a PR

- **Run `npm test`** — it must pass. CI runs it on Ubuntu + Windows across Node 18/20/22.
- **Add tests** for backend logic changes (`backend/test/*.test.js`, `node --test`, no test
  deps). The judge, stores, and progress engine are all unit-tested — follow the patterns
  there (e.g. ephemeral `zz-*` throwaway problems for route tests).
- **Don't commit secrets or user data.** `data/ai-settings.json`, `data/settings.json`, and
  `workspace/` are gitignored for a reason. Never `git add -f` them.
- **Match the surrounding style.** No linter is enforced; mirror the existing code's naming,
  comment density, and idioms. Keep functions small and commented where intent isn't obvious.
- **Keep the UI consistent.** New user-facing strings should match the app's primary language
  (Vietnamese) unless they're developer-facing.

## Good first contributions

- Translations / English-mode polish.
- More algorithm snippets (`frontend/src/snippet-table.js`).
- Visualizer support for more input shapes.
- Documentation fixes in `docs/`.
- Bug reports with a minimal repro (statement + code + expected vs actual).

## Reporting bugs

Open an issue with:
- what you did and what you expected,
- the **backend console output**,
- your OS, Node version (`node --version`), and `g++ --version`.

## Code of conduct

Be kind and constructive. Assume good faith. This is a learning tool for students — keep it
welcoming.
