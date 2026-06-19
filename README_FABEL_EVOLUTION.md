# Evolution Log

Changes made in the autonomous evolution passes, plus ideas considered and rejected.

## Pass 2 (2026-06-12, evening)

### Implemented

1. **Per-problem write serialization (lost-update fix).** `recordRun`, `touch`,
   `updateProblem` and every test mutation are read-modify-write sequences over the
   same meta/tests/history JSON; an autosave racing a judge could silently drop a
   verdict, and two concurrent `addTest`s could assign the SAME id and overwrite
   each other. A keyed async lock (`fileStore.withLock`) now serializes mutations
   per problem — and per contest problem (`contestStore` had the identical race).
   Reads stay lock-free. Covered by concurrency tests.

2. **Bulk test import — 📂 .in/.out drag-drop.** USACO/CF test data arrives as a
   folder of `1.in`/`1.out` (`.ans`/`.expected` accepted too). The Tests tab now
   takes a multi-file pick or a drag-drop of the whole set: pairs are matched by
   stem, numerically sorted, and added through one `POST /tests/bulk` (one
   meta write, per-item size/limit skips reported, never fatal). `addTests` also
   replaced the per-test write loop inside `createProblem` / `duplicate` / import.
   A window-level drop guard keeps a missed drop from navigating the IDE away.

3. **Personal code template.** Settings → *Code template* edits `data/template.cpp`
   (gitignored, plain file, also editable externally). Used everywhere a starter is
   scaffolded: new problems, duplicates, old-tracker import, contest problems, and
   the `getFile("code")` fallback. Blank + Save = reset to the built-in starter;
   oversized templates are rejected (400).

4. **One-request problem open.** `GET /api/problems/:id/workspace` bundles meta +
   code/input/expected/notes/statement + tests; `loadProblem` went from seven
   round trips to one. `listTests` reads test files in parallel.

5. **Bounded history.json.** Run snapshots stored stdout/stderr uncapped (up to
   1MB each × 30 entries, rewritten on every run). Display fields are now capped
   at 64KB with a truncation marker — snapshot **code is never capped** ("Restore
   code" must return exactly what was judged). Old oversized entries shrink on
   their next rewrite. Same policy in contests.

Tests: 87 → **98 passing** (lock concurrency, bulk add semantics, snapshot caps,
template round-trip, /workspace and /tests/bulk routes).

### Rejected

- **Contest-workspace bundle endpoint** — opening a contest problem is already
  only 3 parallel fetches; more API surface for no perceivable gain.
- **Coalescing duplicate boot GETs** (`/api/boss` ×3, `/api/progress` ×2) — root
  cause is journey repaint fan-out; request-dedup risks stale UI to save a few
  sub-ms local calls.
- **Generic request memoization in api.js** — unsafe for freshness-sensitive
  calls (post-judge `syncMeta`), and the only beneficiaries are the boot calls above.

## Pass 1 (2026-06-12)

### Implemented

1. **Host-header guard (security).** The API compiles and runs arbitrary C++. A malicious
   webpage using DNS rebinding could reach `http://127.0.0.1:5050` as a same-origin target
   and gain code execution. All requests now require a loopback `Host` header
   (`localhost` / `127.0.0.1` / `[::1]`), unless the server was explicitly bound to a
   non-loopback `USACO_IDE_HOST`. Verified: spoofed `Host` → 403, normal → 200.

2. **Atomic file writes (durability).** `meta.json` / `history.json` / `main.cpp` are
   rewritten on every run and autosave. A crash mid-write used to corrupt them — and
   `readJson` silently "healed" corruption to defaults, losing verdicts/history. All
   writes now go through write-temp-then-rename (with a Windows AV-lock retry).

3. **Parallel judging (performance).** `compileAndJudge` ran tests strictly serially:
   30 tests × 2s TLE = a 60-second wait. Tests now run in a bounded pool (half the
   cores, capped at 4). Any TLE measured under parallel load is re-run alone before
   it is trusted; after one TLE is serially confirmed, the rest are not re-checked
   (verdict already settled). USACO file mode stays sequential (shared cwd files).

4. **Run/Judge cancellation (UX).** Long judges were uninterruptible — and the keyboard
   shortcut could even start a second concurrent run. The Run/Judge buttons (main IDE
   and contest workspace) become a live ⏹ Stop while busy; aborting drops the request
   and the backend stops launching further tests on disconnect. Cancelled judges don't
   pollute history/lastVerdict.

5. **Special judge / SPJ (advertised but missing).** README and `config.js` describe
   per-problem `checker.cpp` special judges, but nothing ever compiled or invoked one.
   Now end-to-end: `usesChecker` toggle in Edit info, starter checker scaffolded on
   enable, ⚖️ Checker editor modal in the Tests tab, `GET/PUT /api/problems/:id/checker`,
   judge + run execute the checker per test (exit 0 = AC), and its message is shown on
   the result row / diff panel / test card. Compile cache makes repeat judges free.

6. **LCS-aligned side-by-side diff.** The WA diff aligned lines by index, so one missing
   or extra line cascaded into "everything below differs". Lines are now aligned on
   their longest common subsequence (≤400 lines/side; index fallback beyond), with
   changed-line pairs zipped side by side and the trailing-newline artifact no longer
   flagged. Line numbers shown are the actual output's.

7. **Vendored fonts (offline).** The README claims the app is fully offline, but the UI
   pulled Geist + JetBrains Mono from Google Fonts. Both are now vendored
   (`frontend/vendor/fonts`, latin + vietnamese subsets, ~300 KB). Verified: zero
   external requests after load.

8. **Polish.** Shortcuts modal showed wrong keys (`Enter` → actually `Ctrl+Enter`);
   Run/Judge/New shortcuts no longer fire invisibly behind an open modal;
   `data/boss.json` (user state) gitignored; toasts dismissible by click; the
   Tab-snippet table deduplicated into `snippet-table.js` (was copy-pasted in both
   editors); README test badge/count and judge/offline descriptions brought up to date;
   `server.js` only auto-starts when run directly (testable exports).

Tests: 76 → **87 passing** (judge pool, cancellation, SPJ, Host guard covered;
compile-dependent cases self-skip without g++).

### Rejected

- **MLE verdict via memSampler** — the sampler spawns a PowerShell monitor per run on
  Windows; wiring it in slows every judge and still misses sub-200ms programs. Needs OS
  job objects (native module) to do right; not worth breaking the zero-dependency rule.
- **Framework / bundler migration** — against the project's explicit local-first,
  no-build-step ethos; no user-visible payoff.
- **Consolidating the v25/v30/journey CSS layers** — high visual-regression risk with no
  screenshot tests; cosmetic-only payoff.
- **Refactoring `ai.js` / `statement.js` (1800 + 537 lines)** — the AI pipeline can't be
  exercised here without an API key; restructuring it blind risks breaking the app's
  flagship features for zero observable gain.
- **Re-running every parallel-measured TLE serially** — replaced with the
  confirm-first-then-stop rule above after noticing it could double judge time for
  genuinely slow solutions.
