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
git clone https://github.com/<your-username>/usaco-ide-2.git
cd usaco-ide-2
npm run setup     # installs backend deps
npm start         # http://127.0.0.1:5050
npm test          # run the backend test suite
```

You need Node ≥ 18 and `g++` on `PATH` (some tests self-skip without a compiler).

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
