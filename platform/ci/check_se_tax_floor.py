#!/usr/bin/env python3
"""Fail when a venture computes annual self-employment tax with no $400 floor.

Schedule SE: when net earnings from self-employment (net profit x 92.35%) are
under $400, no SE tax is owed at all. On 2026-11-11 a red-team run found nine
ventures that charged 15.3% on any profit above zero, or that tested the
floor against profit instead of net earnings (a $420 profit is $387.87 of net
earnings, so it owes nothing). Each copy was a few lines in a different file,
so a test in one venture never caught the next.

The rule here: any non-test venture script that uses the 92.35% factor must
also compare something against the floor (400, 40000 cents, or a named
constant like SE_TAX_FLOOR / SE_MINIMUM), or be listed in EXEMPT with the
reason the annual floor does not apply (a marginal rate on a deduction, a
per-week or per-game rate).

    python3 platform/ci/check_se_tax_floor.py          # whole tree
    python3 platform/ci/check_se_tax_floor.py FILE...  # just these files
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACTOR = re.compile(r"\b0\.9235\b")
FLOOR = re.compile(
    r"(?:<|>=)\s*(?:400|40000|40_000|SE_TAX_FLOOR|SE_MINIMUM|SE_FLOOR|DEFAULTS\.seFloor)\b"
)

# Files that use 0.9235 but never compute a year's SE tax on a whole profit.
EXEMPT = {
    "ventures/mileage-deduction-method-calculator/calc.mjs":
        "marginal SE rate on a deduction, simplification stated on the page",
    "ventures/home-office-deduction-calculator/calc.mjs":
        "marginal SE rate on a deduction, simplification stated in the code",
    "ventures/augusta-rule-calculator/calc.mjs":
        "marginal SE rate on a deduction",
    "ventures/nail-tech-booth-rent-calculator/engine.mjs":
        "per-week reserve rate; the $400 floor is annual",
    "ventures/sports-official-game-fee-calculator/calc.mjs":
        "per-game rate; the $400 floor is annual",
}


def is_candidate(rel: str) -> bool:
    if not rel.startswith("ventures/") or "/node_modules/" in rel:
        return False
    name = rel.rsplit("/", 1)[-1]
    if ".test." in name or name.startswith("test_"):
        return False
    return name.endswith((".mjs", ".js", ".py"))


def problems_in(rel: str, text: str) -> list[str]:
    if rel in EXEMPT or not FACTOR.search(text) or FLOOR.search(text):
        return []
    line = next(i for i, l in enumerate(text.splitlines(), 1) if FACTOR.search(l))
    return [
        f"{rel}:{line}: uses the 92.35% SE factor but never compares net earnings "
        "to the $400 Schedule SE floor (add `if (base < 400) return 0`, or list the "
        "file in EXEMPT in platform/ci/check_se_tax_floor.py with the reason)"
    ]


def scan(paths: list[Path]) -> list[str]:
    out: list[str] = []
    for p in paths:
        rel = p.resolve().relative_to(ROOT).as_posix()
        if not is_candidate(rel) or not p.is_file():
            continue
        out += problems_in(rel, p.read_text(encoding="utf-8", errors="replace"))
    return out


def main(argv: list[str]) -> int:
    if argv:
        paths = [Path(a) for a in argv]
    else:
        paths = [p for ext in ("mjs", "js", "py") for p in (ROOT / "ventures").rglob(f"*.{ext}")]
    found = scan(paths)
    for line in found:
        print(line)
    stale = [rel for rel in EXEMPT if not (ROOT / rel).is_file()]
    for rel in stale:
        print(f"{rel}: listed in EXEMPT but no longer exists; remove the entry")
    if found or stale:
        return 1
    print("check_se_tax_floor: every annual SE tax has the $400 floor")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
