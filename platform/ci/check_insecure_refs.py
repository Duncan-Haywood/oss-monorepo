#!/usr/bin/env python3
"""Fail if a venture page loads or posts to a plain `http://` URL.

An `http://` `src`, `srcset`, `poster`, stylesheet `href`, `<base href>`, form
`action`, `formaction`, `<object data>` or CSS `url()`/`@import` (in a style
attribute, a `<style>` block or a `.css` file) is mixed content on an https
site: browsers block it or warn. Plain `<a href>` links, text, script bodies,
XML namespace URIs and localhost are allowed.

    python3 platform/ci/check_insecure_refs.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = re.compile(r'^http://(localhost|127\.0\.0\.1|\[::1\])([:/]|$)', re.I)
# (attribute -> tags) whose value is fetched as a subresource, posted to, or
# (base href) becomes the base every relative URL on the page resolves against.
# Red team 2026-11-11: the regex this replaces needed quoted values and knew
# only src, link href and form action, so `<img src=http://...>`, srcset,
# poster, object data, formaction, base href and CSS url() all passed.
URL_ATTRS = {
    "src": {"img", "script", "iframe", "frame", "source", "video", "audio",
            "embed", "track", "input"},
    "href": {"link", "base"},
    "action": {"form"},
    "formaction": {"button", "input"},
    "poster": {"video"},
    "data": {"object"},
}
SRCSET_ATTRS = {"srcset", "imagesrcset"}
CSS_URL = re.compile(r"""url\(\s*["']?\s*(http://[^"')\s]+)"""
                     r"""|@import\s+["']\s*(http://[^"'\s]+)""", re.I)


def css_urls(text):
    """Each plain-http url() or @import target in a run of CSS."""
    for m in CSS_URL.finditer(text):
        yield m.group(1) or m.group(2)


class _Loaders(HTMLParser):
    """Collect plain-http loader URLs from tags, style attributes and <style>."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls, self._in_style = [], False

    def handle_starttag(self, tag, attrs):
        if tag == "style":
            self._in_style = True
        for name, value in attrs:
            value = (value or "").strip()
            if name in SRCSET_ATTRS:
                for cand in value.split(","):
                    parts = cand.split()
                    if parts and parts[0].lower().startswith("http://"):
                        self.urls.append(parts[0])
            elif tag in URL_ATTRS.get(name, ()):
                if value.lower().startswith("http://"):
                    self.urls.append(value)
            elif name == "style":
                self.urls += css_urls(value)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag == "style":
            self._in_style = False

    def handle_endtag(self, tag):
        if tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.urls += css_urls(data)


def insecure(page: Path):
    """Yield each plain-http loader URL in `page` (an .html or .css file)."""
    try:
        text = page.read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    if page.suffix.lower() == ".css":
        urls = list(css_urls(text))
    else:
        parser = _Loaders()
        parser.feed(text)
        parser.close()
        urls = parser.urls
    for u in urls:
        if not LOCAL.match(u):
            yield u


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    root = Path(args.root)
    bad, pages = [], 0
    for page in sorted([*root.rglob("*.html"), *root.rglob("*.css")]):
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
