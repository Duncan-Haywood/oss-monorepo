#!/usr/bin/env python3
"""Flag date regexes that stop reading in the middle of a number.

`/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/` matches "2025-03-091" as 9 March: the day
group takes "09" and nothing says the next character may not be a digit, so a
typo becomes a different, valid date and the tool works from it without a word.
`/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2}|\\d{4})/` is worse: the alternation tries two
digits first, so "01/05/2026" reads as 2020 (the shift-roster importer did this
to every four-digit slash date until the red-team run of 2026-11-15, putting
January shifts on the wrong weekday). The same run found the unbounded ISO form
in 37 parsers, the wash-sale checker's among them, where a moved date can move
a sale in or out of the 30-day window.

A regex literal is flagged when it starts with a numeric date (YYYY-M-D, or
D/M/Y and M/D/Y with any of / . - as separator) and what follows the last date
group can begin with a digit or end the match: the literal ends there, or goes
on with `.*`, `(.*)`, `.+`, or only optional pieces before one of those. A `$`,
a lookahead such as `(?!\\d)`, `\\b`, or a required separator (`[T\\s]+`, `\\s`,
`T`, a space) bounds it. Fix: put `(?!\\d)` after the last date group, and in an
alternation list the four-digit year first: `(\\d{4}|\\d{2})(?!\\d)`.

Usage: python3 platform/ci/check_date_digit_boundary.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SUFFIXES = {".mjs", ".js", ".cjs", ".ts"}
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}

_SEP = r"(?:-|\\/|\\\.|\\[1-9]|\[[^\]\n]*\]|\(\[[^\]\n]*\]\))"
_D12 = r"\(\\d\{1,2\}\)"
_YEAR = r"\((?:\\d\{\d(?:,\d)?\}\|?)+\)"
HEAD = re.compile(r"/\^(?:\(\\d\{4\}\)" + _SEP + _D12 + _SEP + _D12
                  + r"|" + _D12 + _SEP + _D12 + _SEP + _YEAR + r")")
# Pieces that may match nothing, skipped before deciding what bounds the date.
_OPTIONAL_TOKEN = re.compile(r"(?:\\s|\\.|\[[^\]\n]*\]|\.|[ ,T])[*?]")
_UNBOUNDED = re.compile(r"/|\(?\.[*+]|\(\?:\.[*+]")


def _skip_group(rest):
    """Length of a balanced (...) group at the start of `rest`, or 0."""
    if not rest.startswith("("):
        return 0
    depth, i, in_class = 0, 0, False
    while i < len(rest):
        ch = rest[i]
        if ch == "\\":
            i += 2
            continue
        if in_class:
            in_class = ch != "]"
        elif ch == "[":
            in_class = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return 0


def unbounded(rest):
    """True when the text after the last date group lets a digit follow it."""
    while True:
        n = _skip_group(rest)
        if n and rest[n:n + 1] in ("?", "*"):
            rest = rest[n + 1:]
            continue
        m = _OPTIONAL_TOKEN.match(rest)
        if m:
            rest = rest[m.end():]
            continue
        break
    return bool(_UNBOUNDED.match(rest))


def scan_text(text):
    """Line numbers (1-based) of date regexes with no digit boundary after the date."""
    if "(\\d{" not in text:
        return []
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if "/^(\\d{" not in line:
            continue
        for m in HEAD.finditer(line):
            if unbounded(line[m.end():]):
                hits.append(i)
                break
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
        print(f"{h}: this date regex reads \"2025-03-091\" as 9 March (or \"01/05/2026\" as 2020); "
              "put (?!\\d) after the last date group and list a four-digit year first")
    if hits:
        print(f"check_date_digit_boundary: {len(hits)} unbounded date regexes")
        return 1
    print("check_date_digit_boundary: every numeric date regex ends at a digit boundary")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
