#!/usr/bin/env python3
"""Fail if a venture page loads or posts to a plain `http://` URL.

An `http://` `src`, stylesheet `href` or form `action` is mixed content on an
https site: browsers block it or warn. Plain `<a href>` links, XML namespace
URIs and localhost are allowed.

    python3 platform/ci/check_insecure_refs.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOADERS = re.compile(
    r'<(?:img|script|iframe|source|video|audio|embed)\b[^>]*?\bsrc\s*=\s*["\'](http://[^"\' >]+)'
    r'|<link\b[^>]*?\bhref\s*=\s*["\'](http://[^"\' >]+)'
    r'|<form\b[^>]*?\baction\s*=\s*["\'](http://[^"\' >]+)', re.I)
LOCAL = re.compile(r'^http://(localhost|127\.0\.0\.1|\[::1\])([:/]|$)', re.I)


def insecure(page: Path):
    """Yield each plain-http loader URL in `page`."""
    try:
        text = page.read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    for m in LOADERS.finditer(text):
        u = next(g for g in m.groups() if g)
        if not LOCAL.match(u):
            yield u


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, pages = [], 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        pages += 1
        bad += [(page, u) for u in insecure(page)]
    for page, u in bad:
        print(f"{page}: {u}")
    print(f"{pages} pages, {len(bad)} plain-http loaders")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
