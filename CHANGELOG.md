# Changelog

All notable changes to USACO IDE 2.0 are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-06-13

First public release. The 2.0 engine (local `g++` judge, file-per-problem storage, AI layer)
was prepared for public use with a focus on ease of use, a clean first impression, and an
editor-first workflow.

### Added
- **First-run welcome / setup card** — shown once, with live checks for the `g++` compiler
  and the (optional) AI API key, plus a concise explainer of the main workflow.
- **Editor-first startup** — the app now reopens your **last problem** (or the most recent
  one) on launch instead of a dashboard. The Journey home is one click away via the 🏠 chip.
- **Friendly AI error messages** — rejected key / exhausted quota / wrong model now produce
  clear, actionable messages (with the provider's raw text kept for debugging).
- **Documentation package** — full `README`, a `docs/` guide set (Getting Started, AI
  Configuration, Problem Import, Test Generation, Local Judge, Shortcuts, Troubleshooting),
  `CONTRIBUTING`, `ROADMAP`, and a release checklist.
- `.env.example` documenting the optional port/host environment variables.

### Changed
- **Post-AC tools relocated** — *Explain Your Solution* (🎓) and *Harder variant* (📈) moved
  from a celebration banner into the editor toolbar, revealed only once a problem is solved.
- **AC Defense → "Explain Your Solution"** — renamed and de-gamified: it now checks your
  understanding of your own code without XP rewards or a graded framing.
- **Gamification demoted** — XP/level-up/confetti celebrations on judging are disabled; the
  Journey streak/XP/quests remain available but secondary.
- Renamed internal stylesheets `v25.css → theme.css` and `v30.css → polish.css`.
- README now accurately documents **local Tesseract image OCR** (previously mis-described as
  AI-vision OCR) and its install requirements.

### Removed
- **Flash Quiz** — folded back into the Mistake Notebook it was derived from.
- The "you've solved N problems — make a contest" celebration banner.
- A stale committed Python bytecode artifact (`__pycache__/*.pyc`); `__pycache__/` and
  `*.pyc` are now gitignored.

### Notes
- MLE remains reserved but **not enforced** (see [docs/LocalJudge.md](docs/LocalJudge.md)).
- The AI **Editorial** generator is retained for AI-generated contest problems and is no
  longer surfaced on user-imported problems.

### Engineering (pre-1.0 → 2.0 highlights)
- Loopback-only `Host`-header guard (DNS-rebinding protection); atomic file writes;
  per-problem write locks.
- Parallel judge pool with serial TLE re-confirmation; Run/Judge cancellation; per-problem
  special judges (`checker.cpp`); LCS-aligned WA diff.
- Compile cache + precompiled headers; bundled one-request problem open; bulk `.in/.out`
  import; personal code template.
- Vendored CodeMirror 6 + fonts (fully offline).
- Backend test suite (`node --test`) on CI across Ubuntu + Windows, Node 18/20/22.

[2.0.0]: https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/releases/tag/v2.0.0
