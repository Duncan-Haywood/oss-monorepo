#!/usr/bin/env python3
"""Run `node --test` for many ventures in parallel and print one line each.

A serial loop over ~1,300 ventures takes hours; this takes minutes on 4 cores.
Usage:
    python3 platform/ci/run_venture_tests.py                 # every venture
    python3 platform/ci/run_venture_tests.py slug-a slug-b   # named ventures
    python3 platform/ci/run_venture_tests.py --changed       # ventures changed vs origin/main
Exit 0 when every suite passes (ventures with no tests are skipped), else 1.
"""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"


def tests_in(slug):
    return sorted(str(p) for p in (VENTURES / slug).rglob("*.test.mjs"))


def changed_slugs():
    out = subprocess.run(["git", "diff", "--name-only", "origin/main...HEAD", "--", "ventures"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return sorted({l.split("/")[1] for l in out.splitlines() if l.count("/") >= 2})


def run(slug):
    files = tests_in(slug)
    if not files:
        return slug, None, ""
    p = subprocess.run(["node", "--test", *files], cwd=ROOT, capture_output=True, text=True)
    return slug, p.returncode == 0, (p.stdout + p.stderr)[-1500:]


def main(argv):
    if "--changed" in argv:
        slugs = changed_slugs()
    else:
        slugs = argv or sorted(d.name for d in VENTURES.iterdir() if d.is_dir())
    failed = ran = 0
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        for slug, ok, tail in pool.map(run, slugs):
            if ok is None:
                continue
            ran += 1
            if not ok:
                failed += 1
                print(f"FAIL {slug}\n{tail}")
    print(f"{ran} suites run, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
