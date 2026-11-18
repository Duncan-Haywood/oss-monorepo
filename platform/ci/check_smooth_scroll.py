#!/usr/bin/env python3
"""Fail if a venture page scrolls smoothly without honouring reduced motion.

`scrollIntoView({behavior: "smooth"})` animates even when the visitor asked
their OS for less motion (WCAG 2.3.3, vestibular disorders). `--fix` rewrites
the literal to `(matchMedia("(prefers-reduced-motion: reduce)").matches ?
"auto" : "smooth")`, which keeps the smooth scroll for everyone else.

    python3 platform/ci/check_smooth_scroll.py [--root DIR] [--fix]   # exit 1 if any left
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAT = re.compile(r"""behavior:\s*(["'])smooth\1""")
GUARD = 'behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"'


def scan(root):
    for p in sorted(Path(root).glob("ventures/*/**/*.html")):
        if not {"node_modules", ".next"}.isdisjoint(p.parts):
            continue
        s = p.read_text(encoding="utf-8", errors="replace")
        if PAT.search(s):
            yield p, s


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--fix", action="store_true")
    a = ap.parse_args(argv)
    left = 0
    for p, s in scan(a.root):
        if a.fix:
            p.write_text(PAT.sub(lambda m: GUARD, s), encoding="utf-8")
        else:
            left += 1
            print(f"{p.relative_to(a.root)}: unguarded smooth scroll")
    print(f"{left} page(s) with an unguarded smooth scroll")
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
