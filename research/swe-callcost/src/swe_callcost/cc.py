"""Log-log fit of run cost on tool-call count, with cross-validation and a bootstrap (standard library only)."""
import math
import random
import statistics


def pos(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0


def usable(r):
    return pos(r.get("cost_usd")) and pos(r.get("tool_calls"))


def fit(xs, ys):
    """Ordinary least squares y = a + b x. Returns (a, b, r2)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    b = sxy / sxx
    a = my - b * mx
    return a, b, (sxy * sxy / (sxx * syy) if syy else 0.0)


def loglog(runs, xk="tool_calls", yk="cost_usd"):
    pts = [(math.log(r[xk]), math.log(r[yk])) for r in runs if pos(r.get(xk)) and pos(r.get(yk))]
    return [p[0] for p in pts], [p[1] for p in pts]


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


def cv_errors(xs, ys, k=5, seed=1):
    """k-fold held-out absolute percentage error of the predicted cost (not log cost)."""
    rnd = random.Random(seed)
    idx = list(range(len(xs)))
    rnd.shuffle(idx)
    errs = []
    for f in range(k):
        test = set(idx[f::k])
        tr = [i for i in idx if i not in test]
        a, b, _ = fit([xs[i] for i in tr], [ys[i] for i in tr])
        for i in test:
            pred = math.exp(a + b * xs[i])
            errs.append(abs(pred - math.exp(ys[i])) / math.exp(ys[i]))
    return errs


def ratio_errors(xs, ys, k=5, seed=1):
    """Same folds, but predict cost as (median cost per call on the training folds) x calls."""
    rnd = random.Random(seed)
    idx = list(range(len(xs)))
    rnd.shuffle(idx)
    errs = []
    for f in range(k):
        test = set(idx[f::k])
        med = statistics.median(math.exp(ys[i] - xs[i]) for i in idx if i not in test)
        for i in test:
            true = math.exp(ys[i])
            errs.append(abs(med * math.exp(xs[i]) - true) / true)
    return errs


def quantile(v, q):
    s = sorted(v)
    return s[min(len(s) - 1, int(q * len(s)))]
