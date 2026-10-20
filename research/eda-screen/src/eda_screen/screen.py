"""A surrogate screen for the expensive objective (Yosys cell count) in a three-objective design search.

Cycles per inference and held-out error are the cheap objectives: they come from the schedule and a small simulation of the
quantised network, and need no synthesis. Cell count needs a Yosys run. The screen spends `k` syntheses on a spread of
designs, fits a model of log(cells) on those, predicts cells for all 80 designs, and then spends the rest of the budget on
synthesising designs in order of how non-dominated their predicted objective vector is. Syntheses are the only cost counted.
"""
import numpy as np
from .space import DIMS

FEATS = ("const", "log p", "log wb", "fast", "log p * log wb")


def features(x):
    p, wb, abc = DIMS["p"][x[0]], DIMS["wb"][x[1]], x[2]
    lp, lw = np.log(p), np.log(wb)
    return np.array([1.0, lp, lw, float(abc), lp * lw])


def fit_predict(space, measured, ridge=1e-3):
    """Ridge fit of log(cells) on the measured designs; returns predicted cells (normalised like the table) for every design."""
    A = np.array([features(x) for x in measured])
    b = np.log([space.raw_cells(x) for x in measured])
    w = np.linalg.solve(A.T @ A + ridge * np.eye(A.shape[1]), A.T @ b)
    pred = {x: float(np.exp(features(x) @ w)) for x in space.all()}
    return {x: (pred[x] - space.lo[0]) / (space.hi[0] - space.lo[0]) for x in pred}


def spread(space, k, rng):
    """Greedy farthest-point choice of k designs in the unit-scaled index space, from a random start."""
    xs = space.all()
    Z = np.array([[xi / (s - 1) for xi, s in zip(x, space.sizes)] for x in xs])
    chosen = [int(rng.integers(len(xs)))]
    while len(chosen) < k:
        d = np.min(((Z[:, None, :] - Z[chosen][None]) ** 2).sum(-1), axis=1)
        d[chosen] = -1
        chosen.append(int(np.argmax(d)))
    return [xs[i] for i in chosen]


def dominates(a, b):
    """a dominates b under minimisation."""
    return all(y >= x for x, y in zip(a, b)) and any(y > x for x, y in zip(a, b))


def front_ranks(pts):
    """Non-dominated sorting: rank 0 is the non-dominated set of `pts` (dict key -> vector), rank 1 the next, and so on."""
    left, rank, r = dict(pts), {}, 0
    while left:
        front = [k for k, v in left.items() if not any(dominates(u, v) for j, u in left.items() if j != k)]
        for k in front:
            rank[k] = r
            del left[k]
        r += 1
    return rank


class Screen:
    """Proposer with the interface of `proposers.py`: k spread syntheses, then synthesise in order of predicted front rank
    (ties by distance of predicted vector to the origin). Refits after every new synthesis when `refit` is true."""

    def __init__(self, sizes, rng, all_designs, space, k=6, cells="fit"):
        """`cells` picks the cell-count predictor: "fit" (the surrogate), "const" (the same guess for every unmeasured design, so
        only the free objectives guide the order) or "oracle" (the true count, an upper bound that costs no syntheses to know)."""
        self.space, self.rng, self.k, self.cells = space, rng, k, cells
        self.init = spread(space, k, rng) if cells == "fit" else []
        self.name = f"screen{k}"

    def propose(self, seen):
        for x in self.init:
            if x not in seen:
                return x
        sp = self.space
        if self.cells == "fit":
            pred = fit_predict(sp, list(seen))
        elif self.cells == "const":
            pred = {x: 0.5 for x in sp.all()}
        else:
            pred = {x: sp.evaluate(x)[0] for x in sp.all()}
        # predicted vector for unmeasured designs; measured designs keep their true values so they shape the ranks
        vec = {x: (seen[x] if x in seen else (pred[x],) + tuple(sp.cheap(x))) for x in sp.all()}
        rank = front_ranks(vec)
        cand = [x for x in sp.all() if x not in seen]
        cand.sort(key=lambda x: (rank[x], sum(v * v for v in vec[x])))
        return cand[0]
