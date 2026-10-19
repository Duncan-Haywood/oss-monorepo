#!/usr/bin/env python3
"""Report how many served pages carry a <title> or meta description that
search results will cut off.

Google shows roughly 60 characters of a title and 155-160 of a description
(pixel-based, so these are rules of thumb). Text past that is dropped from the
result snippet, so the sentence that makes a searcher click should come first.
This is a measurement, not a gate: it exits 0 unless a page has no title or no
description at all.

Usage:
    python3 platform/ci/serp_snippets.py [--root DIR] [--title-max N]
                                         [--desc-max N] [--top N] [--json]

Exit 0: every page has both. Exit 1: pages missing one (listed).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
# Quoted values may hold a raw ">" (valid HTML), so tokenise attributes.
DESC_RE = re.compile(r"<meta\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.S | re.I)
NAME_RE = re.compile(r"\bname=[\"']description[\"']", re.I)
CONTENT_RE = re.compile(r"content=(\"([^\"]*)\"|'([^']*)')", re.S | re.I)


def _clean(text: str) -> str:
    return " ".join(html.unescape(text).split())


def snippet_of(page: str) -> tuple[str | None, str | None]:
    """(title, description) of one HTML document; None when absent or empty."""
    t = TITLE_RE.search(page)
    title = _clean(t.group(1)) if t else ""
    desc = ""
    for m in DESC_RE.finditer(page):
        if not NAME_RE.search(m.group(0)):
            continue
        c = CONTENT_RE.search(m.group(0))
        if c:
            desc = _clean(c.group(2) if c.group(2) is not None else c.group(3))
        break
    return title or None, desc or None


def audit(root: Path, title_max: int = 60, desc_max: int = 160) -> dict:
    ventures = root / "ventures"
    pages = missing = long_title = long_desc = 0
    per: dict[str, int] = {}
    missing_list: list[str] = []
    for f in sorted(ventures.glob("*/*.html")):
        title, desc = snippet_of(f.read_text(errors="ignore"))
        pages += 1
        rel = f.relative_to(root).as_posix()
        if title is None or desc is None:
            missing += 1
            missing_list.append(rel)
            continue
        over = (len(title) > title_max) + (len(desc) > desc_max)
        long_title += len(title) > title_max
        long_desc += len(desc) > desc_max
        if over:
            per[f.parent.name] = per.get(f.parent.name, 0) + over
    return {
        "pages": pages,
        "missing": missing_list,
        "long_titles": long_title,
        "long_descriptions": long_desc,
        "worst_ventures": sorted(per.items(), key=lambda kv: (-kv[1], kv[0])),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("--title-max", type=int, default=60)
    ap.add_argument("--desc-max", type=int, default=160)
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    r = audit(Path(a.root), a.title_max, a.desc_max)
    if a.json:
        print(json.dumps(r, indent=2))
    else:
        n = r["pages"] or 1
        print(f"{r['pages']} venture pages")
        print(f"  title > {a.title_max}: {r['long_titles']} ({100 * r['long_titles'] // n}%)")
        print(f"  description > {a.desc_max}: {r['long_descriptions']} ({100 * r['long_descriptions'] // n}%)")
        for slug, k in r["worst_ventures"][: a.top]:
            print(f"    {k:3d}  {slug}")
        for m in r["missing"]:
            print(f"MISSING title or description: {m}")
    return 1 if r["missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
