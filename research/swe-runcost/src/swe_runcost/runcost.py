"""Cost statistics for agent runs. Pure standard library."""
import json
import math
import random
import statistics


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def median_ci(xs, reps=2000, seed=1):
    """Median and 95% percentile-bootstrap interval."""
    rng = random.Random(seed)
    n = len(xs)
    meds = sorted(statistics.median(rng.choices(xs, k=n)) for _ in range(reps))
    return statistics.median(xs), meds[int(0.025 * reps)], meds[int(0.975 * reps) - 1]


def top_share(xs, frac):
    """Share of the total held by the largest `frac` of values (at least one)."""
    k = max(1, round(frac * len(xs)))
    return sum(sorted(xs, reverse=True)[:k]) / sum(xs)


def ols_slope(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxx = sum((a - mx) ** 2 for a in x)
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / sxx


def loglog_slope_ci(x, y, reps=2000, seed=1):
    """Slope of log y on log x (the scaling exponent) with a 95% bootstrap interval."""
    pts = [(math.log(a), math.log(b)) for a, b in zip(x, y) if a > 0 and b > 0]
    rng = random.Random(seed)
    slope = ols_slope(*zip(*pts))
    boots = []
    for _ in range(reps):
        xs, ys = zip(*rng.choices(pts, k=len(pts)))
        if len(set(xs)) > 1:  # a resample of one repeated x has no slope
            boots.append(ols_slope(xs, ys))
    boots.sort()
    return slope, boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]


def fit_two(x1, x2, y):
    """Least squares y ~ a*x1 + b*x2 (no intercept) by the normal equations."""
    s11 = sum(a * a for a in x1)
    s12 = sum(a * b for a, b in zip(x1, x2))
    s22 = sum(b * b for b in x2)
    t1 = sum(a * c for a, c in zip(x1, y))
    t2 = sum(b * c for b, c in zip(x2, y))
    det = s11 * s22 - s12 * s12
    return (t1 * s22 - t2 * s12) / det, (s11 * t2 - s12 * t1) / det


def summarise(runs):
    cost = [r["cost_usd"] for r in runs]
    by_track = {}
    for r in runs:
        by_track.setdefault(r["track"], []).append(r["cost_usd"])
    tracks = {}
    total = sum(cost)
    for t, v in sorted(by_track.items(), key=lambda kv: -sum(kv[1])):
        med, lo, hi = median_ci(v)
        tracks[t] = {"n": len(v), "total": sum(v), "share": sum(v) / total,
                     "median": med, "lo": lo, "hi": hi}
    both = [r for r in runs if r.get("tokens_in") and r.get("tokens_out")]
    a, b = fit_two([r["tokens_in"] / 1e6 for r in both],
                   [r["tokens_out"] / 1e6 for r in both], [r["cost_usd"] for r in both])
    tc = [r for r in runs if r.get("tool_calls")]
    ci_wall = [r for r in runs if r.get("wall_minutes")]
    return {
        "runs": len(runs), "total": total, "mean": total / len(runs),
        "median": median_ci(cost),
        "top10_share": top_share(cost, 0.10), "top1_share": top_share(cost, 0.01),
        "tracks": tracks,
        "per_mtok_in": a, "per_mtok_out": b,
        "toolcall_exponent": loglog_slope_ci([r["tool_calls"] for r in tc], [r["cost_usd"] for r in tc]),
        "wall_exponent": loglog_slope_ci([r["wall_minutes"] for r in ci_wall], [r["cost_usd"] for r in ci_wall]),
        "tokens_in_exponent": loglog_slope_ci([r["tool_calls"] for r in tc if r.get("tokens_in")],
                                              [r["tokens_in"] for r in tc if r.get("tokens_in")]),
    }
