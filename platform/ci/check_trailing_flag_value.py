#!/usr/bin/env python3
"""Fail if a new CLI reads a flag's value with `argv[++i]` and never checks it was given.

Red team 2026-11-20: `node check.mjs <dir> --manifest` in
ventures/obsidian-plugin-review-check left the override `undefined`, so
runCheck fell back to the first manifest.json it found and the CI gate passed
on a file the user never named. The same `x = argv[++i]` idiom appears in
about 240 CLI files; most predate this check and are listed in
`trailing_flag_value_baseline.txt`. This is a ratchet: a file not in the
baseline that reads `<name>[++i]` must also show it checks for a missing value
(one of the GUARDS below), and a baseline entry that no longer needs listing
is reported so the list only shrinks.

    python3 platform/ci/check_trailing_flag_value.py            # exit 1 on a new unguarded file
    python3 platform/ci/check_trailing_flag_value.py --list     # print every unguarded file
    python3 platform/ci/check_trailing_flag_value.py --write-baseline

A guard is any of: `=== undefined` / `== null` on the value, a bounds test
against `argv.length` / `i + 1 >=`, or an error message saying the flag
"needs a value" / "needs a file" / "requires a value" / "missing value".
It is a text heuristic: it proves a file thought about the trailing flag, not
that every flag is covered. Run by unwired_checks.py on every pull request.
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("trailing_flag_value_baseline.txt")
READ = re.compile(r"\b\w+\[\+\+i\]")
GUARDS = re.compile(
    r"=== undefined|== null|>= \w+\.length|i \+ 1 >=|i \+ 1 < \w+\.length"
    r"|needs a (?:value|file)|requires a value|missing value"
)
SUFFIXES = {".mjs", ".js", ".cjs", ".ts"}
SKIP_PARTS = {"node_modules", ".git", "dist", "build", "vendor"}


def is_test(path):
    name = path.name
    return ".test." in name or name.startswith("test_") or "test" in path.parts or "tests" in path.parts


def candidates(root):
    for top in ("ventures", "platform", "research"):
        base = root / top
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.suffix not in SUFFIXES or not p.is_file() or is_test(p):
                continue
            if SKIP_PARTS.intersection(p.relative_to(root).parts):
                continue
            yield p


def unguarded(root):
    out = []
    for p in candidates(root):
        text = p.read_text(encoding="utf-8", errors="replace")
        if READ.search(text) and not GUARDS.search(text):
            out.append(p.relative_to(root).as_posix())
    return sorted(out)


def read_baseline(path):
    if not path.exists():
        return set()
    return {ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = unguarded(a.root)
    if a.list:
        print("\n".join(found))
        return 0
    if a.write_baseline:
        a.baseline.write_text(
            "# Files that read a flag value with argv[++i] and no missing-value check, as of 2026-11-20.\n"
            "# Shrink only: fix a file (see check_trailing_flag_value.py) and delete its line.\n"
            + "".join(f"{f}\n" for f in found),
            encoding="utf-8",
        )
        print(f"wrote {len(found)} entries to {a.baseline}")
        return 0
    base = read_baseline(a.baseline)
    new = [f for f in found if f not in base]
    stale = sorted(base - set(found))
    for f in stale:
        print(f"note: {f} no longer needs its baseline line (fixed or removed); delete it from {a.baseline.name}")
    if new:
        for f in new:
            print(f"{f}: reads a flag value with [++i] but never checks it was given;"
                  " a trailing `--flag` leaves it undefined. Exit 2 with a usage line when the value is missing.")
        return 1
    print(f"trailing-flag check: {len(found)} unguarded file(s), all in the baseline; {len(stale)} stale baseline line(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
