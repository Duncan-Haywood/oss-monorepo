#!/usr/bin/env python3
"""Flag money parsers that read "$-12.50" or "USD -3.00" as a positive amount.

The usual parser decides the sign with `/^[-−]/.test(s)` (or
`s.startsWith("-")`) and then strips every character that is not a digit, a
dot or a comma. A minus that comes after a currency symbol or code fails the
first test and is then stripped, so "$-12.50" parses as +12.50: a refund reads
as a sale, a fee reversal as a charge, a credit in a journal as a debit. The
red-team run of 2026-11-14 found it in the restaurant delivery commission
analyzer and 39 sibling parsers (report analyzers, categorizers and the
statement-to-journal converters); six more caught "$-" but not "USD -3".

A line is flagged when it sets `neg` from a leading-minus test only (`/^[-−]/`,
`/^-/`, `startsWith("-")` or `/^\\$?\\s*[-−]/`), has no test for a minus
anywhere before the first digit (`/^[^0-9]*[-−]/`), and the line or the
three after it strip characters with `.replace(/[...]/` or pick the digits
with `.match(/\\d`. A parser that refuses anything but a plain number (no
strip) is left alone. Exit 1 lists each hit.
Usage: python3 platform/ci/check_parse_sign.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
NEG = re.compile(r"\bneg\w*\s*=")
LEAD = re.compile(r"/\^\[-−\]/\.test\(|/\^-/\.test\(|\.startsWith\(\s*[\"']-[\"']\s*\)|/\^\\\$\?\\s\*\[-−\]/\.test\(")
SAFE = re.compile(r"\[\^0-9\]\*\[-−\]|\[\^\\d\]\*\[-−\]")
STRIP = re.compile(r"\.replace\(/\[|\.match\(/\\d")
WINDOW = 3
SUFFIXES = {".mjs", ".js", ".cjs", ".ts"}
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}


def scan_text(text):
    """Line numbers (1-based) of sign tests that miss a minus after a symbol."""
    lines = text.splitlines()
    hits = []
    for i, line in enumerate(lines, 1):
        if NEG.search(line) and LEAD.search(line) and not SAFE.search(line) \
                and STRIP.search("\n".join(lines[i - 1:i + WINDOW])):
            hits.append(i)
    return hits


def scan(roots):
    hits = []
    for root in roots:
        for p in sorted(pathlib.Path(root).rglob("*")):
            if p.suffix not in SUFFIXES or not p.is_file() or SKIP_PARTS & set(p.parts):
                continue
            if ".test." in p.name or p.name.endswith(".min.js"):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for n in scan_text(text):
                hits.append(f"{p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}:{n}")
    return hits


def main(argv):
    roots = argv or [ROOT / "ventures", ROOT / "platform"]
    hits = scan(roots)
    for h in hits:
        print(f'{h}: this sign test reads "$-12.50" as +12.50 (the minus after the symbol is stripped); '
              "test for a minus anywhere before the first digit: /^[^0-9]*[-−]/.test(s)")
    if hits:
        return 1
    print('check_parse_sign: no money parser reads "$-12.50" as positive')
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
