#!/usr/bin/env python3
"""Draw a research track the way research/PROJECTS.md "Picking work" says.

r < 0.05 is a free-choice run; otherwise track = 1 + floor((r - 0.05) / 0.95 * 12).
Pass a number to map a draw you already have: pick_track.py 0.11
"""
import math
import random
import sys


def pick(r):
    if r < 0.05:
        return "free"
    return min(12, 1 + math.floor((r - 0.05) / 0.95 * 12))


if __name__ == "__main__":
    r = float(sys.argv[1]) if len(sys.argv) > 1 else random.random()
    print(f"draw {r:.3f} -> {'free-choice' if pick(r) == 'free' else 'track ' + str(pick(r))}")
