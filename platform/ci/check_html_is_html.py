#!/usr/bin/env python3
"""Fail if a `.html` file under ventures/ holds source code, not markup.

A converter that writes TSX next to its HTML input can overwrite the input
(two retail-pilot-intel reports were found this way, byte-identical to their
TSX pages). Pages is served from these files, so a visitor would see source
text. A real page starts with `<` after any BOM, whitespace and comments.

    python3 platform/ci/check_html_is_html.py [--root DIR]   # exit 1 if any
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"node_modules", ".git", "dist", "build", ".next"}


def looks_like_markup(s):
    return s.lstrip("﻿ \t\r\n").startswith("<")


def bad_files(root):
    for f in sorted(Path(root).rglob("*.html")):
        if SKIP & set(f.parts):
            continue
        if not looks_like_markup(f.read_text(encoding="utf8", errors="replace")):
            yield f


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    a = ap.parse_args(argv)
    bad = list(bad_files(a.root))
    for f in bad:
        print(f"{f}: .html file does not start with markup")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
