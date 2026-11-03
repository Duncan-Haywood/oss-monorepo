#!/usr/bin/env python3
"""Fail if a venture page links to an in-page `#anchor` that has no matching id.

A `href="#pricing"` with no `id="pricing"` does nothing when clicked. Bare `#`
and `#top` are skipped (the browser scrolls to the top for both), as are
anchors in pages that build ids with script (`${...}`, `{{...}}` templates).

    python3 platform/ci/check_page_anchors.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HREF = re.compile(r'\bhref\s*=\s*["\']#([^"\'\s]+)["\']', re.I)
IDS = re.compile(r'\bid\s*=\s*["\']([^"\']+)["\']|<a\b[^>]*\bname\s*=\s*["\']([^"\']+)["\']', re.I)


def missing(text: str):
    """Return the sorted in-page anchors in `text` with no id or name target."""
    ids = {a or b for a, b in IDS.findall(text)}
    out = set()
    for h in HREF.findall(text):
        if h.lower() == "top" or h in ids or "${" in h or "{{" in h:
            continue
        out.add(h)
    return sorted(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        for h in missing(text):
            bad += 1
            print(f"{page}: no target for #{h}")
    print(f"{pages} pages, {bad} dead in-page anchors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
