#!/usr/bin/env python3
"""Fail if a venture page or script fetches a relative file that is not there.

`fetch("./rates.json")` against a file nobody committed returns the host's 404
page; the calculator then falls back or shows nothing, and no test notices
because the unit tests import the engine and never run the page. Only literal
relative paths with a file extension are checked: absolute paths (`/v1/...`)
are server routes, `http(s)` and `${...}` URLs are somebody else's or dynamic.

    python3 platform/ci/check_local_fetch.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FETCH_RE = re.compile(r"""\bfetch\(\s*["'`](\.{1,2}/[^"'`$\s]+|[\w][^"'`$\s:]*\.\w+)["'`]""")


def missing(text, base):
    """Return [(line, path)] for each literal relative fetch under `base` that does not exist."""
    out = []
    for m in FETCH_RE.finditer(text):
        u = m.group(1).split("?")[0].split("#")[0]
        if not Path(u).suffix or u.startswith(("api/", "v1/")):
            continue
        if not (base / u).exists():
            out.append((text.count("\n", 0, m.start()) + 1, u))
    return out


def scan(root=ROOT):
    bad = []
    for f in sorted((root / "ventures").rglob("*")):
        if f.suffix not in (".html", ".js", ".mjs") or "node_modules" in f.parts or ".test." in f.name:
            continue
        for line, u in missing(f.read_text(encoding="utf-8", errors="ignore"), f.parent):
            bad.append((f.relative_to(root), line, u))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, u in bad:
        print(f"{path}:{line}: fetch('{u}') names a file that does not exist")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
