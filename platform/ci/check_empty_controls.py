#!/usr/bin/env python3
"""Fail if a venture page has a link or button with no accessible name.

A `<a href>` or `<button>` with no text, `aria-label`, `aria-labelledby`,
`title` or labelled `<img>` is announced as just "link" or "button". An empty
control whose `id` a script on the same page fills in (`textContent`,
`innerHTML`, `innerText`, `.append`) is allowed, as are template placeholders.

    python3 platform/ci/check_empty_controls.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", re.S | re.I)
EL = re.compile(r"<(a|button)\b([^>]*)>(.*?)</\1>", re.S | re.I)
NAMED = re.compile(r'aria-label(?:ledby)?\s*=|\btitle="[^"]+"', re.I)
ID = re.compile(r'\bid="([^"]+)"')
TEMPLATE = ("${", "{{", "<%", "{%")


def empty_controls(text: str):
    """Return (tag, attributes) for each unnamed, unfilled control in one page."""
    scripts = "\n".join(SCRIPT.findall(text))
    out = []
    for m in EL.finditer(STRIP.sub("", text)):
        tag, attrs, inner = m.groups()
        if tag.lower() == "a" and not re.search(r"\bhref\b", attrs, re.I):
            continue
        if NAMED.search(attrs) or any(t in inner for t in TEMPLATE):
            continue
        if re.search(r'<img\b[^>]*\balt="[^"]+"', inner, re.I):
            continue
        if re.sub(r"<[^>]+>|&nbsp;|\s", "", inner):
            continue
        ident = ID.search(attrs)
        if ident and ident.group(1) in scripts:
            continue
        out.append((tag.lower(), attrs.strip()[:80]))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        found = empty_controls(text)
        if found:
            bad += 1
            print(f"{page}: {len(found)} unnamed control(s), first {found[0]}")
    print(f"{pages} pages, {bad} with an unnamed link or button")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
