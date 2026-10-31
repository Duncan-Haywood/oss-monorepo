#!/usr/bin/env python3
"""Report venture pages that share an identical meta description.

Identical descriptions across pages weaken search snippets and often signal a
template bug (for example a description cut at the first apostrophe). Reports
groups of 2+ pages; `--min N` sets the group size, `--max-len` flags short
descriptions (default 40 chars) that look truncated.

    python3 platform/ci/duplicate_descriptions.py [--root DIR] [--min 2] [--strict]
"""
import argparse
import collections
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Desc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.desc = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and (a.get("name") or "").lower() == "description" and self.desc is None:
            self.desc = (a.get("content") or "").strip()


def description(path):
    p = Desc()
    try:
        p.feed(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return None
    return p.desc


def scan(root):
    groups = collections.defaultdict(list)
    total = 0
    for f in sorted(Path(root).glob("ventures/*/**/*.html")):
        if "node_modules" in f.parts:
            continue
        d = description(f)
        if d:
            total += 1
            groups[d].append(str(f.relative_to(root)))
    return groups, total


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--min", type=int, default=2)
    ap.add_argument("--short", type=int, default=40)
    ap.add_argument("--strict", action="store_true", help="exit 1 if any found")
    a = ap.parse_args(argv)
    groups, total = scan(a.root)
    dups = {k: v for k, v in groups.items() if len(v) >= a.min}
    short = {k: v for k, v in groups.items() if len(k) < a.short}
    for k, v in sorted(dups.items(), key=lambda x: -len(x[1]))[:25]:
        print(f"{len(v)} pages share: {k[:100]!r}  e.g. {v[0]}")
    for k, v in sorted(short.items()):
        print(f"short ({len(k)} chars): {k!r}  {v[0]}")
    print(f"{total} pages with a description; {len(dups)} duplicated groups "
          f"({sum(len(v) for v in dups.values())} pages); {len(short)} short")
    return 1 if a.strict and (dups or short) else 0


if __name__ == "__main__":
    sys.exit(main())
