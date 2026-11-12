#!/usr/bin/env python3
"""Fail when a venture's CSV exporter has no spreadsheet formula-injection guard.

A cell that starts with `=`, `+`, `-` or `@` runs as a formula when the CSV is
opened in Excel or Google Sheets (CSV injection, CWE-1236). Our calculators
export what a visitor typed, and many prefill from a shared link, so a crafted
link plus "Download CSV" puts `=HYPERLINK(...)` in front of someone else. The
fix is one line: prefix such a cell with an apostrophe
(`if (/^[=+\\-@\\t\\r]/.test(s)) s = "'" + s;`).

A file counts as an exporter when it defines `toCsv`; it counts as guarded when
it contains a leading-formula-character test (`/^[=`, `/^[=+`, `^[=@]`) or
names the risk ("formula injection", "CSV injection"). On 2026-11-12, 203 of
235 exporters had no guard. They are listed in
`csv_formula_guard_baseline.txt`, a ratchet: a new unguarded exporter fails,
and so does a listed file that is now guarded or gone, so the list only shrinks.

    python3 platform/ci/check_csv_formula_guard.py [--root DIR] [--write-baseline]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("csv_formula_guard_baseline.txt")
EXPORTER = re.compile(r"(function\s+toCsv\b|\btoCsv\s*=\s*(\(|function|async))")
GUARD = re.compile(r"/\^\[=|\^\[=@\]|\^\[=\+|formula[- ]injection|csv[- ]injection", re.I)
SKIP_PARTS = {"node_modules", "dist", "build", ".git", "vendor"}


def is_exporter(text):
    return EXPORTER.search(text) is not None


def is_guarded(text):
    return GUARD.search(text) is not None


def scan(root):
    """Return sorted repo-relative paths of unguarded exporters under root/ventures."""
    base = root / "ventures"
    out = []
    for p in base.rglob("*.mjs"):
        rel = p.relative_to(root)
        if SKIP_PARTS & set(rel.parts) or p.name.endswith(".test.mjs"):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if is_exporter(text) and not is_guarded(text):
            out.append(rel.as_posix())
    return sorted(out)


def read_baseline(path):
    if not path.exists():
        return set()
    return {ln.strip() for ln in path.read_text().splitlines() if ln.strip() and not ln.startswith("#")}


def compare(found, baseline):
    found = set(found)
    return sorted(found - baseline), sorted(baseline - found)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = scan(a.root)
    if a.write_baseline:
        a.baseline.write_text(
            "# Venture CSV exporters with no formula-injection guard (check_csv_formula_guard.py).\n"
            "# Ratchet: remove a line when you add the guard; never add one.\n" + "".join(f + "\n" for f in found))
        print(f"wrote {len(found)} entries to {a.baseline}")
        return 0
    new, stale = compare(found, read_baseline(a.baseline))
    for f in new:
        print(f"{f}: toCsv has no spreadsheet formula-injection guard. Prefix cells starting "
              "=, +, -, @, tab or CR with an apostrophe (see ventures/ucr-fee-calculator/calc.mjs csvCell).")
    for f in stale:
        print(f"{f}: listed in {a.baseline.name} but now guarded or gone; delete its line.")
    if new or stale:
        return 1
    print(f"csv formula guard: ok ({len(found)} unguarded exporters still on the baseline)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
