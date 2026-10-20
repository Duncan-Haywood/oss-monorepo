"""Compare two prompt versions on run records. Pure standard library."""
import glob
import json
import math
import random
import statistics


def load(runs_dir):
    out = []
    for f in sorted(glob.glob(runs_dir + "/*.json")):
        with open(f) as fh:
            out.append(json.load(fh))
    return out


def metrics(r):
    """Per-run numbers; None where the record does not carry them."""
    return {
        "has_error": 1.0 if r.get("errors") else 0.0,
        "success": 1.0 if r.get("outcome") == "success" else 0.0,
        "friction": float(len(r.get("doc_friction") or [])),
        "deviation": 1.0 if r.get("deviations") else 0.0,
        "cost_usd": r.get("cost_usd"),
        "wall_minutes": r.get("wall_minutes"),
        "tokens_out": r.get("tokens_out"),
    }


def window(runs, track, versions, start):
    """Runs of `track` dated on/after `start` (ISO date) with a prompt version in `versions`."""
    return [r for r in runs if r.get("track") == track and r.get("date")
            and r["date"] >= start and r.get("prompt_version") in versions]


def split(runs, key):
    """({version: [values]}) for metric `key`, dropping runs where it is None."""
    out = {}
    for r in runs:
        v = metrics(r)[key]
        if v is not None:
            out.setdefault(r["prompt_version"], []).append(v)
    return out


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def perm_p(a, b, stat=statistics.mean, reps=10000, seed=1):
    """Two-sided permutation p-value for stat(b) - stat(a)."""
    rng = random.Random(seed)
    obs = abs(stat(b) - stat(a))
    pool = list(a) + list(b)
    na = len(a)
    hits = 0
    for _ in range(reps):
        rng.shuffle(pool)
        if abs(stat(pool[na:]) - stat(pool[:na])) >= obs - 1e-12:
            hits += 1
    return (hits + 1) / (reps + 1)


def boot_diff(a, b, stat=statistics.mean, reps=4000, seed=2):
    """stat(b) - stat(a) with a 95% percentile bootstrap interval."""
    rng = random.Random(seed)
    point = stat(b) - stat(a)
    ds = sorted(stat(rng.choices(b, k=len(b))) - stat(rng.choices(a, k=len(a)))
                for _ in range(reps))
    return point, ds[int(0.025 * reps)], ds[int(0.975 * reps) - 1]


def compare(runs, key, stat=statistics.mean, base=0, cand=1):
    g = split(runs, key)
    a, b = g.get(base, []), g.get(cand, [])
    if len(a) < 2 or len(b) < 2:
        return None
    point, lo, hi = boot_diff(a, b, stat)
    return {"metric": key, "n_base": len(a), "n_cand": len(b),
            "base": stat(a), "cand": stat(b), "diff": point, "lo": lo, "hi": hi,
            "p": perm_p(a, b, stat)}
