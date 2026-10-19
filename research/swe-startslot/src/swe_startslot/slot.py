"""Start-slot analysis of run records: concurrency at start and hour of day.

Pure standard library. A run is 'crowded' when at least `k` other recorded runs
started within `window` minutes of it. The test compares crowded and uncrowded
runs on a binary outcome, shuffling the crowded label within calendar days so
that the slow drift of the process over the 19 days cannot produce a difference.
"""
import datetime as D
import glob
import json
import os
import random

FORMATS = ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M")


def parse_time(s):
    if not s:
        return None
    s = s.rstrip("Z")
    for f in FORMATS:
        try:
            return D.datetime.strptime(s, f)
        except ValueError:
            pass
    return None


def load(runs_dir):
    """Records with a parseable start time, sorted by it."""
    out = []
    for f in sorted(glob.glob(os.path.join(runs_dir, "*.json"))):
        try:
            r = json.load(open(f))
        except ValueError:
            continue
        t = parse_time(r.get("started"))
        if t is not None:
            out.append((t, r))
    out.sort(key=lambda x: x[0])
    return out


def neighbours(times, window):
    """Number of other starts within `window` minutes of each start (times sorted)."""
    n, out = len(times), []
    lo = hi = 0
    for i, t in enumerate(times):
        while (t - times[lo]).total_seconds() > window * 60:
            lo += 1
        while hi < n and (times[hi] - t).total_seconds() <= window * 60:
            hi += 1
        out.append(hi - lo - 1)
    return out


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return (c - h, c + h)


def stratified_diff(strata):
    """strata: list of (crowded_flag list, outcome list) per day.
    Returns (difference of means crowded - uncrowded, pooled over days weighting
    each day by its min(n_crowded, n_uncrowded) harmonic weight)."""
    num = den = 0.0
    for flags, ys in strata:
        a = [y for f, y in zip(flags, ys) if f]
        b = [y for f, y in zip(flags, ys) if not f]
        if not a or not b:
            continue
        w = len(a) * len(b) / (len(a) + len(b))
        num += w * (sum(a) / len(a) - sum(b) / len(b))
        den += w
    return num / den if den else 0.0


def permutation_p(strata, reps, seed):
    """Two-sided p for the stratified difference; the crowded labels are shuffled within day."""
    rng = random.Random(seed)
    obs = stratified_diff(strata)
    hits = 0
    for _ in range(reps):
        sh = []
        for flags, ys in strata:
            f = list(flags)
            rng.shuffle(f)
            sh.append((f, ys))
        if abs(stratified_diff(sh)) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (reps + 1)


def by_day(rows, flags, outcome):
    days = {}
    for (t, r), f in zip(rows, flags):
        d = days.setdefault(t.date(), ([], []))
        d[0].append(f)
        d[1].append(outcome(r))
    return list(days.values())
