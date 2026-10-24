"""Held-out metrics for marriage-year Poisson models with delayed entry (numpy only).

Person-level arrays: entry time `a` and exit time `t` in years since the wedding, event `d`
(dissolution at t), survey weight `w`. Interval-level arrays: event `y`, exposure `e`, weight `w`.
Every function accepts weights, so a person bootstrap is a reweighting by resample counts.
"""
import numpy as np


def deviance(y, e, w, rate):
    """Weighted Poisson deviance per weighted person-year."""
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, term - y + mu) / np.dot(w, e)


def unit_deviance(y, e, w, rate):
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * w * (term - y + mu)


def weighted_quantile(x, w, qs):
    """Quantiles of the weighted empirical distribution (midpoint interpolation)."""
    x, w = np.asarray(x, float), np.asarray(w, float)
    o = np.argsort(x, kind='stable')
    x, w = x[o], w[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(qs, c, x)


def concordance_matrices(a, t, d):
    """comparable[i, j] = 1 when i dissolved at t_i < t_j and j was under observation at t_i
    (a_j <= t_i): the usual Harrell pairs, restricted to the risk set under delayed entry."""
    ti = t[:, None]
    comp = (d[:, None] == 1) & (ti < t[None, :]) & (a[None, :] <= ti)
    return comp


def harrell_c(comp, score, w):
    """Weighted Harrell's C over the comparable pairs (pair weight w_i w_j); ties count 1/2."""
    s = score
    conc = (s[:, None] > s[None, :]).astype(np.float32) + 0.5 * (s[:, None] == s[None, :]).astype(np.float32)
    K = (comp * conc).astype(np.float32)
    C = comp.astype(np.float32)
    ww = w.astype(np.float32)
    return float(ww @ K @ ww / (ww @ C @ ww)), K, C


def harrell_c_boot(K, C, W):
    """C for many weight vectors at once (columns of W)."""
    W = W.astype(np.float32)
    num = np.einsum('ib,ib->b', W, K @ W)
    den = np.einsum('ib,ib->b', W, C @ W)
    return num / den


def km_censoring(a, t, d, w):
    """Weighted Kaplan-Meier of the censoring time with delayed entry. Returns G(u-), the
    probability of remaining uncensored just before u."""
    times = np.unique(t[d == 0])
    G = np.ones(len(times))
    s = 1.0
    for k, u in enumerate(times):
        at_risk = w[(a < u) & (t >= u)].sum()
        cens = w[(t == u) & (d == 0)].sum()
        G[k] = s
        if at_risk > 0:
            s *= 1 - cens / at_risk
    def g_minus(u):
        idx = np.searchsorted(times, u, side='left') - 1
        out = np.ones(np.shape(u))
        ok = idx >= 0
        # survival after the last censoring time strictly below u
        after = np.r_[G[1:], s]
        out[ok] = after[idx[ok]]
        return out
    return g_minus


def auc_at(a, t, d, score, w, h, gfun=None):
    """Cumulative/dynamic AUC at horizon h: cases dissolved by h, controls still married after h.
    Only marriages observed from before h count (a < h). With gfun, cases are weighted by
    1/G(t_i-) and controls by 1/G(h) (inverse probability of censoring)."""
    use = a < h
    case = use & (d == 1) & (t <= h)
    ctrl = use & (t > h)
    wc = w * case
    wk = w * ctrl
    if gfun is not None:
        wc = np.where(case, wc / np.maximum(gfun(t), 1e-6), 0)
        wk = np.where(ctrl, wk / max(float(gfun(np.array([h]))[0]), 1e-6), 0)
    return auc_weighted(score, wc, wk)


def auc_weighted(score, wcase, wctrl):
    """P(score_case > score_control) + 1/2 P(tie) with weights; O(n log n)."""
    o = np.argsort(score, kind='stable')
    s, a_, b_ = score[o], wcase[o], wctrl[o]
    uniq, start = np.unique(s, return_index=True)
    ca = np.add.reduceat(a_, start)
    cb = np.add.reduceat(b_, start)
    below = np.cumsum(cb) - cb
    num = np.sum(ca * (below + 0.5 * cb))
    den = ca.sum() * cb.sum()
    return num / den if den > 0 else np.nan


def km_dissolution(a, t, d, w, h):
    """Weighted Kaplan-Meier probability of dissolution by h (delayed entry)."""
    ev = np.unique(t[(d == 1) & (t <= h)])
    s = 1.0
    for u in ev:
        at_risk = w[(a < u) & (t >= u)].sum()
        dd = w[(t == u) & (d == 1)].sum()
        if at_risk > 0:
            s *= 1 - dd / at_risk
    return 1 - s
