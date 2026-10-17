#!/usr/bin/env python3
"""Report ventures whose README does not link to its live page.

The repository README is what GitHub and search engines index first, so each
published venture should say where the usable version lives. Ventures marked
with a `NOT-A-VENTURE` file, or without a static `index.html`, have no
page and are skipped.

    python3 platform/ci/venture_live_links.py   # exit 1 if any README lacks the link
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://duncan-haywood.github.io/monorepo-projects/"


def missing(root=ROOT):
    out = []
    for d in sorted((root / "ventures").iterdir()):
        readme = d / "README.md"
        if not d.is_dir() or not readme.exists() or (d / "NOT-A-VENTURE").exists() \
                or not (d / "index.html").exists():
            continue
        if f"{BASE}{d.name}/" not in readme.read_text(encoding="utf-8"):
            out.append(d.name)
    return out


def main():
    bad = missing()
    for slug in bad:
        print(f"ventures/{slug}/README.md has no link to {BASE}{slug}/")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
