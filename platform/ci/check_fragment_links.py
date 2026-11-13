#!/usr/bin/env python3
"""Report venture pages whose in-page `href="#frag"` links name no id or anchor name.

A skip link or table-of-contents entry whose target is missing does nothing
when clicked. Scripts, styles, comments and template placeholders are ignored;
bare `#` and `#!` links are ignored (script-wired, see the explore prompt).

    python3 platform/ci/check_fragment_links.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", re.S | re.I)
TARGET = re.compile(r'<[a-zA-Z][^>]*?\s(?:id|name)=["\']([^"\']+)["\']')
LINK = re.compile(r'<a\b[^>]*?\shref=["\']#([^"\']+)["\']', re.I)
TEMPLATE = ("${", "{{", "<%", "{%")


def missing(text: str):
    """Return sorted fragment names linked in this page but defined nowhere in it."""
    text = STRIP.sub("", text)
    have = set(TARGET.findall(text))
    out = set()
    for frag in LINK.findall(text):
        if frag.startswith("!") or any(t in frag for t in TEMPLATE) or frag == "top":
            continue
        if frag not in have:
            out.add(frag)
    return sorted(out)


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
        m = missing(text)
        if m:
            bad += 1
            print(f"{page}: missing fragment targets {m}")
    print(f"{pages} pages, {bad} with in-page links to missing targets")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
