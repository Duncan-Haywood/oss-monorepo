"""Small, dependency-free helpers shared by the SIPP training scripts (numpy/pandas only)."""
import numpy as np, pandas as pd


def wquantiles(x, w, ps):
    """Weighted quantiles (inverse of the weighted empirical CDF, midpoint convention)."""
    o = np.argsort(x, kind='stable')
    x, w = np.asarray(x)[o], np.asarray(w, float)[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(ps, c, x)


def poisson_unit_dev(y, e, w, rate):
    mu = e * rate
    t = np.zeros(len(y))
    ok = y > 0
    t[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * w * (t - y + mu)


def bernoulli_unit_dev(y, w, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return -2 * w * (y * np.log(p) + (1 - y) * np.log1p(-p))


def cluster_counts(cluster_codes, n_clusters, reps, seed):
    """Household bootstrap multiplicities: (reps, n_clusters) counts of each household drawn."""
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, n_clusters, size=(reps, n_clusters))
    return np.stack([np.bincount(d, minlength=n_clusters) for d in draws]).astype(np.float32)


def weighted_auc(score, y, w):
    """Weighted ROC AUC with ties counted as one half."""
    s = np.asarray(score)
    u, inv = np.unique(s, return_inverse=True)
    pos = np.bincount(inv, weights=w * y, minlength=len(u))
    neg = np.bincount(inv, weights=w * (1 - y), minlength=len(u))
    below = np.cumsum(neg) - neg
    return float((pos * (below + 0.5 * neg)).sum() / (pos.sum() * neg.sum()))


def auc_by_cluster_weights(score, y, w, codes, counts):
    """AUC for each bootstrap replicate: person weight times household multiplicity."""
    u, inv = np.unique(np.asarray(score), return_inverse=True)
    out = []
    for c in counts:
        ww = w * c[codes]
        pos = np.bincount(inv, weights=ww * y, minlength=len(u))
        neg = np.bincount(inv, weights=ww * (1 - y), minlength=len(u))
        below = np.cumsum(neg) - neg
        out.append((pos * (below + 0.5 * neg)).sum() / (pos.sum() * neg.sum()))
    return np.array(out)


def harrell_c(t, event, risk, w=None):
    """Weighted Harrell's C: among pairs where i has an event at t_i < t_j, the share with
    risk_i > risk_j (ties in risk count one half). Pair weight w_i * w_j."""
    t, event, risk = np.asarray(t, float), np.asarray(event, int), np.asarray(risk, float)
    w = np.ones(len(t)) if w is None else np.asarray(w, float)
    order = np.argsort(risk, kind='stable')
    rs = risk[order]
    num = den = 0.0
    for u in np.unique(t[event == 1]):
        later = t > u
        cw = np.concatenate([[0.0], np.cumsum((w * later)[order])])
        ev = (t == u) & (event == 1)
        lo = cw[np.searchsorted(rs, risk[ev], side='left')]
        hi = cw[np.searchsorted(rs, risk[ev], side='right')]
        num += (w[ev] * (lo + 0.5 * (hi - lo))).sum()
        den += w[ev].sum() * cw[-1]
    return num / den


def weighted_km(t, event, w, at):
    """Weighted Kaplan-Meier survival evaluated at times `at`."""
    o = np.argsort(t, kind='stable')
    t, event, w = np.asarray(t)[o], np.asarray(event)[o], np.asarray(w, float)[o]
    s, risk, out, j = 1.0, w.sum(), {}, 0
    at = sorted(at)
    for u in np.unique(t):
        while j < len(at) and at[j] < u:
            out[at[j]] = s
            j += 1
        sel = t == u
        d = (w * event)[sel].sum()
        if risk > 0:
            s *= 1 - d / risk
        risk -= w[sel].sum()
    while j < len(at):
        out[at[j]] = s if at[j] <= t.max() else np.nan
        j += 1
    return out


def standard_reference(horizons, overall, subgroups, **meta):
    """Population reference in the shape app/population.js reads:
    {horizons, overall: {n, quantiles: {p1..p99: [one value per horizon]}},
     subgroups: {var: {level: {n, quantiles}}}}. `overall` is (n, values) and each subgroup
    entry is (var, level, n, values), where values[h] is the list of 99 percentiles for horizon h."""
    def q(values):
        return {f'p{i + 1}': [round(float(values[h][i]), 6) for h in range(len(horizons))] for i in range(99)}
    out = dict(meta, horizons=list(horizons), overall=dict(n=int(overall[0]), quantiles=q(overall[1])), subgroups={})
    for var, level, n, values in subgroups:
        out['subgroups'].setdefault(var, {})[str(level)] = dict(n=int(n), quantiles=q(values))
    return out
