# USACO IDE 2.0

![CI](https://img.shields.io/badge/tests-76%20passing-brightgreen)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![C++](https://img.shields.io/badge/judge-g%2B%2B%20%C2%B7%20C%2B%2B17-00599C?logo=cplusplus&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-555)
![License](https://img.shields.io/badge/license-MIT-blue)

A standalone, feature-rich **desktop** code-and-judge workspace for competitive programming in C++. Write C++, store one file-set per problem on disk, run against your own input, and judge against multiple test cases with a real local `g++` compiler—all enriched with a gamified learning engine and an integrated AI Coach.

USACO IDE 2.0 transforms competitive programming practice by blending local IDE functionality with a gamified progression system (streaks, daily quests, XP, and rank tiers), interactive test-case visualization, and targeted AI training diagnostics.

---

## Highlights

- **Gamified Journey Dashboard** — Track your daily coding streak 🔥, earn XP for successful runs, complete 4 dynamic daily quests, level up through 30+ rank tiers, and summon the **Weekend Boss** (an AI-generated problem targeting your weakest topic).
- **Skill Constellation (Skill Map)** — Explore a Duolingo-path SVG visualization of your curriculum lanes. Track your mastery (weighted by volume, reliability, and recency) across topics like Dynamic Programming, Graphs, and Math.
- **AC Defense (Oral Viva)** — After getting Accepted (AC) on a problem, face the AI Examiner in a 3-question viva about your code's complexity, edge cases, and algorithm choices to verify you truly understand your solution.
- **AI Coach & Mini-Chat** — Open the side panel to chat with the Coach about the active problem. Get non-spoiler hints across three levels (*nudge → technique → approach*), ask about CodeMirror selections (`Ctrl+Shift+E`), or request a direct code fix.
- **Test Case Visualizer** — Automatically detect input shapes (Graphs, Trees, Char Grids, Matrices, Arrays) and render them as interactive SVGs. Includes a Whitespace Inspector to flag presentation errors (trailing spaces).
- **Mistake Notebook & Flash Quiz** — The AI diagnoses wrong answers (WA/TLE) and records lessons to `mistakes.md`. Revise them anytime with AI-generated 3-question multiple-choice quizzes.
- **Stress Tester & Lab** — Auto-write test generators and brute-force reference solutions to catch hidden boundary bugs and profile time/memory complexity.
- **Editor** — CodeMirror 6 with syntax highlighting, auto-pairing, auto-indent, block Tab, and Tab snippets:
  `fastio`, `fori`, `forj`, `rep`, `forn`, `pb`, `eb`, `all`, `vi`, `vll`, `vvi`, `pii`,
  `pll`, `ll`, `ld`, `sortv`, `mod`, `inf`, `readn`, `yes`, `no`, `main`.
- **Judge Console** — Verdict chips (AC/WA/CE/RE/TLE/MLE), runtime metrics, line-numbered stdin/stdout/expected, and Output/Compile/Diff tabs.
- **Image → Statement → Tests** — Paste screenshots or upload PDFs; local OCR extracts the statement, AI summary auto-fills problem metadata, and AI test-case generation suggests edge cases.
- **USACO File Mode** — Support USACO `freopen` inputs and outputs seamlessly with matching filename validations.
- **History Timeline** — Review and restore code from previous runs using full-context history logs.
- **Focus Timer** — Customizable Pomodoro timer (15/25/45/90 presets) to simulate pressure.

---

## Quick start

```bash
git clone https://github.com/<your-username>/usaco-ide-2.git
cd usaco-ide-2
```

Requirements: **Node.js ≥ 18** (https://nodejs.org) and a **C++ compiler** (`g++`).
- On Windows the easiest is **MinGW-w64** (e.g. via [winlibs.com](https://winlibs.com)
  or MSYS2). Make sure `g++ --version` works in a terminal, or set the full path
  to `g++.exe` in the in-app **Settings** tab.
- On macOS: `xcode-select --install` (clang's `g++` shim works) or `brew install gcc`.
- On Linux: `sudo apt install g++` (or your distro's equivalent).

### Windows
Double-click **`launcher/start-usaco-ide.bat`** (or run `launcher/start-usaco-ide.ps1`
with PowerShell). The launcher:
- checks Node.js is installed and **≥ 18**,
- detects whether port `5050` is free, already serving USACO IDE (then it just opens
  the browser), or **occupied by another app** (then it tells you how to switch ports),
- runs `npm install` automatically on first launch,
- starts the backend and opens your default browser at `http://127.0.0.1:5050`.

### macOS / Linux
```bash
bash launcher/start-usaco-ide.sh
```

### Manual (any OS)
```bash
npm run setup   # installs backend deps (first time only)
npm start       # then open http://127.0.0.1:5050
```

On first run with an empty workspace the app **seeds a sample problem**
(*Tổng hai số · Sum of Two Numbers*, complete with a working solution and 3 test
cases) so you can press **Run** and **Judge All** immediately to verify your
compiler setup. Delete it whenever you like.

### Create a desktop shortcut
1. Right-click `launcher/start-usaco-ide.bat` → **Send to → Desktop (create shortcut)**.
2. Rename it to `USACO IDE 2.0`.
3. (Optional) Right-click the shortcut → **Properties → Change Icon…** and pick an icon.

Double-clicking that shortcut now launches the app.

---

## Using the app

Three-column desktop layout:

- **Left — Problems**: search, filter by source/status/difficulty, create, duplicate,
  delete, and see each problem's last verdict + last-edited time.
- **Middle — Editor**: the C++ editor with autosave and metadata. Shortcuts:
  - `Ctrl+S` — save
  - `Ctrl+Enter` — Run (compile + run against the custom Input)
  - `Ctrl+Shift+Enter` — Judge All (run every test case)
  - `Ctrl+N` — new problem
- **Right — Run Console** with six tabs:
  - **Run** — *Custom Test* (Input + Expected + Run + Save as test) over *Result*
    (big verdict, runtime, stdout, stderr, simple diff on WA).
  - **Tests** — the test suite as cards (name, preview, status, Run / Edit / Delete)
    plus **✨ Generate with AI**.
  - **Statement** — paste the problem statement; Save / Clear / Generate Test Cases.
  - **Notes**, **History**, **Settings**.

**Run** uses the custom `Input` (and optional `Expected`) in the Run tab.
**Judge All** runs every test case under `tests/` and reports AC / WA / CE / RE / TLE.

### Verdicts
| Verdict | Meaning |
|---------|---------|
| **AC**  | Accepted — output matches expected |
| **WA**  | Wrong Answer |
| **CE**  | Compile Error |
| **RE**  | Runtime Error (non-zero exit / crash) |
| **TLE** | Time Limit Exceeded |
| **MLE** | Memory Limit (reserved — colored throughout) |

Output comparison ignores trailing spaces and the final newline by default
(**loose** mode); switch to **strict** in Settings for exact matching.

### Compiler not found?
If `g++` isn't installed or on PATH you'll see:
> Không tìm thấy g++. Hãy cài MinGW hoặc cấu hình đường dẫn compiler trong Settings.

Set the full path to `g++.exe` in **Settings → Compiler** and click **Check compiler**.

---

## AI test generation

USACO IDE 2.0 can generate test cases from a pasted problem statement using any
**OpenAI-compatible** API.

### 1. Add your API key
Open **Settings → AI test generation** and fill in:
- **API key** — your provider key. Click **Show/Hide** to reveal it while typing.
  The key is stored locally in `data/ai-settings.json` and is **never logged or
  committed**. The UI only ever shows whether a key is set, not the key itself.
- **Base URL** — e.g. `https://api.openai.com/v1` (default), or any compatible endpoint.
- **Model** — e.g. `gpt-4.1-mini`.

Click **Save AI settings**, then **Test connection** to confirm it works.
If no key is set, any AI action tells you: *“Bạn cần nhập API key trong Settings trước.”*

### 2. Get the statement in (text or image/PDF)
Go to the **Statement** tab and either type/paste the problem (Markdown), or:
- **📋 Paste** a screenshot from the clipboard, or paste it (Ctrl+V) into the box, or
- **⤴ Image/PDF** to upload a `png/jpg/webp` or a `pdf`.

Images are OCR'd by your AI model (vision); PDFs/Docs use **MarkItDown** (`pip install
markitdown[all]`). The result fills the Statement (stored in `statement.md`).

Click **🔎 Analyze** to get an AI summary + likely techniques and auto-fill empty
metadata (source / difficulty / tags).

### 3. Generate test cases
Click **✨ Generate Test Cases** (in the Statement or Tests tab). The AI produces a mix
of: sample tests from the statement, small/large boundary cases, corner cases, and tests
that catch common mistakes.

A preview dialog opens where you can:
- check/uncheck which tests to keep,
- **edit name / input / expected** before saving,
- read each test's *reason*.

Click **Apply selected** to write them into `tests/` (tagged `AI`).

### ⚠ Important about correctness
The AI may be **wrong about expected output**. When it is not confident it marks a test
**NO EXPECTED** (input-only) and adds a warning note instead of guessing. **Always review
and edit AI tests before applying**, and re-run a known-good solution to confirm the
expected outputs.

### Hints (no spoilers)
The **focus timer** (top bar) offers a hint when time runs out, or you can trigger it any
time. Hints come in three levels — *nudge → technique → approach* — and never reveal the
full solution or code.

---

## AI Contest Generator

Once you've solved enough problems on a topic (default **15**, status *solved* or last
verdict *AC*, matched on a problem's `topic` or any tag), the **🏆 Contests** button in the
top bar lets the AI build you a brand-new practice contest on that topic.

Click **🏆 Contests → + Tạo contest**, pick a topic, and the **readiness** panel shows how
many solved problems back it. Choose **5–7** problems and a rating range, then **Generate
with AI**. The backend prompts a strict *contest setter*: it creates fully original problems
(it is shown your solved problems **only** to gauge level and avoid overlap — never to
clone), ratings strictly increasing and **below 2000**, each with a statement, input/output
format, constraints, samples, and **verified** tests. Every expected output must be
recomputed; when the model is not certain it leaves the test out rather than fabricating an
answer, and the contest lists those as warnings.

Contests live in their **own** space (`workspace/contests/<id>/`) — they are never mixed
into the Problem Explorer. Open a contest to read each problem, write C++, and **Run /
Judge** it like a normal problem. Everything persists to disk, so reloading the browser
keeps your contests and submissions. AI is only ever called when you click **Generate** —
opening the tab spends nothing. Generation needs an API key (same one as test generation);
without it you get a friendly error, not a crash.

---

## USACO file mode (freopen)

Some judges (USACO) read/write named files instead of stdin/stdout. In **Edit info**, set
a **File name** (e.g. `milk`) and turn on **USACO file mode**. Then code using
`freopen("milk.in","r",stdin); freopen("milk.out","w",stdout);` is judged correctly —
the backend feeds `milk.in` and reads `milk.out`. The editor warns if your `freopen`
filename doesn't match the configured one.

---

## Importing from the old DSA Tracker

In **Settings → Import**, choose a JSON export from the old app. The importer reads
`judgeData.problems`, `judgeData.attempts`, and `judgeData.testCases`, then creates one
problem folder per problem:

- Latest attempt's code → `main.cpp` (or the default template if missing).
- `testCases` → `tests/NN.in` / `tests/NN.out`.
- Missing fields are filled with safe defaults (it won't crash on partial data).

After import everything lives in USACO IDE 2.0 — there is no "Judge Lab" concept.

---

## Project structure

```
usaco-ide-2/
  launcher/            # launchers: .bat / .ps1 (Windows), .sh (macOS/Linux)
  backend/             # Node.js + Express API + g++ judge
    server.js
    src/
      config.js        # paths, defaults, limits
      fileStore.js     # safe filesystem helpers
      problemStore.js  # problem folders, meta.json, tests, history
      runCpp.js        # compile / run / compare (TLE/RE/CE/WA/AC)
      ai.js            # OpenAI-compatible client: tests, OCR (vision), analysis, hints
      markitdown.js    # PDF/DOCX → Markdown via the MarkItDown Python module
      settingsStore.js # app settings + AI settings (key never logged)
      routes/          # problems, files, judge, settings, import, ai
    scripts/markitdown_convert.py
  frontend/            # vanilla ES-module desktop UI (no build step)
    index.html
    src/               # main, api, editor, highlight, linenums, problems, testcases,
                       #   runner, statement, notes, timer, hints, layout, settings
    styles/main.css
  workspace/
    problems/<id>/     # main.cpp, input.txt, expected.txt, notes.md, statement.md,
                       #   meta.json, history.json, tests/{NN.in, NN.out, meta.json}
  data/settings.json   # app settings (created on first run; gitignored)
  data/ai-settings.json# AI key/baseUrl/model (gitignored; created when you save)
  data/*.example.json  # committed templates for the two files above
  .github/workflows/   # CI — backend test suite on Ubuntu + Windows, Node 18/20/22
```

### Configuration files
| File | Committed? | Purpose |
|------|------------|---------|
| `data/settings.example.json` | ✅ | template — compiler path, limits, compare mode |
| `data/ai-settings.example.json` | ✅ | template — AI provider, base URL, model |
| `data/settings.json` | ❌ gitignored | your real app settings (auto-created on first run) |
| `data/ai-settings.json` | ❌ gitignored | **your real API key — never commit this** |
| `workspace/` | ❌ gitignored | your problems, contests, run history, compile cache |

You never need to create these by hand: the app writes `data/settings.json` with
defaults on first run, and `data/ai-settings.json` when you save AI settings in the
UI. The `.example` files only document the format.

Each problem is a self-contained folder, so your data is just files on disk — easy to
back up, diff, or edit by hand. Reloading the app never loses anything.

### Backend API
```
GET    /api/health
GET    /api/problems            POST /api/problems
GET    /api/problems/:id        PUT  /api/problems/:id      DELETE /api/problems/:id
POST   /api/problems/:id/duplicate
GET/PUT /api/problems/:id/code | input | expected | notes | statement
GET    /api/problems/:id/tests  POST /api/problems/:id/tests
PUT    /api/problems/:id/tests/:testId   DELETE /api/problems/:id/tests/:testId
GET    /api/problems/:id/history          # run snapshots (code + stdout/stderr)
POST   /api/problems/:id/run    POST /api/problems/:id/judge
GET/PUT /api/settings           GET /api/settings/compiler
GET/PUT /api/settings/ai        POST /api/ai/test-connection   POST /api/ai/generate-tests
GET    /api/ai/capabilities     POST /api/ai/ocr   POST /api/ai/analyze   POST /api/ai/hint
POST   /api/import

# AI Contest Generator (separate domain — workspace/contests/)
GET    /api/contests
GET    /api/contests/readiness?topic=greedy          # eligible solved count + rating range
POST   /api/contests/generate                        # { topic, problemCount, minRating, maxRating, force }
GET    /api/contests/:cid       DELETE /api/contests/:cid
GET/PUT /api/contests/:cid/problems/:pid             GET /api/contests/:cid/problems/:pid/statement
GET/PUT /api/contests/:cid/problems/:pid/code | input | expected
GET    /api/contests/:cid/problems/:pid/tests        POST /api/contests/:cid/problems/:pid/tests
PUT    /api/contests/:cid/problems/:pid/tests/:testId  DELETE /api/contests/:cid/problems/:pid/tests/:testId
POST   /api/contests/:cid/problems/:pid/run          POST /api/contests/:cid/problems/:pid/judge
GET    /api/contests/:cid/problems/:pid/history
```

> AI features are optional. PDF/Doc OCR additionally needs `pip install markitdown[all]`;
> image OCR works through your configured multimodal model (e.g. Gemini, GPT-4o).

---

## Tech stack & engineering notes

- **Backend** — Node.js + Express, a single runtime dependency. File-per-problem
  storage (no database): every problem is a plain folder you can back up, diff, or
  edit by hand.
- **Judge** — real `g++` compile + run with TLE/RE/CE/WA/AC verdicts, compile
  caching + precompiled headers (~9× faster re-runs), loose/strict/token/float
  output comparison, and per-problem special judges (`checker.cpp`).
- **Frontend** — vanilla ES modules, no build step, no framework. CodeMirror 6 is
  vendored locally so the app works fully offline.
- **AI layer** — optional, OpenAI-compatible, disk-cached, cancellable, and
  rate-limit aware (model fallback with backoff). The app is fully usable with no
  API key.
- **Tests** — 76 unit tests (`node --test`, zero test dependencies) covering the
  grader, progress/XP engine, skill map, AI prompt contracts, and first-run seeding.
  CI runs them on Ubuntu + Windows across Node 18/20/22.

## Notes & safety
- **Local only.** The server binds to `127.0.0.1`. It compiles and runs arbitrary C++
  on your machine — never expose it to the public internet.
- Builds happen in an isolated OS temp directory, so the workspace stays clean.
- Default port is `5050` (override with the `USACO_IDE_PORT` env var — the launchers
  pick it up too).
- Your API key lives only in `data/ai-settings.json` (gitignored) and is never
  logged; the UI only ever reports *whether* a key is set.

## Running tests
```bash
npm test          # from the repo root (proxies to backend)
```

## Contributing
Issues and PRs are welcome. Keep the spirit of the project: local-first, zero
build step, no heavyweight dependencies. Run `npm test` before submitting.

## License
[MIT](LICENSE) © 2026 Ho Thien Phuc
