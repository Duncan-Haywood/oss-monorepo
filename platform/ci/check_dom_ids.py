#!/usr/bin/env python3
"""Fail if a venture page repeats an `id` or points a label/ARIA attribute at a missing one.

Duplicate ids break `getElementById` and label association; a `for`,
`aria-labelledby`, `aria-describedby` or `aria-controls` that names no id
silently drops the accessible name. Scripts, styles, comments, template
placeholders (`${...}`, `{{...}}`) and `data-for` style attributes are ignored.

    python3 platform/ci/check_dom_ids.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", re.S | re.I)
ID = re.compile(r'<[a-zA-Z][^>]*?\sid="([^"]+)"')
REF = re.compile(r'\s(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"')
TEMPLATE = ("${", "{{", "<%", "{%")


def problems(text: str):
    """Return (duplicate ids, dangling references) for one page's HTML."""
    text = STRIP.sub("", text)
    ids = [i for i in ID.findall(text) if not any(t in i for t in TEMPLATE)]
    dup = sorted(k for k, v in Counter(ids).items() if v > 1)
    have = set(ids)
    dangling = []
    for m in REF.finditer(text):
        if any(t in m.group(1) for t in TEMPLATE):
            continue
        dangling += [t for t in m.group(1).split() if t not in have]
    return dup, sorted(set(dangling))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if not {"node_modules", ".next"}.isdisjoint(page.parts):
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        dup, dangling = problems(text)
        if dup or dangling:
            bad += 1
            print(f"{page}: duplicate ids {dup}; dangling references {dangling}")
    print(f"{pages} pages, {bad} with duplicate ids or dangling references")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
