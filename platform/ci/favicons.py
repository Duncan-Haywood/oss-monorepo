#!/usr/bin/env python3
"""Give every venture HTML page a tab icon.

Pages without a `<link rel="icon">` make the browser ask the origin root for
/favicon.ico, which GitHub Pages answers with a 404, and show a blank tab.
`--fix` inserts an inline SVG icon (a rounded square in a colour derived from
the venture slug, with the slug's first letter), so the page stays
self-contained. `--check` (default) lists the pages that still lack one and
exits 1 if there are any.

    python3 platform/ci/favicons.py            # report
    python3 platform/ci/favicons.py --fix      # insert missing icons
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
ICON_RE = re.compile(r"<link\b[^>]*\brel=[\"'][^\"']*\bicon\b", re.I)
HEAD_RE = re.compile(r"<head\b[^>]*>", re.I)
CHARSET_RE = re.compile(r"<meta\b[^>]*charset[^>]*>", re.I)


def icon_href(slug: str) -> str:
    hue = hashlib.sha256(slug.encode()).digest()[0] / 255
    r, g, b = (round(255 * v) for v in colorsys.hls_to_rgb(hue, 0.30, 0.65))
    letter = next((c for c in slug if c.isalpha()), "v").upper()
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
        f"<rect width='32' height='32' rx='7' fill='#{r:02x}{g:02x}{b:02x}'/>"
        "<text x='16' y='23' font-size='20' font-family='system-ui,sans-serif' "
        f"font-weight='700' text-anchor='middle' fill='#fff'>{letter}</text></svg>"
    )
    return "data:image/svg+xml," + quote(svg, safe="/:=,'")


def pages(root: Path = ROOT):
    for p in sorted((root / "ventures").glob("*/*.html")):
        yield p


def has_icon(html: str) -> bool:
    return bool(ICON_RE.search(html))


def with_icon(html: str, slug: str) -> str:
    tag = f'<link rel="icon" href="{icon_href(slug)}">'
    m = CHARSET_RE.search(html) or HEAD_RE.search(html)
    if not m:
        return html
    return html[: m.end()] + tag + html[m.end():]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--root", type=Path, default=ROOT)
    a = ap.parse_args(argv)
    missing = []
    for p in pages(a.root):
        with open(p, encoding="utf-8", errors="surrogateescape", newline="") as fh:
            html = fh.read()
        if not HEAD_RE.search(html) or has_icon(html):
            continue
        missing.append(p)
        if a.fix:
            new = with_icon(html, p.parent.name)
            if new != html:
                with open(p, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
                    fh.write(new)
    verb = "fixed" if a.fix else "missing a tab icon"
    print(f"{len(missing)} venture pages {verb}")
    if missing and not a.fix:
        for p in missing[:20]:
            print("  ", p.relative_to(a.root))
    return 1 if missing and not a.fix else 0


if __name__ == "__main__":
    sys.exit(main())
