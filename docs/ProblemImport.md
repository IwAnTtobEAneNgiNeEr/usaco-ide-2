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
in any editor. This file is the canonical source for backend analysis and
statement-sample trust. `statement.en.md` and `statement.vi.md` hold language
variants; `meta.json.statementSourceLanguage` is `en`, `vi`, or empty for legacy
unknown language. Changing the reading language saves only a translation variant,
never the canonical source. Explicit source edits update the canonical file and
invalidate the old translation; edits to a translation stay in its variant.
Analysis from the statement view uses the source text, even while reading a translation.

Empty/malformed translation responses and changed fenced blocks are rejected.
These checks cannot prove translation accuracy; the source remains available.
Legacy data is read without a bulk migration. A historically overwritten original
cannot be reconstructed by this fix: recover it only from an independently reviewed
backup, with a separate recovery task. Language inference for metadata without a
source language remains a heuristic, especially for unaccented or other-language text.

Troubleshooting OCR: [Troubleshooting.md](Troubleshooting.md#ocr).
