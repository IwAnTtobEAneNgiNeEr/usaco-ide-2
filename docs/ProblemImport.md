# Problem Import

Three ways to get a statement into a problem, in the **Problem** view of the editor.

## 1. Type or paste text

Just type/paste Markdown into the statement box and **Save**. KaTeX-style `$…$` math and
fenced code blocks render in the read view.

## 2. Paste a screenshot (local OCR)

Click **📋 Paste** (or press `Ctrl+V` in the statement box) to OCR an image from your
clipboard. This runs **entirely on your machine** via Tesseract — no network, no AI needed
to read the pixels.

**Requirements for image OCR:**
```bash
pip install pytesseract pillow
```
…plus the Tesseract engine itself:
- **Windows:** `winget install UB-Mannheim.TesseractOCR`
- **macOS:** `brew install tesseract`
- **Linux:** `sudo apt install tesseract-ocr`

For Vietnamese statements, also install the `vie` language data (the Windows installer
offers it; on Linux: `sudo apt install tesseract-ocr-vie`). Without it, accented text may be
inaccurate (the app warns you).

> If an AI key is set, the raw OCR text gets a quick **AI cleanup pass** (restore diacritics,
> fix obvious glitches). Without a key, you get the raw OCR text — still editable.

## 3. Upload a PDF / DOCX

Click **⤴ Image / PDF** and pick a `pdf`, `png`, `jpg`, or `webp`. Documents are converted
with **MarkItDown**:
```bash
pip install markitdown[all]
```

## After import

- **🔎 Analyze** (needs an AI key) summarizes the problem, guesses likely techniques, and
  auto-fills empty metadata (source / difficulty / tags).
- **✨ Generate test cases** — see [TestGeneration.md](TestGeneration.md).

## Competitive Companion

The backend also listens on port **10043** for the
[Competitive Companion](https://github.com/jmerle/competitive-companion) browser extension —
send a problem from Codeforces/AtCoder/etc. and it's created as a new problem with samples.
Set `USACO_COMPANION_PORT=0` to disable.

## Where it's stored

The statement is saved to `workspace/problems/<id>/statement.md` — a plain file you can edit
in any editor.

Troubleshooting OCR: [Troubleshooting.md](Troubleshooting.md#ocr).
