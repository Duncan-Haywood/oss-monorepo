#!/usr/bin/env python3
"""List ventures that ship no `llms.txt`, flagships first.

`goals.md` ("LLM docs and a marketing page") asks product PRs to keep the
product's `llms.txt` current. Nothing listed which ventures lack one, and a
hand-rolled loop found 1,292 of 1,300 missing (explore-run friction). Flagships
come first because `CLAUDE.md` points venture runs at them.

    python3 platform/ci/missing_llms_txt.py             # flagships, then the rest
    python3 platform/ci/missing_llms_txt.py --count     # "missing/total"
    python3 platform/ci/missing_llms_txt.py --flagships # only missing flagships
"""
import argparse
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def flagship_names(path: Path) -> list[str]:
    if not path.exists():
        return []
    return re.findall(r"^\s*-\s*venture:\s*(\S+)", path.read_text(), re.M)


def missing(ventures: Path, flagships: list[str]) -> tuple[list[str], list[str], int]:
    # NOT-A-VENTURE marks personal tools with no public surface to describe.
    dirs = sorted(p for p in ventures.iterdir()
                  if p.is_dir() and not (p / "NOT-A-VENTURE").exists())
    names = [p.name for p in dirs if not (p / "llms.txt").exists()]
    first = [f for f in flagships if f in names]
    rest = [n for n in names if n not in first]
    return first, rest, len(dirs)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--count", action="store_true")
    ap.add_argument("--flagships", action="store_true")
    a = ap.parse_args()
    first, rest, total = missing(
        REPO / "ventures", flagship_names(REPO / "portfolio" / "flagships.yaml"))
    if a.count:
        print(f"{len(first) + len(rest)}/{total}")
        return 0
    for n in first:
        print(f"{n}\t(flagship)")
    if not a.flagships:
        for n in rest:
            print(n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
