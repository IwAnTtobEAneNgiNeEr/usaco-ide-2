# Getting Started

A 5-minute tour from install to your first **AC**.

## 1. Install the essentials

- **Node.js ≥ 18** — check with `node --version`.
- **A C++ compiler** — check with `g++ --version`. If it's missing:
  - **Windows:** install MinGW-w64 ([winlibs.com](https://winlibs.com) or MSYS2), then make
    sure `g++` is on your `PATH`, or paste the full path to `g++.exe` in **Settings → Compiler**.
  - **macOS:** `xcode-select --install` (or `brew install gcc`).
  - **Linux:** `sudo apt install g++`.

Optional (only for AI / image / PDF features) — see
[ProblemImport.md](ProblemImport.md) and [AIConfiguration.md](AIConfiguration.md).

## 2. Launch

| OS | How |
|----|-----|
| Windows | double-click `launcher/start-usaco-ide.bat` |
| macOS / Linux | `bash launcher/start-usaco-ide.sh` |
| Any | `npm run setup` (first time) then `npm start` |

The first launch runs `npm install` automatically, then opens
`http://127.0.0.1:5050`. On first run the app **seeds a sample problem** so you can verify
your compiler immediately.

When the app opens you'll land **in the editor** on your most recent problem (the seeded
sample on a fresh install). The 🏠 chip in the top bar opens the optional Journey home.

## 3. Verify the judge

1. Open the seeded **Sum of Two Numbers** problem.
2. Press **Run** (`Ctrl+Enter`) — it compiles `main.cpp` and runs it against the *Run* tab's
   input. You should see `5` for input `2 3`.
3. Press **Judge All** (`Ctrl+Shift+Enter`) — it runs every test in `tests/` and reports
   AC / WA / CE / RE / TLE.

If you see a "g++ not found" message, open **Settings → Compiler**, set the path, and click
**Check compiler**.

## 4. Create your own problem

1. **New problem** (`Ctrl+N`) → give it a title.
2. Open the **Problem** view (top of the editor) and add the statement: type it, **paste a
   screenshot** (`Ctrl+V`), or upload a **PDF**. See [ProblemImport.md](ProblemImport.md).
3. Add tests in the **Tests** tab — by hand, by **importing `.in`/`.out` files** (drag a
   downloaded test folder onto the tab), or with **✨ Generate with AI**
   ([TestGeneration.md](TestGeneration.md)).
4. Write your solution, **Judge All**, iterate.

## 5. Tools that make you faster

- **🧪 Lab** — stress-test against a brute force to catch boundary bugs. See
  [LocalJudge.md](LocalJudge.md#stress-lab).
- **🔬 Viz** — visualize a test's structure (graph/tree/grid).
- **🤖 Coach** tab — ask about the open problem; highlight code + `Ctrl+Shift+E` to ask
  about a selection.
- **📕 Mistake Notebook** — after repeated WA, get an AI diagnosis of the *thinking* error.

Next: [Shortcuts.md](Shortcuts.md) · [Troubleshooting.md](Troubleshooting.md).
