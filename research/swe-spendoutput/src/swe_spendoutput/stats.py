"""Cost against output for run records. Pure standard library."""
import math
import random


def rank(xs):
    """Average ranks (1-based), ties share the mean rank."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(x, y):
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx == 0 or syy == 0:
        return float("nan")
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / math.sqrt(sxx * syy)


def spearman(x, y):
    return pearson(rank(x), rank(y))


def slope(x, y):
    """Least-squares slope of y on x."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / sxx


def elasticity(cost, out):
    """Slope of log(output) on log(cost): output scales as cost**slope. Needs positive values."""
    return slope([math.log(c) for c in cost], [math.log(o) for o in out])


def boot(stat, cost, out, reps=2000, seed=1):
    """Point estimate and 95% percentile bootstrap interval of stat(cost, out), resampling runs."""
    n = len(cost)
    rng = random.Random(seed)
    vals = []
    for _ in range(reps):
        idx = rng.choices(range(n), k=n)
        v = stat([cost[i] for i in idx], [out[i] for i in idx])
        if v == v:
            vals.append(v)
    vals.sort()
    return stat(cost, out), vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


def terciles(cost, out):
    """Per cost tercile: (n, cost range, total cost, total output, output per dollar)."""
    order = sorted(range(len(cost)), key=lambda i: cost[i])
    n = len(order)
    res = []
    for t in range(3):
        idx = order[t * n // 3:(t + 1) * n // 3]
        c = sum(cost[i] for i in idx)
        o = sum(out[i] for i in idx)
        res.append((len(idx), cost[idx[0]], cost[idx[-1]], c, o, o / c))
    return res
