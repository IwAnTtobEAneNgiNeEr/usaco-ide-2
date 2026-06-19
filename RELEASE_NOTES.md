# USACO IDE 2.0

**A local-first C++ IDE and judge for competitive programming** — write C++, judge against
many test cases with a real local `g++`, stress-test against a brute force, visualize your
inputs, and (optionally) get an AI coach. No account, no cloud, runs offline.

## Highlights

- ⚖️ **Real `g++` judge** — AC / WA / CE / RE / TLE, runtime metrics, side-by-side diff,
  loose/strict/token/float comparison, per-problem special judges, compile caching + PCH.
- 🧪 **Stress Lab** — auto- or hand-write a generator + brute force and find the boundary bug
  that an online judge would WA you on.
- 🔬 **Input Visualizer** — render a test as a graph / tree / grid / matrix / array.
- 🤖 **AI Coach (optional)** — context-aware chat, non-spoiler hints, WA diagnosis, test
  generation, and an AI Contest Generator. Works with any OpenAI-compatible key; fully usable
  without one.
- 📥 **Flexible import** — type, paste a **screenshot** (local OCR), or upload a **PDF**.
- 🗂️ **Your data is just files** — every problem is a plain folder you can back up and diff.

## Getting started

1. Install **Node.js ≥ 18** and a **C++ compiler** (`g++`).
2. Clone, then on Windows double-click `launcher/start-usaco-ide.bat` (macOS/Linux:
   `bash launcher/start-usaco-ide.sh`).
3. The app seeds a sample problem so you can press **Run** / **Judge All** right away.

Full docs: [`docs/GettingStarted.md`](docs/GettingStarted.md). AI setup is optional —
[`docs/AIConfiguration.md`](docs/AIConfiguration.md).

## What's new in 2.0 (public release)

- Editor-first startup (reopens your last problem); a one-time welcome/setup card.
- Post-AC tools moved into the editor toolbar; *AC Defense* reworked into *Explain Your
  Solution* (no XP gimmick); gamification demoted to an optional Journey home.
- Friendly AI error messages; corrected docs (local Tesseract OCR); full `docs/` package.

See [CHANGELOG.md](CHANGELOG.md) for the complete list.

## Requirements & notes

- Optional features need extra tools: image OCR → `pip install pytesseract pillow` + the
  Tesseract engine; PDF import → `pip install markitdown[all]`; AI → an API key in Settings.
- **Local only.** The server binds to `127.0.0.1` and compiles/runs arbitrary C++ — never
  expose it to the internet.
- MLE is reserved but not enforced; Electron packaging is experimental.

## License

[MIT](LICENSE) © 2026 Ho Thien Phuc
