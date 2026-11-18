"""Time the cull's all-pairs burst grouping on frames cut by tools/cull_crop_grouping_eval.py.

    PYTHONPATH=src python3 tools/cull_group_timing.py WORK [--n 2000] [--repeat 3]

Draws N frames (seed 1) from the eval's variants (tools/cull_pan_windows_tune.py's
hash cache) and times ``cull._group`` on them, best of ``--repeat``, plus the
number of groups, so two versions of the code can be compared on the same input.
"""
import argparse
import random
import sys
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, "tools")
from cull_pan_windows_tune import load  # noqa: E402
from shootflow import cull  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("work", type=Path)
    parser.add_argument("--n", type=int, default=2000)
    parser.add_argument("--repeat", type=int, default=3)
    args = parser.parse_args()
    data = load(args.work)
    keys = random.Random(1).sample(sorted(data), args.n)
    rows = [
        (Path(k), SimpleNamespace(dhash=f"{data[k]['h']:016x}", dhash_crops=tuple(f"{c:016x}" for c in data[k]["c"]),
                                  dhash_zooms=tuple(f"{z:016x}" for z in data[k]["z"])), None)
        for k in keys
    ]
    best = None
    for _ in range(args.repeat):
        t = time.perf_counter()
        groups = cull._group(rows)
        elapsed = time.perf_counter() - t
        best = elapsed if best is None else min(best, elapsed)
    print(f"{args.n} frames: {len(groups)} groups, best of {args.repeat}: {best:.2f} s")


if __name__ == "__main__":
    main()
