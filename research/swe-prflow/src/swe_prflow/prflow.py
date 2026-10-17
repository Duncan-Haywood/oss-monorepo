"""Lifecycle statistics for closed pull requests (created and merged times only)."""
import math
from datetime import datetime, timedelta
from statistics import median

YEAR = "2026-"


def parse(path):
    """Return a list of dicts {n, created, merged|None} from prs.txt (line order = PR number)."""
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            c, m = line.split()
            rows.append({
                "n": len(rows) + 1,
                "created": datetime.fromisoformat(YEAR + c),
                "merged": None if m == "-" else datetime.fromisoformat(YEAR + m),
            })
    return rows


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def quantile(xs, q):
    xs = sorted(xs)
    if not xs:
        return None
    i = q * (len(xs) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def latencies_min(rows):
    return [(r["merged"] - r["created"]).total_seconds() / 60 for r in rows if r["merged"]]


def era(r):
    d = r["created"].date().isoformat()
    return "bulk (09-28..10-01)" if d <= YEAR + "10-01" else "tracked (10-05..)"


def merge_rate_by(rows, key):
    out = {}
    for r in rows:
        g = out.setdefault(key(r), [0, 0])
        g[1] += 1
        g[0] += r["merged"] is not None
    return out


def batch_merges(rows, min_size=3):
    """Groups of >= min_size PRs sharing one merge timestamp to the second, with the latency each waited."""
    by = {}
    for r in rows:
        if r["merged"]:
            by.setdefault(r["merged"], []).append(r)
    return [(t, g) for t, g in sorted(by.items()) if len(g) >= min_size]


def bursts(rows, gap_s=10):
    """Maximal runs of PRs each created within gap_s of the previous one; returns lists of size >= 2."""
    runs, cur = [], [rows[0]]
    for a, b in zip(rows, rows[1:]):
        if (b["created"] - a["created"]).total_seconds() <= gap_s:
            cur.append(b)
        else:
            runs.append(cur)
            cur = [b]
    runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def burst_membership(rows, gap_s=10):
    ids = {r["n"] for run in bursts(rows, gap_s) for r in run}
    return ids
