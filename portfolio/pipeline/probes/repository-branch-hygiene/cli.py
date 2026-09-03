#!/usr/bin/env python3
"""Run the branch-hygiene scanner and write a report + recovery manifest.

Usage:
    python3 cli.py --demo [out_dir]
        Builds the synthetic fixture repo (see fixture_repo.py) and scans
        it. Default `out_dir` is ./out relative to this file.

    python3 cli.py --repo PATH --protected main,master [out_dir]
        Scans an existing local repository read-only. No recorded-tip
        (PR-close snapshot) data is available outside the fixture, so
        `moved` will never be reported for a bare `--repo` scan -- that is
        a known limitation, stated in the README, not a silent gap.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fixture_repo import build as build_fixture
from record import write_report
from scanner import classify_repo


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--protected", default="main,master")
    parser.add_argument("out_dir", nargs="?", default=None)
    args = parser.parse_args(argv)

    if bool(args.demo) == bool(args.repo):
        parser.error("pass exactly one of --demo or --repo")

    protected = {name.strip() for name in args.protected.split(",") if name.strip()}
    recorded_tips: dict[str, str] = {}

    if args.demo:
        fixture = build_fixture()
        repo = fixture.repo
        protected = fixture.protected
        recorded_tips = fixture.recorded_tips
        out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).resolve().parent / "out"
    else:
        repo = args.repo
        out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).resolve().parent / "out"

    classifications = classify_repo(repo, protected=protected, recorded_tips=recorded_tips)

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = write_report(
        classifications,
        out_json=out_dir / "recovery-manifest.json",
        out_md=out_dir / "report.md",
    )

    for category, count in sorted(manifest["counts_by_category"].items()):
        print(f"{category}: {count}")
    print(f"wrote {out_dir / 'report.md'}")
    print(f"wrote {out_dir / 'recovery-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
