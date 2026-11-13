#!/usr/bin/env python3
"""Fail if an `<svg role="img">` in a venture page has no accessible name.

A role="img" SVG with no `aria-label`, `aria-labelledby` or `<title>` child is
announced as just "image". A page's script-built SVGs count too, because the
tag text sits in the page source.

    python3 platform/ci/check_svg_names.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SVG = re.compile(r"<svg\b([^>]*)>(.{0,400})", re.S | re.I)
ROLE = re.compile(r"""role\s*=\s*["']img["']""", re.I)
NAMED = re.compile(r"aria-label(?:ledby)?\s*=", re.I)


def unnamed_svgs(text: str):
    """Return the first 80 characters of each unnamed role=img svg tag."""
    out = []
    for m in SVG.finditer(text):
        attrs, after = m.groups()
        if ROLE.search(attrs) and not NAMED.search(attrs) and not re.match(r"\s*<title\b", after, re.I):
            out.append(m.group(0)[:80])
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if not {"node_modules", ".next"}.isdisjoint(page.parts):
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        found = unnamed_svgs(text)
        if found:
            bad += 1
            print(f"{page}: {len(found)} unnamed svg(s), first {found[0]!r}")
    print(f"{pages} pages, {bad} with an unnamed role=img svg")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
