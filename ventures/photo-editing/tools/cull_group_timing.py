"""Time the cull's all-pairs burst grouping on frames cut by tools/cull_crop_grouping_eval.py.

    PYTHONPATH=src python3 tools/cull_group_timing.py WORK [--n 2000] [--repeat 3] [--plain | --index | --compare]

Draws N frames (seed 1) from the eval's variants (tools/cull_pan_windows_tune.py's
hash cache) and times ``cull._group`` on them, best of ``--repeat``, plus the
number of groups, so two versions of the code can be compared on the same input.
``--plain`` forces the all-pairs scan and ``--index`` the candidate index
(2026-11-18); by default ``_group`` picks by frame count. ``--compare`` times
both and says whether their groups are identical (eval/cull-grouping-index-2026-11-18.txt).
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plain", action="store_true", help="all-pairs scan")
    mode.add_argument("--index", action="store_true", help="candidate index")
    mode.add_argument("--compare", action="store_true", help="time both and compare their groups")
    args = parser.parse_args()
    data = load(args.work)
    keys = random.Random(1).sample(sorted(data), args.n)
    rows = [
        (Path(k), SimpleNamespace(dhash=f"{data[k]['h']:016x}", dhash_crops=tuple(f"{c:016x}" for c in data[k]["c"]),
                                  dhash_zooms=tuple(f"{z:016x}" for z in data[k]["z"])), None)
        for k in keys
    ]
    modes = [True, False] if args.compare else [True if args.index else False if args.plain else None]
    results = []
    for index in modes:
        best = None
        for _ in range(args.repeat):
            t = time.perf_counter()
            groups = cull._group(rows, index=index)
            elapsed = time.perf_counter() - t
            best = elapsed if best is None else min(best, elapsed)
        name = {True: "index", False: "plain", None: "default"}[index]
        print(f"{args.n} frames, {name}: {len(groups)} groups, best of {args.repeat}: {best:.2f} s", flush=True)
        results.append([[str(row[0]) for row in group] for group in groups])
    if args.compare:
        print("identical groups:", results[0] == results[1])
        return 0 if results[0] == results[1] else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
