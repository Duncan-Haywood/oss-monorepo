#!/usr/bin/env python3
"""Fail if a served page points a `<label for>` or an ARIA id reference at an id
that is not in the same page.

`aria-labelledby`, `aria-describedby`, `aria-controls`, `aria-owns` and
`aria-activedescendant` take element ids; so does `<label for>`. When the id
is missing, the browser drops the reference without an error, and a screen
reader hears an unnamed control. Only `<label for>` is checked on `label`
tags (other tags use `data-for` and similar). Values built by a template
(`{`, `$`) are skipped. Ids come from markup only, not from script strings,
so an id a script adds later needs an `id` in the markup or a waiver below.

    python3 platform/ci/check_aria_refs.py [--root DIR]   # exit 1 if any

First run, 2026-10-29: 0 dangling references in 13,258 checked.
"""
import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARIA = ("aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant")


class _Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []  # (line, attribute, id)
        self.checked = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        names = list(ARIA) + (["for"] if tag == "label" else [])
        for n in names:
            v = a.get(n)
            if not v or "{" in v or "$" in v:
                continue
            for t in v.split():
                self.refs.append((self.getpos()[0], n, t))


def dangling(html):
    """Return [(line, attribute, id)] for references with no matching id."""
    p = _Refs()
    p.feed(html)
    return [r for r in p.refs if r[2] not in p.ids]


def scan(root=ROOT):
    bad = []
    for f in sorted((root / "ventures").rglob("*.html")):
        if "node_modules" in f.parts:
            continue
        for line, attr, i in dangling(f.read_text(encoding="utf-8", errors="ignore")):
            bad.append((f.relative_to(root), line, attr, i))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, attr, i in bad:
        print(f"{path}:{line}: {attr}='{i}' matches no id on the page")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
