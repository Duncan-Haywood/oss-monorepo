#!/usr/bin/env python3
"""Fail if a served venture page has a `<table>` and no `<th>` anywhere.

A table of bare `<td>` cells gives a screen-reader user no row or column
names (WCAG 1.3.1). Label-and-value tables take `<th scope="row">` on the
label; list tables take a `<thead>` with `<th scope="col">`. The check is per
page, not per table: it counts a `<th` in the HTML or in a script template
that fills the table, and ignores comments and JSON-LD text.

    python3 platform/ci/check_table_headers.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMENT = re.compile(r"<!--.*?-->|<script[^>]*ld\+json[^>]*>.*?</script>", re.S)


def headerless(html):
    """True if the page has a table but no header cell."""
    html = COMMENT.sub("", html)
    return re.search(r"<table[\s>]", html) is not None and re.search(r"<th(?![a-zA-Z-])", html) is None


def scan(root):
    skip = {"node_modules", ".git"}
    return [
        f for f in sorted(Path(root).glob("ventures/*/**/*.html"))
        if not skip & set(f.parts) and headerless(f.read_text(encoding="utf8", errors="replace"))
    ]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args(argv)
    bad = scan(a.root)
    for f in bad:
        print(f"{f.relative_to(a.root)}: <table> with no <th> header cells")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
