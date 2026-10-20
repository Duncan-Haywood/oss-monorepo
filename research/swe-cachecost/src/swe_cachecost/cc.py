"""Split run cost into token components and fit how each grows with run length (standard library only)."""
import math
import random
import statistics

COMPONENTS = ("input", "output", "cache_read", "cache_write_5m", "cache_write_1h")


def totals(r):
    """The usage totals of a record, or None if the record has no per-component measurement."""
    t = (r.get("usage") or {}).get("totals")
    if not isinstance(t, dict) or not pos(t.get("requests")):
        return None
    return t


def usable(r):
    t = totals(r)
    return t is not None and pos(r.get("cost_usd")) and pos(r.get("tool_calls")) and t.get("api_equivalent_complete") is True


def tokens_total(t):
    return sum(t.get(c) or 0 for c in COMPONENTS)


def cost_shares(r, prices):
    """Per-component share of the run's API-equivalent cost, by the price table of the record's primary model.

    Returns None if the model has no price row. Thinking tokens are already inside `output`."""
    t = totals(r)
    m = (r["usage"] or {}).get("primary_model")
    row = prices.get(m)
    if row is None:
        return None
    parts = {c: (t.get(c) or 0) * row[c] / 1e6 for c in COMPONENTS}
    tot = sum(parts.values())
    return {c: v / tot for c, v in parts.items()} if tot else None


def loglog(rs, xf, yf):
    pts = [(math.log(xf(r)), math.log(yf(r))) for r in rs if pos(xf(r)) and pos(yf(r))]
    return [p[0] for p in pts], [p[1] for p in pts]


def pos(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0


def fit(xs, ys):
    """Ordinary least squares y = a + b x. Returns (a, b, r2)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    b = sxy / sxx
    return my - b * mx, b, (sxy * sxy / (sxx * syy) if syy else 0.0)


def slope_ci(xs, ys, reps=2000, seed=1):
    """Percentile bootstrap 95% interval for the slope."""
    rnd = random.Random(seed)
    n = len(xs)
    bs = []
    for _ in range(reps):
        idx = [rnd.randrange(n) for _ in range(n)]
        sx = [xs[i] for i in idx]
        if max(sx) == min(sx):
            continue
        bs.append(fit(sx, [ys[i] for i in idx])[1])
    bs.sort()
    return bs[int(0.025 * len(bs))], bs[int(0.975 * len(bs)) - 1]


def quantile(v, q):
    s = sorted(v)
    return s[min(len(s) - 1, int(q * len(s)))]
