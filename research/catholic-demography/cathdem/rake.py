"""Raking (iterative proportional fitting) of survey weights to target margins, numpy only.

Used to ask whether observed demographics explain a difference between two groups of respondents (for example web
and in-person completers): the weights of the source group are raked so that its weighted distribution on each
covariate matches the target group's, and the outcome gap is recomputed. Each covariate is a 1-d array of category
codes; a missing value should be coded as its own category before calling (the callers use -1).
"""
import numpy as np


def margins(cats, w):
    """Weighted share of each category of one covariate: dict code -> share."""
    cats = np.asarray(cats)
    w = np.asarray(w, float)
    W = w.sum()
    return {c: float(w[cats == c].sum() / W) for c in np.unique(cats)}


def rake(w, covs, targets, iters=200, tol=1e-9, cap=None):
    """Weights w raked so that, for every covariate k, the weighted share of each code equals targets[k][code].

    covs: list of category arrays (same length as w). targets: list of dicts code -> share (each sums to 1).
    Codes present in the data but absent from a target get weight zero; target codes absent from the data are
    dropped and the remaining target shares renormalised (reported by the caller through max_gap).
    cap: optional ratio limit on the adjustment factor (trimming), applied after each sweep.
    Returns (raked weights with the same total as w, max absolute margin gap after the last sweep, sweeps used).
    """
    w0 = np.asarray(w, float)
    total = w0.sum()
    r = w0.copy()
    covs = [np.asarray(c) for c in covs]
    tgts = []
    for c, t in zip(covs, targets):
        present = set(np.unique(c[w0 > 0]).tolist())
        keep = {k: v for k, v in t.items() if k in present}
        s = sum(keep.values())
        tgts.append({k: v / s for k, v in keep.items()} if s > 0 else {})
    gap = np.inf
    for it in range(1, iters + 1):
        for c, t in zip(covs, tgts):
            f = np.zeros_like(r)
            cur = r.sum()
            for code, share in t.items():
                m = c == code
                have = r[m].sum()
                if have > 0:
                    f[m] = share * cur / have
            r = r * f
        if cap is not None:
            ratio = np.divide(r, w0, out=np.ones_like(r), where=w0 > 0)
            ratio = np.clip(ratio, 1 / cap, cap)
            r = w0 * ratio
        r = r * total / r.sum()
        gap = max((abs(r[c == code].sum() / r.sum() - share) for c, t in zip(covs, tgts) for code, share in t.items()),
                  default=0.0)
        if gap < tol:
            return r, float(gap), it
    return r, float(gap), iters


def kish_deff(w):
    """Kish's design effect from unequal weights, 1 + cv^2: how much the raking costs in effective sample size."""
    w = np.asarray(w, float)
    w = w[w > 0]
    return float(len(w) * (w ** 2).sum() / w.sum() ** 2)
