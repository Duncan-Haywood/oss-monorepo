#!/usr/bin/env python3
"""Report venture pages with no meta description or an overlong <title>.

Search results cut a title at about 60 characters (pixel width, really), so a
title over `--title-max` (default 70) loses its tail. A page with no
`<meta name="description">` gets a snippet picked for it. Only real pages are
looked at (a file with an `<html` tag, not under node_modules).

    python3 platform/ci/check_title_meta.py [--root DIR] [--title-max N] [--strict]

Exit 0 unless `--strict` and something is found. Prints per-venture counts.
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
DESC = re.compile(r"<meta\b[^>]*\bname=[\"']description[\"']", re.I)


def problems(text: str, title_max: int = 70):
    """Return a list of problem names for one page's HTML."""
    out = []
    m = TITLE.search(text)
    if not m or not m.group(1).strip():
        out.append("no-title")
    elif len(re.sub(r"\s+", " ", m.group(1).strip())) > title_max:
        out.append("long-title")
    if not DESC.search(text):
        out.append("no-description")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--title-max", type=int, default=70)
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    root = Path(a.root)
    pages, found, by = 0, Counter(), Counter()
    for f in root.rglob("*.html"):
        if "node_modules" in f.parts:
            continue
        t = f.read_text(errors="ignore")
        if "<html" not in t.lower():
            continue
        pages += 1
        for p in problems(t, a.title_max):
            found[p] += 1
            by[(p, f.relative_to(root).parts[0])] += 1
    print(f"{pages} pages: " + (", ".join(f"{k} {v}" for k, v in sorted(found.items())) or "clean"))
    for (p, v), n in by.most_common(10):
        print(f"  {p:15} {v}: {n}")
    return 1 if a.strict and found else 0


if __name__ == "__main__":
    sys.exit(main())
