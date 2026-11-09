#!/usr/bin/env python3
"""Report venture pages that share an identical meta description.

Two pages with the same snippet compete for the same search result and tell a
reader nothing about how they differ. Descriptions are HTML-unescaped and
compared case-insensitively; ones under 20 characters are ignored.

    python3 platform/ci/check_duplicate_meta.py [--root DIR] [--strict]

Exit 0 unless `--strict` and a duplicate is found.
"""
import argparse
import html
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESC = re.compile(
    r"""<meta\b[^>]*\bname=(["'])description\1[^>]*?\bcontent=(?:"([^"]*)"|'([^']*)')""",
    re.I | re.S,
)


def description(text: str):
    """The page's meta description, unescaped and normalised, or None."""
    m = DESC.search(text)
    if not m:
        return None
    raw = m.group(2) if m.group(2) is not None else m.group(3)
    return re.sub(r"\s+", " ", html.unescape(raw)).strip().lower()


def duplicates(pages: dict):
    """pages maps name -> html. Returns {description: [names]} for repeats."""
    seen = defaultdict(list)
    for name, text in pages.items():
        d = description(text)
        if d and len(d) >= 20:
            seen[d].append(name)
    return {k: sorted(v) for k, v in seen.items() if len(v) > 1}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    root = Path(a.root)
    pages = {}
    for f in root.rglob("*.html"):
        if "node_modules" in f.parts:
            continue
        t = f.read_text(errors="ignore")[:80000]
        if "<html" in t.lower():
            pages[str(f.relative_to(root))] = t
    dup = duplicates(pages)
    print(f"{len(pages)} pages: " + (f"{len(dup)} shared descriptions" if dup else "clean"))
    for k, v in sorted(dup.items(), key=lambda x: -len(x[1]))[:10]:
        print(f"  {len(v)}x {k[:70]!r}: {', '.join(v[:3])}")
    return 1 if a.strict and dup else 0


if __name__ == "__main__":
    sys.exit(main())
