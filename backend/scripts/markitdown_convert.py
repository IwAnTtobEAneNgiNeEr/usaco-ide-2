#!/usr/bin/env python
"""Convert a document (PDF/DOCX/PPTX/HTML/...) to Markdown using MarkItDown.

Usage:  python markitdown_convert.py <path>
Prints the Markdown text to stdout. Exits non-zero with a message on stderr.
"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: markitdown_convert.py <path>\n")
        sys.exit(2)
    try:
        from markitdown import MarkItDown
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("markitdown_not_installed: %s\n" % exc)
        sys.exit(3)
    try:
        md = MarkItDown()
        result = md.convert(sys.argv[1])
        sys.stdout.write(result.text_content or "")
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("convert_failed: %s\n" % exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
