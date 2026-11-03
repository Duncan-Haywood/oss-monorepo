#!/usr/bin/env python3
"""Fail if a venture page points at a local img/script/link/source file that is missing.

A dead `src`/`href` to a file in the tree is a broken image or a script that
never loads, and no other `check_*.py` looks for it. Absolute URLs, data URIs,
template placeholders (`${...}`, `{{...}}`) and root-absolute paths that a
bundler resolves (Vite's `/src/main.tsx`) are skipped.

    python3 platform/ci/check_local_assets.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF = re.compile(r'<(?:img|script|link|source)\b[^>]*?\b(?:src|href)\s*=\s*"([^"#?]+)', re.I)
SKIP = re.compile(r'(https?:|//|data:|mailto:|tel:|javascript:|blob:)', re.I)
BUNDLED = ("/src/",)


def broken(page: Path):
    """Yield each local reference in `page` that does not exist on disk."""
    try:
        text = page.read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    for m in REF.finditer(text):
        u = m.group(1).strip()
        if not u or SKIP.match(u) or "${" in u or "{{" in u or u.startswith(BUNDLED):
            continue
        target = (page.parent / u) if not u.startswith("/") else None
        if target is None:
            continue  # root-absolute: depends on the serving root, not checkable here
        if not target.resolve().exists():
            yield u


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad = []
    pages = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        pages += 1
        bad += [(page, u) for u in broken(page)]
    for page, u in bad:
        print(f"{page}: missing {u}")
    print(f"{pages} pages, {len(bad)} missing local references")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
