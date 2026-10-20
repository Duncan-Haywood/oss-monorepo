#!/usr/bin/env python3
"""List research projects that have committed results but no figure.

`research/PROJECTS.md` milestone 9 asks every project with a `results.txt` (or
`results.json`) to also ship a figure. A hand-kept count of those went stale
(33 written, 25 real) and a plain `ls *.png` check misses `.svg` figures. This
counts any .png/.svg/.jpg under the project directory.

    python3 platform/ci/figureless_projects.py          # names, one per line
    python3 platform/ci/figureless_projects.py --count  # just the number
"""
import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIGURE_SUFFIXES = {".png", ".svg", ".jpg", ".jpeg"}
RESULT_NAMES = {"results.txt", "results.json"}


def figureless(research: Path) -> list[str]:
    out = []
    for proj in sorted(p for p in research.iterdir() if p.is_dir()):
        files = [f for f in proj.rglob("*") if f.is_file()]
        if not any(f.name in RESULT_NAMES for f in files):
            continue
        if not any(f.suffix.lower() in FIGURE_SUFFIXES for f in files):
            out.append(proj.name)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--count", action="store_true")
    ap.add_argument("--research", type=Path, default=REPO / "research")
    args = ap.parse_args(argv)
    names = figureless(args.research)
    print(len(names) if args.count else "\n".join(names))
    return 0


if __name__ == "__main__":
    sys.exit(main())
