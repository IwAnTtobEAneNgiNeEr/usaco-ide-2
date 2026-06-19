# Release Checklist

Run through this before tagging a public release. Commands assume the repo root.

## 1. Build & dependencies
- [ ] `node --version` ≥ 18.
- [ ] `npm run setup` completes cleanly (backend deps install).
- [ ] `git status` is clean except intended changes; no `data/ai-settings.json`,
      `data/settings.json`, `workspace/`, `__pycache__/`, or `node_modules/` staged.
- [ ] `git ls-files | grep -E "ai-settings.json$|/settings.json$|__pycache__|\.pyc$"`
      returns **nothing** (secrets/artifacts not tracked).

## 2. Tests
- [ ] `npm test` → **all passing** on this machine.
- [ ] CI green on GitHub Actions (Ubuntu + Windows, Node 18/20/22).

## 3. Local judge
- [ ] `npm start`, open `http://127.0.0.1:5050`.
- [ ] Compiler pill shows **g++ ✓** (or configure the path in Settings → Compiler).
- [ ] Seeded sample: **Run** → `5`; **Judge All** → all AC.
- [ ] Force a WA (break the code) → diff renders; verdict chip correct.
- [ ] ⏹ Stop cancels a long judge without polluting history.
- [ ] Special judge: enable SPJ on a problem, edit `checker.cpp`, judge passes.

## 4. OCR / import (optional features)
- [ ] With Tesseract installed: paste a screenshot → statement text appears.
- [ ] Without Tesseract: the error names the exact fix (no crash).
- [ ] With MarkItDown: upload a PDF → statement text appears.
- [ ] Competitive Companion (port 10043) creates a problem from the extension (if used).

## 5. AI (optional, needs a key)
- [ ] Settings → AI → **Detect** fills provider/base URL/model; **Test connection** OK.
- [ ] Invalid key → friendly "API key bị từ chối" message (not a raw stack/vendor dump).
- [ ] Generate tests → preview opens; NO-EXPECTED cases flagged.
- [ ] Coach chat streams a reply; ⏹ Stop aborts mid-stream.
- [ ] No key set → AI actions show the "add a key" message, app stays usable.

## 6. First-run & UX
- [ ] Clear local storage → welcome card shows once, with live g++/AI checks.
- [ ] After dismiss, startup opens the last/most-recent problem (not the Journey home).
- [ ] No console errors on load (`F12` console).
- [ ] Greeting on the Journey home is generic ("bạn"), not a hardcoded name.

## 7. Launcher / desktop
- [ ] `launcher/start-usaco-ide.bat` (Windows) and `start-usaco-ide.sh` (macOS/Linux) both
      boot the app and open the browser.
- [ ] `USACO_IDE_PORT=5099 npm start` respects the override.
- [ ] (Optional) `desktop/`: `npm start` opens the Electron window; note that `npm run dist`
      packaging is experimental.

## 8. GitHub readiness
- [ ] README renders correctly; replace `<your-username>` placeholders with the real repo.
- [ ] CI badge points at the real workflow and is green.
- [ ] Screenshots / demo GIF added under `docs/media/` and linked in the README.
- [ ] `LICENSE`, `CONTRIBUTING.md`, `ROADMAP.md`, `CHANGELOG.md` present and current.
- [ ] `.env.example` present; **no** real `.env` committed.

## 9. Tag & publish
- [ ] Update `CHANGELOG.md` with the release date.
- [ ] `git tag -a v2.0.0 -m "USACO IDE 2.0"` and push the tag.
- [ ] Create the GitHub Release from the tag using `RELEASE_NOTES.md`.
- [ ] (Optional) attach a Windows installer/portable build from `desktop/`.
