#!/usr/bin/env python3
"""Fail if a venture page has `<a target="_blank">` with no `rel` of noopener/noreferrer.

Modern browsers imply noopener for `_blank`, but older ones do not, and the
explicit `rel` costs nothing. `window.open` is out of scope on purpose: adding
"noopener" there makes it return null, which breaks callers that fall back to
a download when the popup is blocked (event-seating-chart-optimizer).

    python3 platform/ci/check_blank_targets.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANCHOR = re.compile(r"<a\b[^>]*?\btarget\s*=\s*[\"']?_blank[^>]*>", re.I)
# A real `rel` attribute: preceded by whitespace, so `data-rel=` and a `rel=`
# inside another attribute's value (href="?rel=noopener") do not count.
SAFE = re.compile(r"""\srel\s*=\s*(?:"[^"]*\b(?:noopener|noreferrer)\b[^"]*"|'[^']*\b(?:noopener|noreferrer)\b[^']*'|(?:[^\s"'>]*\b)?(?:noopener|noreferrer)\b)""", re.I)


def _strip_values(tag: str) -> str:
    """Blank out quoted attribute values other than rel's, so text inside them can't fake a rel."""
    return re.sub(r"""(\s(?!rel\s*=)[\w:-]+\s*=\s*)(?:"[^"]*"|'[^']*')""", r'\1""', tag, flags=re.I)


def unsafe(page: Path):
    """Yield each `_blank` anchor tag in `page` lacking noopener/noreferrer."""
    try:
        text = page.read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    for m in ANCHOR.finditer(text):
        if not SAFE.search(_strip_values(m.group(0))):
            yield m.group(0)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, pages = [], 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        pages += 1
        bad += [(page, t) for t in unsafe(page)]
    for page, t in bad:
        print(f"{page}: {t[:120]}")
    print(f"{pages} pages, {len(bad)} _blank links without rel=noopener")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
