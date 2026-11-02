#!/usr/bin/env python3
"""Fail if a served page has a link or iframe with no accessible name.

An `<a href><i class="icon"></i></a>` is announced as just "link"; an
`<iframe>` without `title` is announced by its URL (WCAG 2.4.4, 4.1.2). A link
is named by visible text, `aria-label`, `aria-labelledby`, `title`, an `<img>`
with non-empty alt, or an `<svg>` with aria-label/`<title>`. Links without
`href` (anchors) are skipped.

    python3 platform/ci/check_link_names.py [--root DIR]   # exit 1 if any
"""
import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class _Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cur = None  # [attrs, line, named]
        self.out = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "iframe" and not (a.get("title") or a.get("aria-label")):
            self.out.append((self.getpos()[0], "iframe has no title"))
        elif tag == "a" and "href" in a:
            named = bool(a.get("aria-label") or a.get("aria-labelledby") or a.get("title"))
            self.cur = [self.getpos()[0], named]
        elif self.cur and tag in ("img", "svg") and (a.get("alt") or a.get("aria-label")):
            self.cur[1] = True

    def handle_data(self, data):
        if self.cur and data.strip():
            self.cur[1] = True

    def handle_endtag(self, tag):
        if tag == "a" and self.cur:
            if not self.cur[1]:
                self.out.append((self.cur[0], "link has no accessible name"))
            self.cur = None


def problems(html):
    """Return [(line, message)] for unnamed links and untitled iframes."""
    s = _Scan()
    s.feed(html)
    return s.out


def scan(root=ROOT):
    bad = []
    for f in sorted((root / "ventures").glob("*/*.html")):
        for line, msg in problems(f.read_text(encoding="utf-8", errors="ignore")):
            bad.append((f.relative_to(root), line, msg))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, msg in bad:
        print(f"{path}:{line}: {msg}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
