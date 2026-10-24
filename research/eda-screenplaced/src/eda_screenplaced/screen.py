"""A Pareto screen over two placed objectives, both paid for by one placement run (original code, MIT).

Each design has placed area (um^2) and placed period (ns), both minimised. Measuring either costs one place-and-route run
that reveals both. A method spends a budget of placements on one space and is scored by the hypervolume of the front of the
designs it has placed, as a fraction of the true front's hypervolume. Cost models are trained on other families only.
"""
import numpy as np

from .models import Model

REF = 1.1


def hv2(points, ref=REF):
    """Hypervolume of 2-D minimised points in [0, 1]^2 against (ref, ref)."""
    pts = sorted((float(a), float(b)) for a, b in points if a < ref and b < ref)
    hv, best_b = 0.0, ref
    for a, b in pts:
        if b < best_b:
            hv += (ref - a) * (best_b - b)
            best_b = b
    return hv


def normalise(area, period):
    """Objectives of one space scaled to [0, 1]: log area and log period, min-max within the space."""
    o = np.stack([np.log(area), np.log(period)], 1)
    lo, hi = o.min(0), o.max(0)
    return (o - lo) / np.where(hi > lo, hi - lo, 1.0)


def fronts(O):
    """Non-dominated-sorting front index (0 is best) of each row of O (minimised), as in NSGA-II (Deb et al., 2002)."""
    n = len(O)
    rank = np.full(n, -1)
    left = set(range(n))
    r = 0
    while left:
        cur = [i for i in left if not any(j != i and np.all(O[j] <= O[i]) and np.any(O[j] < O[i]) for j in left)]
        for i in cur:
            rank[i] = r
        left -= set(cur)
        r += 1
    return rank


def random_order(n, budget, rs):
    return [int(i) for i in rs.permutation(n)[:budget]]


def oracle_order(O, budget):
    """Place the true front first (the best possible order), then the rest by front."""
    return list(np.lexsort((np.arange(len(O)), fronts(O))))[:budget]


def _pick(E, measured, truth):
    """Next design: lowest front of (estimated or measured) objectives; ties by hypervolume gain, then index."""
    n = len(E)
    O = E.copy()
    for i in measured:
        O[i] = truth[i]
    rk = fronts(O)
    cand = [i for i in range(n) if i not in measured]
    top = min(rk[i] for i in cand)
    cand = [i for i in cand if rk[i] == top]
    base = [O[i] for i in measured]
    gain = [hv2(base + [O[i]]) - hv2(base) for i in cand]
    return cand[int(np.argmax(gain))]


def screen(Xs, area, period, Xother, aother, pother, budget, kinds=("ridge", "ridge"), refit=True, w=5.0, seed=0):
    """Order in which the screen places the designs of one space.

    `kinds` names the cost model of (area, period): 'ridge', 'linear', 'gbr', or 'mean' (a constant: the objective is
    unpredicted). Models start from the other families (Xother, aother, pother); after every placement the measured designs
    join the training set at weight `w` when `refit`. Estimates and measured values share one axis, log of the objective
    scaled by the range of the other families' values, so truth is read only for designs already placed.
    """
    ys = [np.asarray(aother, float), np.asarray(pother, float)]
    truth_v = [np.asarray(area, float), np.asarray(period, float)]
    lo = [np.log(y).min() for y in ys]
    sp = [max(np.log(y).max() - np.log(y).min(), 1e-9) for y in ys]

    def est_of(meas):
        cols = []
        for o in range(2):
            tr_X, tr_y, wt = Xother, ys[o], np.ones(len(ys[o]))
            if meas:
                tr_X = np.vstack([Xother, Xs[meas]])
                tr_y = np.concatenate([ys[o], truth_v[o][meas]])
                wt = np.concatenate([wt, np.full(len(meas), w)])
            cols.append((np.log(Model(kinds[o], seed).fit(tr_X, tr_y, wt).predict(Xs)) - lo[o]) / sp[o])
        return np.stack(cols, 1)

    E = est_of([])
    truth = np.full((len(Xs), 2), np.nan)
    order = []
    while len(order) < budget:
        if refit and order:
            E = est_of(order)
        for o in range(2):
            truth[order, o] = (np.log(truth_v[o][order]) - lo[o]) / sp[o]
        order.append(_pick(E, set(order), truth))
    return order[:budget]


def hv_curve(O, order, true_hv):
    """Fraction of the true hypervolume after 1..len(order) placements."""
    return np.array([hv2(O[order[:i]]) / true_hv for i in range(1, len(order) + 1)])
