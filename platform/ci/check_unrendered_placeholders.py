#!/usr/bin/env python3
"""Fail if a venture page shows an unrendered template placeholder as text.

Looks in visible markup only (script, style, textarea, pre, code and comments
are stripped) for `{{name}}`, `${expr}`, `[object Object]`, `%(name)s` and a
bare `undefined` / `NaN` / `null` element body. A page that documents such
syntax on purpose goes in KNOWN with the token, so a new leak still fails.

    python3 platform/ci/check_unrendered_placeholders.py [--root DIR]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIDDEN = re.compile(r'<(script|style|textarea|pre|code)\b.*?</\1>|<!--.*?-->', re.S | re.I)
LEAK = re.compile(r'\{\{[^}]{0,60}\}\}|\[object Object\]|>\s*(?:undefined|NaN|null)\s*<'
                  r'|\$\{[^}]{1,60}\}|%\([a-z_]+\)s')
# Pages that teach this syntax (GitHub Actions expressions, mail-merge fields).
KNOWN = {
    ("actions-injection-check/index.html", "${{ github.event }"),
    ("actions-injection-check/index.html", "${{ github.event.* }"),
    ("actions-injection-check/vs-checking-a-workflow-by-hand.html", "${{ github.event.* }"),
    ("drip-keeper/index.html", "{{name}}"),
}


def leaks(text: str):
    """Yield each placeholder-looking token in the visible part of `text`."""
    for m in LEAK.finditer(HIDDEN.sub("", text)):
        yield m.group(0)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    root = Path(args.root)
    bad, pages = [], 0
    for page in sorted(root.rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        rel = page.relative_to(root).as_posix()
        bad += [(rel, t) for t in leaks(text) if (rel, t) not in KNOWN]
    for rel, t in bad:
        print(f"{rel}: {t}")
    print(f"{pages} pages, {len(bad)} unrendered placeholders")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
