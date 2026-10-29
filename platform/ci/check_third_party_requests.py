#!/usr/bin/env python3
"""Fail if a venture page loads a resource from another host.

The tools say "your data stays in your browser" and run with no per-user cost.
A `<script src>`, stylesheet, font, frame or image fetched from a third-party
host sends the visitor's IP and referrer to that host on every page view, which
breaks the claim (and is a GDPR exposure for Google Fonts, LG Muenchen I,
3 O 17493/20). Plain `<a href>` links are not requests and are ignored; so are
the `example.invalid` / `example.com` placeholders the site build rewrites.

    python3 platform/ci/check_third_party_requests.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
PLACEHOLDER = {"example.invalid", "example.com", "example.org", "example.test"}
# Hosts a page may load from on purpose. Empty: none today.
ALLOWED = frozenset()

TAG = re.compile(r"<(script|img|iframe|source|video|audio|embed|link|input)\b([^>]*)>", re.I)
ATTR = re.compile(r"""\b(src|href|data-src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
REL = re.compile(r"""\brel\s*=\s*["']?([^"'>\s]+)""", re.I)
CSS_URL = re.compile(r"""(?:url\(\s*|@import\s+)["']?(https?://[^"')\s;]+)""", re.I)
# rel values whose href is fetched (not merely a link to another document)
FETCHED_REL = {"stylesheet", "preload", "prefetch", "preconnect", "dns-prefetch",
               "modulepreload", "icon", "shortcut", "apple-touch-icon", "manifest"}


def hosts(html):
    """Yield (host, url) for every absolute resource URL the page fetches."""
    out = []
    for m in TAG.finditer(html):
        tag, attrs = m.group(1).lower(), m.group(2)
        rel = {r.lower() for r in REL.findall(attrs)}
        for a in ATTR.finditer(attrs):
            name, url = a.group(1).lower(), a.group(2) or a.group(3) or ""
            if tag == "link" and name == "href" and not (rel & FETCHED_REL):
                continue
            if tag == "input" and name != "src":
                continue
            if url.startswith("//"):
                url = "https:" + url
            if re.match(r"https?://", url, re.I):
                out.append((urlparse(url).hostname or "", url))
    for u in CSS_URL.findall(html):
        out.append((urlparse(u).hostname or "", u))
    return [(h, u) for h, u in out if h not in PLACEHOLDER and h not in ALLOWED]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    a = ap.parse_args(argv)
    bad = 0
    for f in sorted(Path(a.root).rglob("*.html")):
        if "node_modules" in f.parts:
            continue
        for host, url in hosts(f.read_text(encoding="utf8", errors="replace")):
            bad += 1
            rel = f.relative_to(ROOT) if f.is_relative_to(ROOT) else f
            print(f"{rel}: loads {url} from {host}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
