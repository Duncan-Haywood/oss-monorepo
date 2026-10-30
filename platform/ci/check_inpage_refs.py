#!/usr/bin/env python3
"""Fail if a served page points at an id that is not on the page.

Three references resolve by id inside one document: `<a href="#x">` (the click
does nothing), `aria-labelledby` / `aria-describedby` (the control loses its
accessible name) and `aria-controls` (the widget points at nothing). All fail
silently, so a rename that misses one is never noticed. `#` and `#top` are
valid; `<script>`, `<style>` and comments are skipped.

    python3 platform/ci/check_inpage_refs.py [--root DIR]   # exit 1 if any
"""
import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARIA = ("aria-labelledby", "aria-describedby", "aria-controls")


class _Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []  # (line, kind, id)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        for k in ("id", "name"):
            if a.get(k):
                self.ids.add(a[k])
        href = a.get("href") or ""
        if tag == "a" and href.startswith("#") and href not in ("#", "#top"):
            self.refs.append((line, "href", href[1:]))
        for k in ARIA:
            for i in (a.get(k) or "").split():
                self.refs.append((line, k, i))


def broken(html):
    """Return [(line, kind, id)] for every in-page reference with no target."""
    p = _Refs()
    p.feed(html)
    return [r for r in p.refs if r[2] not in p.ids]


def scan(root=ROOT):
    bad = []
    for f in sorted((root / "ventures").rglob("*.html")):
        if "node_modules" in f.parts:
            continue
        for line, kind, i in broken(f.read_text(encoding="utf-8", errors="ignore")):
            bad.append((f.relative_to(root), line, kind, i))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, kind, i in bad:
        print(f"{path}:{line}: {kind} '{i}' has no element with that id on the page")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
