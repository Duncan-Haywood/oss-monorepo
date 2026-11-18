#!/usr/bin/env python3
"""List venture landing pages with little visible text.

A page whose HTML holds few words gives search engines and LLM crawlers (which
mostly do not run scripts) nothing to index. This counts visible words in each
`index.html` after dropping script, style, noscript and svg, and reports pages
under a threshold. It is a report, not a gate: app shells are thin on purpose, and pages with
`<meta name="robots" content="noindex">` are skipped.

    python3 platform/ci/check_thin_pages.py [--root DIR] [--min 200]   # exit 1 if any
"""
import argparse
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DROP = re.compile(r"(?is)<(script|style|noscript|svg)\b.*?</\1>")
TAG = re.compile(r"(?s)<[^>]+>")
NOINDEX = re.compile(r'(?i)<meta[^>]+name=["\']robots["\'][^>]*noindex')


def word_count(html: str) -> int:
    """Visible words in `html`."""
    return len(TAG.sub(" ", DROP.sub("", html)).split())


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--min", type=int, default=200)
    args = ap.parse_args(argv)
    rows = []
    for page in Path(args.root).rglob("index.html"):
        if not {"node_modules", ".next"}.isdisjoint(page.parts):
            continue
        try:
            html = page.read_text(encoding="utf8", errors="ignore")
            if NOINDEX.search(html):
                continue  # deliberately unindexed (private app shell): thin is fine
            rows.append((word_count(html), page))
        except OSError:
            continue
    rows.sort(key=lambda r: (r[0], str(r[1])))
    thin = [r for r in rows if r[0] < args.min]
    for n, page in thin:
        print(f"{n:5d} words  {page}")
    med = statistics.median(n for n, _ in rows) if rows else 0
    print(f"{len(rows)} pages, median {med:g} words, {len(thin)} under {args.min}")
    return 1 if thin else 0


if __name__ == "__main__":
    sys.exit(main())
