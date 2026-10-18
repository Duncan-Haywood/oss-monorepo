#!/usr/bin/env python3
"""List research projects whose home page has no figure.

`research/PROJECTS.md` (milestone 9) used to carry a hand-counted "about N
projects have none" that went stale within a day and gave false positives for
projects whose figure is an .svg. This asks the page builder's own
`find_figure`, so the answer is exactly what a visitor sees.

    python3 platform/ci/research_figures.py            # slugs with results.txt but no figure
    python3 platform/ci/research_figures.py --all      # every project with no figure
    python3 platform/ci/research_figures.py --count    # just the number

Read-only; always exits 0.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "_homepage"))
import build  # noqa: E402


def figureless(root=None, only_with_results=True):
    root = Path(root) if root else ROOT / "research"
    out = []
    for d in sorted(p for p in root.iterdir() if p.is_dir() and p.name[0] not in "_."):
        if build.RESEARCH != root:
            build.RESEARCH = root
        if build.find_figure(d.name):
            continue
        if only_with_results and not (d / "experiments" / "results.txt").is_file():
            continue
        out.append(d.name)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--all", action="store_true", help="include projects without a results.txt")
    ap.add_argument("--count", action="store_true")
    args = ap.parse_args(argv)
    slugs = figureless(only_with_results=not args.all)
    print(len(slugs) if args.count else "\n".join(slugs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
