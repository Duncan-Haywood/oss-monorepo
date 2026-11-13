"""Side preference and lane order from real bidirectional corridor trajectories.

Stdlib only. Used by experiments/m1_hermes_sides.py and tests/test_lanes.py.

Coordinates follow the Juelich (FZJ) trajectory files: x, y, z in cm, the
corridor runs along y, x = 0 is one wall and x = W the other, z is head height
(up). In that right-handed frame a walker heading +y has their right at +x.
"""
from __future__ import annotations

import random
from collections import defaultdict


def parse_trajectories(lines):
    """Yield (pid, frame, x, y) from 'id frame x y [z]' lines; skip comments."""
    for line in lines:
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if len(parts) < 4:
            continue
        yield int(float(parts[0])), int(float(parts[1])), float(parts[2]), float(parts[3])


def in_section(x, y, width_cm, y_half_cm=400.0):
    return 0.0 <= x <= width_cm and -y_half_cm <= y <= y_half_cm


def walkers(rows, width_cm, min_frames=16, min_travel_cm=200.0):
    """Per walker inside the measured section: direction (+1/-1) and samples.

    A walker counts if they spend at least `min_frames` frames in the section
    and their net y displacement there is at least `min_travel_cm`.
    Returns {pid: (direction, [(frame, x, y), ...])}.
    """
    pts = defaultdict(list)
    for pid, frame, x, y in rows:
        if in_section(x, y, width_cm):
            pts[pid].append((frame, x, y))
    out = {}
    for pid, p in pts.items():
        if len(p) < min_frames:
            continue
        p.sort()
        dy = p[-1][2] - p[0][2]
        if abs(dy) < min_travel_cm:
            continue
        out[pid] = (1 if dy > 0 else -1, p)
    return out


def right_offset(x, direction, width_cm):
    """Signed lateral offset toward the walker's own right, in half-widths (-1..1)."""
    half = width_cm / 2.0
    return (x - half) / half if direction > 0 else (half - x) / half


def mean_right_offset(direction, samples, width_cm):
    return sum(right_offset(x, direction, width_cm) for _, x, _ in samples) / len(samples)


def lane_order_frame(xs_dirs, bin_cm=30.0):
    """Occupancy-weighted mean over lateral bins of ((N+ - N-)/(N+ + N-))^2.

    1 means every bin holds one direction only; for random mixing with equal
    flows it is near 1/n for bins of n walkers.
    """
    bins = defaultdict(lambda: [0, 0])
    for x, d in xs_dirs:
        b = bins[int(x // bin_cm)]
        b[0 if d > 0 else 1] += 1
    num = 0.0
    tot = 0
    for p, m in bins.values():
        n = p + m
        num += n * ((p - m) / n) ** 2
        tot += n
    return num / tot if tot else float("nan")


def frames_by_time(ws, step=1, min_each=4):
    """{frame: [(x, dir), ...]} for frames with at least `min_each` of each direction."""
    fr = defaultdict(list)
    for _, (d, samples) in ws.items():
        for frame, x, _ in samples:
            if frame % step == 0:
                fr[frame].append((x, d))
    return {f: v for f, v in fr.items()
            if sum(1 for _, d in v if d > 0) >= min_each and sum(1 for _, d in v if d < 0) >= min_each}


def lane_order(frames, bin_cm=30.0):
    vals = [lane_order_frame(v, bin_cm) for v in frames.values()]
    return sum(vals) / len(vals) if vals else float("nan")


def lane_order_null(frames, n_shuffle, rng, bin_cm=30.0):
    """Mean lane order after shuffling direction labels within each frame."""
    means = []
    items = list(frames.values())
    for _ in range(n_shuffle):
        tot = 0.0
        for v in items:
            xs = [x for x, _ in v]
            ds = [d for _, d in v]
            rng.shuffle(ds)
            tot += lane_order_frame(list(zip(xs, ds)), bin_cm)
        means.append(tot / len(items))
    return means


def median(v):
    s = sorted(v)
    n = len(s)
    if n == 0:
        return float("nan")
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def quantile(v, q):
    s = sorted(v)
    i = q * (len(s) - 1)
    lo = int(i)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def bootstrap_share(flags, n, rng):
    """95% percentile interval of the mean of 0/1 flags."""
    k = len(flags)
    reps = [sum(flags[rng.randrange(k)] for _ in range(k)) / k for _ in range(n)]
    return quantile(reps, 0.025), quantile(reps, 0.975)


def bootstrap_share_clustered(groups, n, rng):
    """Two-stage bootstrap: resample groups (runs), then members within each."""
    reps = []
    g = len(groups)
    for _ in range(n):
        tot = cnt = 0
        for _ in range(g):
            flags = groups[rng.randrange(g)]
            k = len(flags)
            tot += sum(flags[rng.randrange(k)] for _ in range(k))
            cnt += k
        reps.append(tot / cnt)
    return quantile(reps, 0.025), quantile(reps, 0.975)


def walker_speeds(ws, fps, lag_frames):
    """Median speed (m/s) per walker from displacement over `lag_frames` frames."""
    out = []
    for _, (_, samples) in ws.items():
        by_f = {f: (x, y) for f, x, y in samples}
        v = []
        for f, x, y in samples:
            g = by_f.get(f + lag_frames)
            if g:
                v.append(((g[0] - x) ** 2 + (g[1] - y) ** 2) ** 0.5 / 100.0 * fps / lag_frames)
        if v:
            out.append(median(v))
    return out


def spearman(a, b):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2.0
            i = j + 1
        return r
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else float("nan")


__all__ = [n for n in dir() if not n.startswith("_") and n not in ("random", "defaultdict", "annotations")]
