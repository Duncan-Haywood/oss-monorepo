"""Survival discrimination and calibration metrics with survey (or bootstrap-count) weights.

All functions take person-level arrays: follow-up time in years `t`, event indicator `d`
(dissolution), a risk score (higher = more likely to dissolve), and weights `w`.
"""
import numpy as np


def harrell_c(t, d, score, w):
    """Weighted Harrell's C. A pair (i, j) is comparable when i dissolved at t_i < t_j; it is
    concordant when score_i > score_j; equal scores count one half. Weight of a pair: w_i w_j.
    O(n log n) with a Fenwick tree over score ranks of the risk set (t_j > t_i)."""
    t, d, score, w = map(np.asarray, (t, d, score, w))
    keep = w > 0
    t, d, score, w = t[keep], d[keep], score[keep], w[keep]
    uniq, rank = np.unique(score, return_inverse=True)
    n = len(uniq)
    tree_w = np.zeros(n + 1)
    order = np.argsort(-t, kind='stable')
    conc = ties = total = 0.0
    tot_w = 0.0

    def add(i, v):
        i += 1
        while i <= n:
            tree_w[i] += v
            i += i & -i

    def prefix(i):
        s = 0.0
        while i > 0:
            s += tree_w[i]
            i -= i & -i
        return s
    i = 0
    N = len(order)
    while i < N:
        j = i
        while j < N and t[order[j]] == t[order[i]]:
            j += 1
        grp = order[i:j]
        for k in grp:
            if d[k]:
                below = prefix(rank[k])
                at = prefix(rank[k] + 1) - below
                conc += w[k] * below
                ties += w[k] * at
                total += w[k] * tot_w
        for k in grp:
            add(rank[k], w[k])
            tot_w += w[k]
        i = j
    return (conc + 0.5 * ties) / total if total > 0 else np.nan


def km_censoring(t, d, w):
    """Weighted Kaplan-Meier of the censoring distribution G(u) = P(C > u); returns a function
    giving G just before u (left limit)."""
    order = np.argsort(t, kind='stable')
    ts, cs, ws = t[order], (1 - d)[order], w[order]
    times, idx = np.unique(ts, return_index=True)
    c = np.add.reduceat(ws * cs, idx)
    leaving = np.add.reduceat(ws, idx)
    at_risk = ws.sum() - np.concatenate([[0.0], np.cumsum(leaving)[:-1]])
    factor = np.where(at_risk > 0, 1 - c / np.where(at_risk > 0, at_risk, 1), 1.0)
    prefix = np.concatenate([[1.0], np.cumprod(factor)])

    def G_minus(u):
        return np.maximum(prefix[np.searchsorted(times, u, side='left')], 1e-6)
    return G_minus


def auc_at(t, d, score, w, horizon):
    """Cumulative/dynamic time-dependent AUC at `horizon` with inverse-probability-of-censoring
    weights (Uno et al. 2007): cases dissolved by the horizon, controls still married after it."""
    t, d, score, w = map(np.asarray, (t, d, score, w))
    G = km_censoring(t, d, w)
    case = (t <= horizon) & (d == 1)
    ctrl = t > horizon
    wc = w[case] / G(t[case])
    wk = w[ctrl] / G(np.full(ctrl.sum(), horizon))
    sc, sk = score[case], score[ctrl]
    order = np.argsort(sk)
    sk, wk = sk[order], wk[order]
    cw = np.concatenate([[0], np.cumsum(wk)])
    lo = np.searchsorted(sk, sc, side='left')
    hi = np.searchsorted(sk, sc, side='right')
    num = np.sum(wc * (cw[lo] + 0.5 * (cw[hi] - cw[lo])))
    den = wc.sum() * wk.sum()
    return num / den if den > 0 else np.nan


def weighted_quantile(x, w, q):
    x, w = np.asarray(x, float), np.asarray(w, float)
    o = np.argsort(x)
    x, w = x[o], w[o]
    cw = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(q, cw, x)


def deciles(score, w):
    """Decile index (0-9) of a person-level score, by weighted quantiles."""
    edges = weighted_quantile(score, w, np.linspace(0.1, 0.9, 9))
    return np.searchsorted(edges, score, side='right')
