# Troubleshooting

## Compiler

**"Không tìm thấy g++ / g++ not found."**
- Confirm `g++ --version` works in a terminal.
- If installed but not on `PATH`, paste the full path to `g++.exe` (or `g++`) in
  **Settings → Compiler** and click **Check compiler**.
- Windows: install MinGW-w64 (winlibs.com or MSYS2). Restart the launcher after changing
  `PATH`.

**Compiles in a terminal but not in the app.** The app uses the compiler path from Settings
(default `g++`). Make sure that exact command resolves for the user running the server.

## Port already in use

Default port is **5050**. Override it:
```bash
USACO_IDE_PORT=5099 npm start      # macOS/Linux
```
On Windows, set `USACO_IDE_PORT` in the environment (the launchers read it). The Competitive
Companion listener uses **10043** — set `USACO_COMPANION_PORT=0` to disable it if it clashes.

## "Không kết nối được backend"

The frontend can't reach the server. Make sure the backend is running (the launcher window /
terminal should show `Backend ready: http://127.0.0.1:5050`). If you opened a stale browser
tab, reload it.

<a name="ocr"></a>
## Image OCR

**"OCR cục bộ chưa sẵn sàng."** Image OCR runs locally via Tesseract:
```bash
pip install pytesseract pillow
```
plus the engine: Windows `winget install UB-Mannheim.TesseractOCR`, macOS
`brew install tesseract`, Linux `sudo apt install tesseract-ocr`.

**Vietnamese comes out garbled.** Install the `vie` language data
(`sudo apt install tesseract-ocr-vie`, or tick it in the Windows installer). With an AI key,
the post-OCR cleanup pass also restores diacritics.

**"không đọc được chữ nào."** The image is too blurry / low-contrast. Re-screenshot at higher
resolution; the app upscales small images but can't read text that isn't there.

## PDF / DOCX import

**"MarkItDown không trích được nội dung."** Install it: `pip install markitdown[all]`. Scanned
PDFs (images of text) may extract nothing — screenshot the pages and use image OCR instead.

<a name="ai"></a>
## AI

- **"API key bị từ chối."** The provider rejected the key — re-check it in **Settings → AI**
  (and the Base URL). Use **Detect** to auto-fill the right base URL for your key.
- **"Hết hạn mức / 429."** Rate-limited or out of quota. Add one or more **Fallback models**
  in Settings and the app rolls over automatically; or wait and retry.
- **"Không tìm thấy model (404)."** The **Model** name doesn't exist at that **Base URL**.
- **AI features do nothing / ask for a key.** They're optional — add a key in Settings to
  enable them. Everything else (judge, Lab, Visualizer) works without one.

## Editor looks plain

If CodeMirror fails to load, the editor falls back to a basic textarea (the language pill
shows **C++17 · plain**). Save / compile / judge still work fully.

## Data & reset

- Your problems live in `workspace/` as plain folders — back them up by copying that folder.
- To reset the app's settings, delete `data/settings.json` (it's recreated with defaults).
- To re-show the first-run welcome, clear the browser's local storage for the app.

Still stuck? Open an issue (see [CONTRIBUTING.md](../CONTRIBUTING.md)) with the backend
console output and your OS / Node / g++ versions.
