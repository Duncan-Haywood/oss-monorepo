#!/usr/bin/env python3
"""Fail on money formatters that print "-$0.00" for an amount that rounds to zero.

The shape `(n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2)` takes the sign from
the raw number and the digits from the rounded one, so -0.001 prints "-$0.00"
and money(-0.4) prints "-$0". A profit, gap or balance that is zero to the
cent then reads as a loss. A red-team run on 2026-11-15 found it in
stump-grinding-price-calculator and swept 705 copies in 425 ventures to
`((t) => (n < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)(<formatted>)`, which
signs only text that still has a nonzero digit (or is infinite).

This check flags the old shape when the text after `+` on that line rounds
(toFixed, toLocaleString, round(): an integer-cents formatter that never
rounds cannot disagree with its sign, and is left alone).

    python3 platform/ci/check_negative_zero_money.py [root ...]   exit 1 on a hit
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIRS = ("ventures", "platform", "research")
SUFFIXES = {".mjs", ".js", ".html", ".ts"}
SKIP_PARTS = {"node_modules", "dist", "_site", ".git"}

SIGN_FROM_RAW = re.compile(
    r"\(\s*[\w.]+\s*<\s*0\s*\?\s*([\"'])-[^\"'\n]*\1\s*:\s*([\"'])[^\"'\n]*\2\s*\)\s*\+(?P<rest>[^\n]*)")
ROUNDS = re.compile(r"toFixed\(|toLocaleString\(|\bround\(|Math\.round\(|Intl\.NumberFormat")


def hits_in(text):
    """(line number, line) for each sign-from-raw formatter whose digits are rounded."""
    out = []
    for m in SIGN_FROM_RAW.finditer(text):
        if ROUNDS.search(m.group("rest")):
            line = text.count("\n", 0, m.start()) + 1
            out.append((line, text.splitlines()[line - 1].strip()))
    return out


def scan(roots):
    found = []
    for root in roots:
        for p in sorted(Path(root).rglob("*")):
            if p.suffix not in SUFFIXES or SKIP_PARTS & set(p.parts) or not p.is_file():
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            if "< 0" not in text and "<0" not in text:
                continue
            for line, src in hits_in(text):
                found.append((p, line, src))
    return found


def main(argv):
    roots = [Path(a) for a in argv] or [ROOT / d for d in DEFAULT_DIRS if (ROOT / d).is_dir()]
    found = scan(roots)
    for p, line, src in found:
        try:
            p = p.relative_to(ROOT)
        except ValueError:
            pass
        print(f"{p}:{line}: sign taken before rounding, so a tiny negative prints as \"-$0\": {src[:160]}")
    if found:
        print(f"{len(found)} formatter(s) print \"-$0\" for amounts that round to zero. Fix: "
              "((t) => (n < 0 && /[1-9∞]/.test(t) ? \"-$\" : \"$\") + t)(<formatted abs value>)")
        return 1
    print("check_negative_zero_money: no sign-before-rounding money formatters")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
