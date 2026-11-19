#!/usr/bin/env python3
"""Fail if a venture's range message can print "between 0 and Infinity".

Many venture input readers share one shape: `num(v, name, { min = 0,
max = Infinity })` and, on a bad value, `${name} must be between ${min} and
${max}`. With the open default, a visitor who types -1 reads "Salaries must be
between 0 and Infinity." The FILL=-1 button sweep found three tools doing this
on 2026-11-19 and a grep found eight more (PR #17508); all now say "0 or more"
(or "N or less" for an open lower bound).

This flags a line that interpolates `between ${<lo>} and ${<hi>}` in a file
that also defaults one of those names to Infinity or -Infinity, unless the line
itself mentions Infinity (that is, it already handles the open bound).

    python3 platform/ci/check_open_range_messages.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MESSAGE = re.compile(r"between \$\{\s*(\w+)\s*\} and \$\{\s*(\w+)\s*\}")
SUFFIXES = {".mjs", ".js", ".html"}


def open_defaults(text):
    """Names given an infinite default anywhere in the file (`max = Infinity`)."""
    return set(re.findall(r"\b(\w+)\s*=\s*-?Infinity\b", text))


def scan(text):
    """(line number, line) for each message that can print an infinite bound."""
    names = open_defaults(text)
    if not names:
        return []
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        for lo, hi in MESSAGE.findall(line):
            if (lo in names or hi in names) and "Infinity" not in line:
                hits.append((n, line.strip()))
                break
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT / "ventures")
    args = ap.parse_args(argv)
    found = scanned = 0
    for path in sorted(args.root.rglob("*")):
        if path.suffix not in SUFFIXES or "node_modules" in path.parts:
            continue
        if path.name.endswith((".test.mjs", ".test.js")):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        scanned += 1
        for n, line in scan(text):
            found += 1
            print(f"{path.relative_to(args.root.parent) if args.root.parent in path.parents else path}:{n}: {line[:160]}")
    if not scanned:
        # A wrong --root must not pass while it scans nothing
        # (test_checks_refuse_empty_root.py).
        print(f"no .mjs/.js/.html files under {args.root}: wrong --root?")
        return 2
    if found:
        print(f"{found} range message(s) can print 'Infinity' as a bound; say '${{min}} or more' when max is Infinity.")
        return 1
    print(f"open-ended range messages: 0 of {scanned} files can print Infinity")
    return 0


if __name__ == "__main__":
    sys.exit(main())
