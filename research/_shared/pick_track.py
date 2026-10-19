#!/usr/bin/env python3
"""Draw a research track the way research/PROJECTS.md "Picking work" says.

r < 0.05 is a free-choice run; otherwise track = 1 + floor((r - 0.05) / 0.95 * 16).
Pass a number to map a draw you already have: pick_track.py 0.11

For a track it also lists that track's projects on this checkout (newest commit
first), so the "Next steps" of the latest one is one `cat` away when the
milestones in PROJECTS.md are all done. Fetch origin/main first: a stale
checkout hides projects other runs landed.
"""
import math
import random
import subprocess
import sys
from pathlib import Path

PREFIX = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment",
          "eda", "accel", "osrobot", "swe", "mimic", "house", "capture",
          "codesign", "sensing", "energy"]
RESEARCH = Path(__file__).resolve().parents[1]


def pick(r):
    if r < 0.05:
        return "free"
    return min(16, 1 + math.floor((r - 0.05) / 0.95 * 16))


def projects(prefix, limit=5):
    """(count, newest `limit` project dirs) for slugs starting `prefix-`."""
    dirs = sorted(d.name for d in RESEARCH.glob(prefix + "-*") if d.is_dir())

    def stamp(name):
        out = subprocess.run(["git", "log", "-1", "--format=%ct", "--", name],
                             cwd=RESEARCH, capture_output=True, text=True).stdout.strip()
        return int(out or 0)

    return len(dirs), sorted(dirs, key=stamp, reverse=True)[:limit]


if __name__ == "__main__":
    r = float(sys.argv[1]) if len(sys.argv) > 1 else random.random()
    t = pick(r)
    print(f"draw {r:.3f} -> {'free-choice' if t == 'free' else 'track ' + str(t)}")
    if t != "free":
        n, newest = projects(PREFIX[t - 1])
        print(f"{n} `{PREFIX[t - 1]}-*` projects on this checkout; newest: {', '.join(newest) or 'none'}")
        if newest:
            shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                                     cwd=RESEARCH, capture_output=True, text=True).stdout.strip() == "true"
            note = " (shallow clone: order is not by date; unshallow first)" if shallow else ""
            print(f"next step if milestones are done: research/{newest[0]}/README.md, 'Next steps'{note}")
