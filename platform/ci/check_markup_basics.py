#!/usr/bin/env python3
"""Fail if a served venture page breaks a markup basic a parser can see.

Checks, on real tags (not text inside scripts, comments or JSON-LD):
`<html lang>`, a viewport meta, a charset, `<img alt>`, `target="_blank"`
links with `rel` containing noopener or noreferrer, no positive `tabindex`,
and no `http://` subresource or link (mixed content, except localhost).

    python3 platform/ci/check_markup_basics.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Scan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.found = set()
        self.seen = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.seen.add("html")
            if not a.get("lang"):
                self.found.add("no <html lang>")
        elif tag == "meta":
            if a.get("name") == "viewport":
                self.seen.add("viewport")
            if "charset" in a or (a.get("http-equiv") or "").lower() == "content-type":
                self.seen.add("charset")
        elif tag == "img" and "alt" not in a:
            self.found.add("<img> without alt")
        if tag == "a" and (a.get("target") or "").lower() == "_blank":
            rel = (a.get("rel") or "").lower()
            if "noopener" not in rel and "noreferrer" not in rel:
                self.found.add('target="_blank" without rel=noopener')
        ti = a.get("tabindex")
        m = re.match(r"[+-]?[0-9]+", (ti or "").strip())  # HTML integer parsing: "+2" is 2
        if m and int(m.group()) > 0:
            self.found.add("positive tabindex")
        for k in ("src", "href"):
            v = (a.get(k) or "").strip().lower()
            if v.startswith("http://") and not v.startswith(("http://localhost", "http://127.0.0.1")):
                self.found.add("http:// " + k)


def problems(html):
    p = Scan()
    p.feed(html)
    out = set(p.found)
    if "html" in p.seen:  # fragments have no <html>; only full pages need these
        if "viewport" not in p.seen:
            out.add("no viewport meta")
        if "charset" not in p.seen:
            out.add("no charset")
    return sorted(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    root = Path(ap.parse_args(argv).root)
    bad = 0
    for f in sorted(root.rglob("*.html")):
        if "node_modules" in f.parts:
            continue
        for msg in problems(f.read_text(errors="ignore")):
            print(f"{f.relative_to(root)}: {msg}")
            bad += 1
    print(f"{bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
