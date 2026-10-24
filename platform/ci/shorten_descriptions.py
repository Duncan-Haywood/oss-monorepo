#!/usr/bin/env python3
"""Replace an over-long meta description with the page's own og:description.

Many venture pages carry a 300-500 character meta description whose pitch is
cut off in search results, next to a short og:description written for the same
page. When the og text is self-contained and fits a snippet, it is the better
meta description. Dry run by default.

Usage:
    python3 platform/ci/shorten_descriptions.py [--root DIR] [--over 320]
                                                [--og-max 200] [--apply]

Exit 0 always (a measurement and a fixer, not a gate).
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import serp_snippets as s  # noqa: E402

OG_RE = re.compile(r'<meta\s+property="og:description"\s+content="([^"]*)"', re.I)
DESC_TAG_RE = re.compile(r'(<meta\s+name="description"\s+content=")([^"]*)(")', re.I)


def og_of(page: str) -> str | None:
    m = OG_RE.search(page)
    return " ".join(html.unescape(m.group(1)).split()) if m else None


def shorten(page: str, over: int = 320, og_max: int = 200) -> str | None:
    """The page with its meta description swapped for og:description, or None."""
    _, desc = s.snippet_of(page)
    og = og_of(page)
    if not desc or not og or len(desc) <= over or not 60 <= len(og) <= og_max:
        return None
    m = DESC_TAG_RE.search(page)
    if not m:
        return None
    new = html.escape(og, quote=True).replace("&#x27;", "'")
    return page[: m.start(2)] + new + page[m.end(2):]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("--over", type=int, default=320)
    ap.add_argument("--og-max", type=int, default=200)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    n = 0
    for f in sorted((Path(a.root) / "ventures").glob("*/*.html")):
        text = f.read_text(errors="ignore")
        out = shorten(text, a.over, a.og_max)
        if out is None:
            continue
        n += 1
        print(f.relative_to(a.root).as_posix())
        if a.apply:
            f.write_text(out)
    print(f"{n} pages {'rewritten' if a.apply else 'would change (use --apply)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
