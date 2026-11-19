"""Time the cull's all-pairs burst grouping on frames cut by tools/cull_crop_grouping_eval.py.

    PYTHONPATH=src python3 tools/cull_group_timing.py WORK [--n 2000] [--repeat 3] [--plain | --index | --native | --compare]

Draws N frames (seed 1) from the eval's variants (tools/cull_pan_windows_tune.py's
hash cache) and times ``cull._group`` on them, best of ``--repeat``, plus the
number of groups, so two versions of the code can be compared on the same input.
``--plain`` forces the all-pairs scan and ``--index`` the candidate index
(2026-11-18), ``--native`` the C helper (``cull_native``, 2026-11-18); by default ``_group``
runs the C helper when it builds. ``--compare`` times the Python index, the C helper
and (with ``--with-plain``) the all-pairs scan, and says whether their groups are
identical (eval/cull-grouping-index-2026-11-18.txt, eval/cull-grouping-native-2026-11-18.txt).
Since 2026-11-18 it reads tools/cull_fine_offsets_tune.py's cache (which adds the
fine hashes and the 5/7/9% pans); ``--no-fine`` leaves the fine hashes out, as
for a catalogue analysed before then (eval/cull-fine-offsets-2026-11-18.md).
"""
import argparse
import random
import sys
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, "tools")
from cull_fine_offsets_tune import load  # noqa: E402
from shootflow import cull  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("work", type=Path)
    parser.add_argument("--n", type=int, default=2000)
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--no-fine", action="store_true", help="leave the fine hashes out")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plain", action="store_true", help="all-pairs scan")
    mode.add_argument("--index", action="store_true", help="candidate index")
    mode.add_argument("--native", action="store_true", help="the C helper")
    mode.add_argument("--compare", action="store_true", help="time the paths and compare their groups")
    parser.add_argument("--with-plain", action="store_true", help="--compare also times the all-pairs scan")
    args = parser.parse_args()
    data = load(args.work)
    keys = random.Random(1).sample(sorted(data), args.n)
    rows = [
        (Path(k), SimpleNamespace(dhash=f"{data[k]['h']:016x}", dhash_crops=tuple(f"{c:016x}" for c in data[k]["c"]),
                                  dhash_zooms=tuple(f"{z:016x}" for z in data[k]["z"]),
                                  dhash_fine=() if args.no_fine else tuple(f"{f:016x}" for f in data[k]["f"])), None)
        for k in keys
    ]
    if args.compare:
        modes = [True, "native"] + ([False] if args.with_plain else [])
    else:
        modes = [True if args.index else False if args.plain else "native" if args.native else None]
    results = []
    for index in modes:
        best = None
        for _ in range(args.repeat):
            t = time.perf_counter()
            groups = cull._group(rows, index=index)
            elapsed = time.perf_counter() - t
            best = elapsed if best is None else min(best, elapsed)
        name = {True: "index", False: "plain", None: "default", "native": "native"}[index]
        print(f"{args.n} frames, {name}: {len(groups)} groups, best of {args.repeat}: {best:.2f} s", flush=True)
        results.append([[str(row[0]) for row in group] for group in groups])
    if args.compare:
        same = all(r == results[0] for r in results[1:])
        print("identical groups:", same)
        return 0 if same else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
