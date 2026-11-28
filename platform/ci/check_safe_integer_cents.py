#!/usr/bin/env python3
"""Fail when venture code checks a cents amount with Number.isInteger.

`Number.isInteger(1e20)` is true, but past 2**53 a double cannot hold every
cent, so an amount (or a total summed from amounts) that size is off by
dollars with no error. A money check wants `Number.isSafeInteger`, which
refuses it. On 2026-11-28 a red-team run found payapps' pay-app invoice
planner accepting 1e20 cents and summing two MAX_SAFE_INTEGER lines into an
inexact total; the same check sat in 27 other places across 8 products.

The rule: a `Number.isInteger(...)` call whose argument names cents
(`cents`, `amountCents`, `priceCents`, ...) in a non-test .ts/.tsx/.js/.mjs
file under ventures/ fails. Tests are skipped (they may assert the old
behaviour of a third-party function, or build fixtures).

    python3 platform/ci/check_safe_integer_cents.py
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERN = re.compile(r"Number\.isInteger\(([^)]*cents[^)]*)\)", re.IGNORECASE)
EXTS = (".ts", ".tsx", ".js", ".mjs", ".cjs")
SKIP_PARTS = ("node_modules", "dist", "build", ".next")


def is_test(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return ".test." in name or ".spec." in name or "/test/" in f"/{path}" or "/tests/" in f"/{path}"


def findings_in(text: str):
    """[(line_no, argument)] for each Number.isInteger(...) on a cents value."""
    out = []
    for no, line in enumerate(text.splitlines(), 1):
        for m in PATTERN.finditer(line):
            out.append((no, m.group(1).strip()))
    return out


def tracked_files(root: Path = ROOT):
    res = subprocess.run(
        ["git", "ls-files", "-z", "ventures"], cwd=root, capture_output=True, check=True
    )
    for raw in res.stdout.split(b"\0"):
        path = raw.decode("utf-8", "surrogateescape")
        if not path.endswith(EXTS) or is_test(path):
            continue
        if any(f"/{p}/" in f"/{path}" for p in SKIP_PARTS):
            continue
        yield path


def main(root: Path = ROOT) -> int:
    bad = []
    for path in tracked_files(root):
        try:
            text = (root / path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "isInteger" not in text:
            continue
        for no, arg in findings_in(text):
            bad.append(f"{path}:{no}: Number.isInteger({arg}) -> use Number.isSafeInteger")
    if bad:
        print("cents checked with Number.isInteger (accepts 1e20, which cannot hold every cent):")
        print("\n".join(bad))
        return 1
    print("cents checks: every Number.isInteger on a cents value is Number.isSafeInteger")
    return 0


if __name__ == "__main__":
    sys.exit(main())
