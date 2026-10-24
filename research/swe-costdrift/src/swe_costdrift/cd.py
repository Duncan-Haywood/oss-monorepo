"""Cost drift of agent runs over calendar days. Standard library only."""
import glob, json, os, random, statistics, datetime

RUNS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "prompts", "runs")


def load(path=RUNS):
    out = []
    for f in sorted(glob.glob(os.path.join(path, "*.json"))):
        try:
            r = json.load(open(f))
        except ValueError:
            continue
        if isinstance(r, dict) and r.get("cost_usd") and r.get("tool_calls") and r.get("started"):
            out.append(r)
    return out


def day(r):
    return datetime.date.fromisoformat(r["started"][:10]).toordinal()


def theil_sen(xs, ys):
    """Median of pairwise slopes (x differing); robust to the long cost tail."""
    s = [(ys[j] - ys[i]) / (xs[j] - xs[i]) for i in range(len(xs)) for j in range(i + 1, len(xs)) if xs[j] != xs[i]]
    return statistics.median(s) if s else float("nan")


def drift(runs, key="cost_usd", boot=300, seed=1):
    """Log-cost trend in percent per day: 100*(exp(slope)-1), with a percentile bootstrap interval over runs."""
    xs = [day(r) for r in runs]
    ys = [_v(r, key) for r in runs]
    pct = lambda b: 100 * (2.718281828459045 ** b - 1)
    point = pct(theil_sen(xs, ys))
    rng = random.Random(seed)
    n = len(runs)
    bs = []
    for _ in range(boot):
        idx = [rng.randrange(n) for _ in range(n)]
        bs.append(pct(theil_sen([xs[i] for i in idx], [ys[i] for i in idx])))
    bs.sort()
    return point, bs[int(0.025 * boot)], bs[int(0.975 * boot) - 1]


def _v(r, key):
    import math
    v = r["cost_usd"] / r["tool_calls"] if key == "per_call" else r["tool_calls"] if key == "calls" else r[key]
    return math.log(v)


def daily_medians(runs, key="cost_usd", min_n=5):
    by = {}
    for r in runs:
        by.setdefault(day(r), []).append(r["cost_usd"] / r["tool_calls"] if key == "per_call" else r[key])
    return [(datetime.date.fromordinal(d).isoformat(), len(v), statistics.median(v)) for d, v in sorted(by.items()) if len(v) >= min_n]
