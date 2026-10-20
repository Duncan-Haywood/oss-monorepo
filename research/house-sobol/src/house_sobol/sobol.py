"""Variance-based global sensitivity (Sobol indices) of `house_cost`'s price index.

Inputs, each independent: the ten lever parameters of house-cost (uniform over its low-high range), the framing
materials share (uniform, an assumption of this project), and the driver splits as ONE group: every (stage, driver)
weight is multiplied by exp(sigma * z), z ~ N(0,1), then each stage is renormalised. Indices are estimated with
the Saltelli (2010) first-order and Jansen total-order estimators on plain seeded Monte Carlo, with a bootstrap
interval. The NAHB shares are never varied, so the reference house always prices at 100.
"""
import random
from statistics import NormalDist

from house_cost import model
from house_cost.model import House, per_sqft_index, price

_INV = NormalDist().inv_cdf
SHARE_RANGE = (0.30, 0.60)  # framing materials share of framing cost; house-cost assumes 0.45


def lever_params(levers):
    """[(kwarg name, low, high)] from house-cost's LEVERS (each lever varies exactly one House field)."""
    out = []
    for _, lo, hi in levers:
        (k, a), = lo.items()
        (k2, b), = hi.items()
        assert k == k2
        out.append((k, a, b))
    return out


def groups(levers):
    """Input groups: name -> number of uniform columns it consumes. Order: levers, framing share, splits."""
    g = [(k, 1) for k, _, _ in lever_params(levers)]
    g.append(("framing_share", 1))
    g.append(("splits", sum(len(s) for s in model.STAGE_DRIVERS.values() if len(s) > 1)))
    return g


def perturb_splits(us, sigma):
    """Splits from uniform columns us: lognormal tilt on each weight of each multi-driver stage, renormalised."""
    out, i = {}, 0
    for stage, split in model.STAGE_DRIVERS.items():
        if len(split) == 1:
            out[stage] = dict(split)
            continue
        w = {}
        for d, base in split.items():
            w[d] = base * pow(2.718281828459045, sigma * _INV(min(max(us[i], 1e-9), 1 - 1e-9)))
            i += 1
        t = sum(w.values())
        out[stage] = {d: v / t for d, v in w.items()}
    return out


def evaluate(row, levers, sigma):
    """row: uniform columns in `groups` order -> (price index, price per sq ft index)."""
    params = lever_params(levers)
    kw = {k: a + u * (b - a) for (k, a, b), u in zip(params, row)}
    n = len(params)
    share = SHARE_RANGE[0] + row[n] * (SHARE_RANGE[1] - SHARE_RANGE[0])
    split = perturb_splits(row[n + 1:], sigma)
    saved_split, saved_share = dict(model.STAGE_DRIVERS), model.FRAMING_MATERIAL_SHARE
    model.STAGE_DRIVERS.clear()
    model.STAGE_DRIVERS.update(split)
    model.FRAMING_MATERIAL_SHARE = share
    try:
        h = House(**kw)
        return price(h)["price"], per_sqft_index(h)
    finally:
        model.STAGE_DRIVERS.clear()
        model.STAGE_DRIVERS.update(saved_split)
        model.FRAMING_MATERIAL_SHARE = saved_share


def _var(x):
    m = sum(x) / len(x)
    return sum((v - m) ** 2 for v in x) / len(x)


def indices(fa, fb, fab, idx=None):
    """Saltelli first-order and Jansen total-order index of one group. fab: outputs with that group taken from B."""
    idx = range(len(fa)) if idx is None else idx
    a, b, ab = [fa[i] for i in idx], [fb[i] for i in idx], [fab[i] for i in idx]
    m = sum(a + b) / (2 * len(a))  # centre: the Saltelli estimator is badly noisy when the mean dwarfs the sd
    a, b, ab = [x - m for x in a], [x - m for x in b], [x - m for x in ab]
    v = _var(a + b)
    s1 = sum(y * (z - x) for x, y, z in zip(a, b, ab)) / len(a) / v
    st = 0.5 * sum((x - z) ** 2 for x, z in zip(a, ab)) / len(a) / v
    return s1, st


def run(levers, n, sigma, seed=0, boot=200):
    """-> {output: {group: (S1, S1 lo, S1 hi, ST, ST lo, ST hi)}} and {output: variance, mean} for 2 outputs."""
    rng = random.Random(seed)
    gs = groups(levers)
    d = sum(c for _, c in gs)
    A = [[rng.random() for _ in range(d)] for _ in range(n)]
    B = [[rng.random() for _ in range(d)] for _ in range(n)]
    fa = [evaluate(r, levers, sigma) for r in A]
    fb = [evaluate(r, levers, sigma) for r in B]
    cols, start = {}, 0
    for name, c in gs:
        cols[name] = range(start, start + c)
        start += c
    res = {0: {}, 1: {}}
    stats = {}
    for o in (0, 1):
        ya = [f[o] for f in fa]
        yb = [f[o] for f in fb]
        stats[o] = (sum(ya + yb) / (2 * n), _var(ya + yb))
    brng = random.Random(seed + 1)
    boots = [[brng.randrange(n) for _ in range(n)] for _ in range(boot)]
    for name, _ in gs:
        ab = []
        for i in range(n):
            r = list(A[i])
            for c in cols[name]:
                r[c] = B[i][c]
            ab.append(evaluate(r, levers, sigma))
        for o in (0, 1):
            ya, yb, yab = [f[o] for f in fa], [f[o] for f in fb], [f[o] for f in ab]
            s1, st = indices(ya, yb, yab)
            bs = [indices(ya, yb, yab, ix) for ix in boots]
            s1s, sts = sorted(b[0] for b in bs), sorted(b[1] for b in bs)
            lo, hi = int(0.025 * boot), int(0.975 * boot) - 1
            res[o][name] = (s1, s1s[lo], s1s[hi], st, sts[lo], sts[hi])
    return res, stats
