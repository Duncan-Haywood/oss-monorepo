#!/usr/bin/env python3
"""Fail if a page's JSON-LD is malformed or makes claims the repo can't back.

Search engines drop a structured-data block that does not parse, and
`goals.md` ("Honest marketing") forbids `Review`, `AggregateRating` and
`Rating` markup without real, attributable reviews (16 CFR Part 465). The
checker reads every line-leading `<script type="application/ld+json">` block under
`ventures/` (or `--root`) and reports: invalid JSON, a top-level node with no `@type`,
and any forbidden type or property anywhere in the graph.

    python3 platform/ci/check_jsonld.py [--root DIR]   # exit 1 if any found
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLOCK = re.compile(
    r"^[ \t]*<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.S | re.I | re.M)
FORBIDDEN_TYPES = {"Review", "AggregateRating", "Rating", "EmployerAggregateRating"}
FORBIDDEN_KEYS = {"aggregateRating", "review", "reviews", "reviewRating", "ratingValue", "reviewCount"}


def walk(node, path="$"):
    """Yield (path, problem) for every issue in a parsed JSON-LD value."""
    if isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    elif isinstance(node, dict):
        if path == "$" and not {"@graph", "@type"} & node.keys():
            yield path, "top-level node has no @type"
        t = node.get("@type")
        for name in (t if isinstance(t, list) else [t]):
            if name in FORBIDDEN_TYPES:
                yield path, f"forbidden type {name}"
        for k, v in node.items():
            if k in FORBIDDEN_KEYS:
                yield f"{path}.{k}", f"forbidden property {k}"
            if k != "@context":
                yield from walk(v, f"{path}.{k}")


def check(html):
    """Return a list of problem strings for one page."""
    out = []
    for i, m in enumerate(BLOCK.finditer(html)):
        try:
            data = json.loads(m.group(1))
        except ValueError as e:
            out.append(f"block {i}: invalid JSON ({e})")
            continue
        out += [f"block {i} {p}: {msg}" for p, msg in walk(data)]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, pages = 0, 0
    for p in sorted(Path(args.root).rglob("*.html")):
        s = p.read_text(encoding="utf-8", errors="replace")
        if "ld+json" not in s:
            continue
        pages += 1
        for msg in check(s):
            bad += 1
            print(f"{p}: {msg}")
    print(f"{pages} pages with JSON-LD, {bad} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
