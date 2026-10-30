#!/usr/bin/env python3
"""Fail if a built Pages site still carries a placeholder host.

`build_pages_site.py` rewrites the `example.invalid` base that the sources
use to the host that actually deploys. Nothing checked the result, so a
canonical, feed or sitemap the rewrite missed would publish pointing at a
host that does not resolve. This scans the built tree's text files for it.
`localhost` is not flagged: product READMEs and admin pages quote it as
run-locally instructions. Fixture pages that show the placeholder as sample
text go in ALLOW (path suffix -> why).

    python3 platform/ci/build_pages_site.py --out _site
    python3 platform/ci/check_built_site.py [_site]     # exit 1 if any found
"""
import re
import sys
from pathlib import Path

SUFFIXES = {".html", ".xml", ".txt", ".json", ".webmanifest", ".md"}
BAD = re.compile(r"https?://example\.invalid\b[^\s\"'<>)]*")
ALLOW = {}


def scan(root):
    root = Path(root)
    hits = []
    for f in sorted(root.rglob("*")):
        if f.suffix not in SUFFIXES or not f.is_file():
            continue
        rel = f.relative_to(root).as_posix()
        if any(rel.endswith(a) for a in ALLOW):
            continue
        text = f.read_text(encoding="utf8", errors="replace")
        for m in BAD.finditer(text):
            hits.append((rel, text.count("\n", 0, m.start()) + 1, m.group(0)))
    return hits


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    root = Path(argv[0]) if argv else Path(__file__).resolve().parents[2] / "_site"
    if not root.is_dir():
        print(f"no built site at {root}; run build_pages_site.py --out first")
        return 2
    hits = scan(root)
    for rel, line, url in hits:
        print(f"{rel}:{line}: placeholder host {url}")
    print(f"{len(hits)} placeholder URL(s) in {root}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
