"""Passing side in head-on encounters between pedestrians, from trajectories.

Stdlib only. Used by experiments/m7_wild_sides.py and tests/test_encounters.py.

Frames: every function here takes positions and velocities in a ground frame
that is right-handed seen from above (x to y is a counter-clockwise turn).
In such a frame a walker with velocity v sees a point at offset r on their
left when cross(v, r) > 0. Scenes whose world frame is mirrored are flipped
by the caller (see `world_handedness`).
"""
from __future__ import annotations

import math
import random
from collections import defaultdict


def cross(ax, ay, bx, by):
    return ax * by - ay * bx


def apply_h(h, a, b):
    """Apply a 3x3 homography (nested lists) to (a, b)."""
    x = h[0][0] * a + h[0][1] * b + h[0][2]
    y = h[1][0] * a + h[1][1] * b + h[1][2]
    z = h[2][0] * a + h[2][1] * b + h[2][2]
    return x / z, y / z


def world_handedness(h, row, col, eps=1e-2):
    """+1 if the world frame of an image->world homography is right-handed from above.

    `h` maps image (row, col) to world (x, y), as the ETH/UCY `H.txt` files do
    (checked here by drawing world tracks back onto video frames). The image
    frame (col to the right, row down) is an unmirrored view of the ground from
    above, and in (col, row) order it is left-handed. So the world frame is
    right-handed exactly when the map from (col, row) to (x, y) reverses
    orientation, i.e. its Jacobian determinant is negative.
    """
    x0, y0 = apply_h(h, row, col)
    xc, yc = apply_h(h, row, col + eps)   # d/d col
    xr, yr = apply_h(h, row + eps, col)   # d/d row
    det = (xc - x0) * (yr - y0) - (xr - x0) * (yc - y0)  # columns: (d/dcol, d/drow)
    return 1 if det < 0 else -1


def by_frame(tracks):
    """tracks: {pid: [(t, x, y, vx, vy), ...]} -> {t: [(pid, x, y, vx, vy), ...]}."""
    out = defaultdict(list)
    for pid, pts in tracks.items():
        for t, x, y, vx, vy in pts:
            out[t].append((pid, x, y, vx, vy))
    return out


def encounters(tracks, groups=None, max_dist=2.0, min_angle_deg=135.0, min_speed=0.3, hand=1):
    """Head-on encounters and the side on which each pair passed.

    For every pair of walkers seen together, find the sample of closest
    approach. Keep the pair if, at that sample, both move faster than
    `min_speed`, their headings differ by more than `min_angle_deg`, the
    distance is under `max_dist`, and the closest sample is strictly inside
    their shared window (so they were approaching before and parting after).
    Pairs in the same group are skipped.

    Returns a list of (t, side) with side +1 if each walker had the other on
    their left (the pair kept right), -1 if each had the other on their right
    (kept left), 0 if the two views disagree. `hand` = -1 mirrors the frame.
    """
    group_of = {}
    for gi, g in enumerate(groups or []):
        for pid in g:
            group_of[pid] = gi
    cos_max = math.cos(math.radians(min_angle_deg))
    frames = by_frame(tracks)
    best = {}      # (a, b) -> (dist, t, side)
    first = {}     # (a, b) -> first shared t
    last = {}
    for t in sorted(frames):
        rows = frames[t]
        n = len(rows)
        for i in range(n):
            pa, xa, ya, vxa, vya = rows[i]
            for j in range(i + 1, n):
                pb, xb, yb, vxb, vyb = rows[j]
                if pa in group_of and group_of.get(pb) == group_of[pa]:
                    continue
                key = (pa, pb) if pa < pb else (pb, pa)
                if key not in first:
                    first[key] = t
                last[key] = t
                d = math.hypot(xb - xa, yb - ya)
                cur = best.get(key)
                if cur is not None and cur[0] <= d:
                    continue
                sa = math.hypot(vxa, vya)
                sb = math.hypot(vxb, vyb)
                ok = sa > min_speed and sb > min_speed and \
                    (vxa * vxb + vya * vyb) / (sa * sb) < cos_max if sa > 0 and sb > 0 else False
                if not ok:
                    best[key] = (d, t, None)
                    continue
                ca = hand * cross(vxa, vya, xb - xa, yb - ya)
                cb = hand * cross(vxb, vyb, xa - xb, ya - yb)
                side = 1 if ca > 0 and cb > 0 else (-1 if ca < 0 and cb < 0 else 0)
                best[key] = (d, t, side)
    out = []
    for key, (d, t, side) in best.items():
        if side is None or d >= max_dist:
            continue
        if not (first[key] < t < last[key]):
            continue
        out.append((t, side))
    out.sort()
    return out


def share_right(enc):
    """(kept right, kept left, disagreeing, share kept right among the decided)."""
    r = sum(1 for _, s in enc if s == 1)
    lft = sum(1 for _, s in enc if s == -1)
    z = sum(1 for _, s in enc if s == 0)
    return r, lft, z, (r / (r + lft) if r + lft else float("nan"))


def blocks(enc, block_s):
    """Group decided encounters into time blocks: list of (n_right, n_decided)."""
    b = defaultdict(lambda: [0, 0])
    for t, s in enc:
        if s == 0:
            continue
        k = int(t // block_s)
        b[k][1] += 1
        if s == 1:
            b[k][0] += 1
    return [tuple(v) for _, v in sorted(b.items())]


def boot_share(clusters, n, rng):
    """Bootstrap the pooled share over clusters [(n_right, n_decided), ...]."""
    out = []
    m = len(clusters)
    for _ in range(n):
        r = d = 0
        for _ in range(m):
            a, b = clusters[rng.randrange(m)]
            r += a
            d += b
        out.append(r / d if d else float("nan"))
    return out


def ci(samples, lo=0.025, hi=0.975):
    s = sorted(x for x in samples if x == x)
    if not s:
        return float("nan"), float("nan")
    return s[int(lo * (len(s) - 1))], s[int(hi * (len(s) - 1))]


def boot_ci(clusters, n=2000, seed=0):
    return ci(boot_share(clusters, n, random.Random(seed)))
