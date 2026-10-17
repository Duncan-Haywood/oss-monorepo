#!/usr/bin/env python3
"""Give every research README a plain link to its live page.

Each `research/<slug>/` has a home page on the GitHub Pages site
(`research/_homepage/build.py`, published under `research/<slug>/`). The
repository README is what GitHub and search engines index first, so it should
say where the readable version lives, as the venture READMEs already do.

    python3 platform/ci/research_live_links.py          # report; exit 1 if any is missing
    python3 platform/ci/research_live_links.py --write  # insert the line (idempotent)

The line goes after the first paragraph under the title. Only projects listed
in `research/_homepage/projects.json` are touched, since those are the ones
that get a page.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://duncan-haywood.github.io/monorepo-projects/research/"
LINE = "**Live page:** {url}"


def url_for(slug):
    return f"{BASE}{slug}/"


def slugs(root=ROOT):
    data = json.loads((root / "research" / "_homepage" / "projects.json").read_text())
    return sorted(p["slug"] for t in data["themes"] for p in t["projects"])


def has_link(text, slug):
    return url_for(slug) in text


def insert_link(text, slug):
    """Return text with the live-page line after the first paragraph under the title."""
    if has_link(text, slug):
        return text
    lines = text.split("\n")
    i = 0
    while i < len(lines) and not lines[i].startswith("# "):
        i += 1
    if i == len(lines):
        i = -1  # no title: start from the top
    i += 1
    while i < len(lines) and not lines[i].strip():
        i += 1
    in_fence = False
    while i < len(lines) and (lines[i].strip() or in_fence):
        if lines[i].lstrip().startswith("```"):
            in_fence = not in_fence
        i += 1
    line = LINE.format(url=url_for(slug))
    lines[i:i] = ["", line] if i < len(lines) else ["", line, ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    missing = []
    for slug in slugs(args.root):
        f = args.root / "research" / slug / "README.md"
        text = f.read_text()
        if has_link(text, slug):
            continue
        missing.append(slug)
        if args.write:
            f.write_text(insert_link(text, slug))
    verb = "updated" if args.write else "missing a live-page link"
    print(f"{len(missing)} research READMEs {verb}")
    if missing and not args.write:
        print("\n".join(f"  research/{s}/README.md" for s in missing[:20]))
    return 1 if missing and not args.write else 0


if __name__ == "__main__":
    sys.exit(main())
