"""A Pareto screen driven by a cost model trained on other design families (original code, MIT).

Two minimised objectives per design: log cells (costs one Yosys synthesis to measure) and cycles (free: a function of
the schedule). A method spends a budget of syntheses on one held-out family and is scored by the hypervolume of the
front of the designs it has synthesised, as a fraction of the true front's hypervolume.
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


def normalise(cells, cycles):
    """Objectives of one space scaled to [0, 1]: log cells and cycles, min-max within the space."""
    o = np.stack([np.log(cells), np.asarray(cycles, float)], 1)
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


def _pick(est, cyc, measured, truth_cells):
    """Next design: lowest front of (estimated or measured log-cells, cycles); ties by hypervolume gain; then index."""
    n = len(est)
    c = est.copy()
    for i in measured:
        c[i] = truth_cells[i]
    O = np.stack([c, cyc], 1)
    rk = fronts(O)
    cand = [i for i in range(n) if i not in measured]
    top = min(rk[i] for i in cand)
    cand = [i for i in cand if rk[i] == top]
    base = [O[i] for i in measured]
    gain = [hv2(base + [O[i]]) - hv2(base) for i in cand]
    return cand[int(np.argmax(gain))]


def free_only(O, budget, rs=None):
    """Order by cycles-only information: synthesise the free-objective front layers first (deterministic tie by index)."""
    cyc = O[:, 1]
    rk = fronts(np.stack([np.zeros(len(cyc)), cyc], 1))
    return list(np.lexsort((np.arange(len(cyc)), rk)))[:budget]


def cycles_first_random(O, budget, rs):
    """Lowest-cycles-first, random within equal cycles. With one free objective the free front is just the lowest-cycles layer."""
    cyc = O[:, 1]
    layer = np.searchsorted(np.unique(cyc), cyc)
    key = rs.random_sample(len(cyc))
    return list(np.lexsort((key, layer)))[:budget]


def random_order(O, budget, rs):
    return [int(i) for i in rs.permutation(len(O))[:budget]]


def spread(Z, k):
    """Greedy farthest-point choice of k rows of Z (Gonzalez, 1985), starting from the row nearest the centroid."""
    c = [int(np.argmin(((Z - Z.mean(0)) ** 2).sum(1)))]
    d = ((Z - Z[c[0]]) ** 2).sum(1)
    while len(c) < k:
        j = int(np.argmax(d))
        c.append(j)
        d = np.minimum(d, ((Z - Z[j]) ** 2).sum(1))
    return c


def feature_space(X):
    Z = np.log1p(X)
    sd = Z.std(0)
    keep = sd > 1e-9
    return (Z[:, keep] - Z[:, keep].mean(0)) / sd[keep]


def screen(Xs, cycles, cells, Xother, yother, budget, kind="ridge", k=0, w=5.0, refit=True, seed=0):
    """Order in which the screen synthesises the designs of one space (Xs features, cycles, true cells).

    The surrogate starts from the other families (Xother, yother). `k` designs picked by farthest-point spread are
    synthesised first (and count towards `budget`); after every synthesis the measured designs join the training set at
    weight `w` and the model is refit when `refit`. `cells` is read only for designs already measured.
    """
    cyc = np.asarray(cycles, float)
    cyc = (cyc - cyc.min()) / max(cyc.max() - cyc.min(), 1e-9)  # cycles are free, so their range is known
    order = list(spread(feature_space(Xs), k)) if k else []

    def est_of(meas):
        tr_X, tr_y, wt = Xother, yother, np.ones(len(yother))
        if meas:
            tr_X = np.vstack([Xother, Xs[meas]])
            tr_y = np.concatenate([yother, cells[meas]])
            wt = np.concatenate([wt, np.full(len(meas), w)])
        return np.log(Model(kind, seed).fit(tr_X, tr_y, wt).predict(Xs))

    est = est_of([])
    lo, hi = est.min(), est.max()
    if hi - lo < 1e-9:  # a constant model: fall back to the log-range of the training cells
        hi = lo + np.log(yother.max() / yother.min())
    # axis range for the hypervolume tie-break comes from the first prediction, never from truth
    truth = np.full(len(Xs), np.nan)
    while len(order) < budget:
        meas = list(order)
        if refit and meas:
            est = est_of(meas)
        e = (est - lo) / (hi - lo)
        truth[meas] = (np.log(cells[meas]) - lo) / (hi - lo)  # measured designs only
        order.append(_pick(e, cyc, set(meas), truth))
    return order[:budget]


def hv_curve(O, order, true_hv):
    """Fraction of the true hypervolume after 1..len(order) syntheses."""
    return np.array([hv2(O[order[:i]]) / true_hv for i in range(1, len(order) + 1)])
