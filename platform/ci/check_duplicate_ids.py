#!/usr/bin/env python3
"""Fail if a served page uses the same `id` on two elements.

`getElementById` and `querySelector("#x")` return the first match. A page that
has `<input id="years">` and `<tbody id="years">` sends `$("#years").innerHTML
= rows` to the input, so the table never fills and nothing throws (found on
installment-sale-tax-calculator and sports-official-game-fee-calculator,
2026-10-21). A `<label for>` and an in-page `#anchor` resolve the same way.

Only markup is read: `<script>`, `<style>` and comments are skipped, so ids
inside template strings do not count.

    python3 platform/ci/check_duplicate_ids.py [--root DIR]   # exit 1 if any
"""
import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class _Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.first = {}
        self.dups = []  # (line, id, first_line)

    def handle_starttag(self, tag, attrs):
        i = dict(attrs).get("id")
        if not i:
            return
        line = self.getpos()[0]
        if i in self.first:
            self.dups.append((line, i, self.first[i]))
        else:
            self.first[i] = line


def duplicates(html):
    """Return [(line, id, first_line)] for every repeat of an id in `html`."""
    p = _Ids()
    p.feed(html)
    return p.dups


def scan(root=ROOT):
    bad = []
    # Nested pages (site/, tools/) are served too; vendored trees are not ours.
    for f in sorted((root / "ventures").rglob("*.html")):
        if "node_modules" in f.parts:
            continue
        for line, i, first in duplicates(f.read_text(encoding="utf-8", errors="ignore")):
            bad.append((f.relative_to(root), line, i, first))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, i, first in bad:
        print(f"{path}:{line}: id '{i}' repeats the one on line {first}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
