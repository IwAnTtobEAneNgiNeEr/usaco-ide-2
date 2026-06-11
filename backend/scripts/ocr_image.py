#!/usr/bin/env python
"""Local OCR for an image using Tesseract (pytesseract + Pillow).

Usage:  python ocr_image.py <image_path>
Prints recognized UTF-8 text to stdout. Exits non-zero with a reason on stderr:
  3 = Pillow missing, 4 = pytesseract missing, 5 = Tesseract engine missing,
  1 = other failure.
No AI / network is used — this runs entirely on the local machine.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def _tesseract_in_path(pytesseract_mod):
    import shutil
    return shutil.which(pytesseract_mod.pytesseract.tesseract_cmd) is not None


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: ocr_image.py <image_path>\n")
        sys.exit(2)
    path = sys.argv[1]

    try:
        from PIL import Image, ImageOps, ImageFilter
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("pillow_not_installed: %s\n" % exc)
        sys.exit(3)
    try:
        import pytesseract
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("pytesseract_not_installed: %s\n" % exc)
        sys.exit(4)

    # On Windows, pytesseract may not find tesseract even when installed because
    # the PATH change hasn't propagated to this process. Try known install locations.
    if sys.platform == "win32" and not _tesseract_in_path(pytesseract):
        for candidate in [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]:
            import os
            if os.path.isfile(candidate):
                pytesseract.pytesseract.tesseract_cmd = candidate
                break

    try:
        img = Image.open(path)
        # Light preprocessing helps on screenshots: grayscale + autocontrast + upscale small images.
        img = ImageOps.exif_transpose(img).convert("L")
        img = ImageOps.autocontrast(img)
        if min(img.size) < 1000:
            scale = max(1, int(1600 / max(1, min(img.size))))
            if scale > 1:
                img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
        img = img.filter(ImageFilter.SHARPEN)
        # Choose the language from what's actually installed: prefer eng+vie, but
        # only request 'vie' when its traineddata exists (otherwise Tesseract errors).
        # If Vietnamese is missing, warn on stderr (non-fatal) so the backend knows
        # accented text may come out wrong.
        lang = "eng"
        try:
            installed = set(pytesseract.get_languages(config=""))
            langs = [l for l in ("eng", "vie") if l in installed]
            if langs:
                lang = "+".join(langs)
            if "vie" not in installed:
                sys.stderr.write("warn_no_vie: Vietnamese traineddata not installed; accented text may be inaccurate.\n")
        except Exception:  # noqa: BLE001
            lang = "eng+vie"  # best effort; image_to_string falls back below
        try:
            text = pytesseract.image_to_string(img, lang=lang)
        except pytesseract.TesseractError:
            text = pytesseract.image_to_string(img)
        sys.stdout.write(text or "")
    except pytesseract.TesseractNotFoundError as exc:
        sys.stderr.write("tesseract_engine_not_found: %s\n" % exc)
        sys.exit(5)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("ocr_failed: %s\n" % exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
