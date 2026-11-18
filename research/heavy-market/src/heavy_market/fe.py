"""Two-way fixed-effects depreciation estimator, numpy only.

log(price_i) = alpha_model(i) + gamma_saleyear(i) + beta * age_i + e_i

The model effect absorbs make, model and spec; the sale-year effect absorbs inflation and the
market cycle, so beta is the within-model, within-year log price change per year of age.
Annual depreciation is 1 - exp(beta). Fixed effects are swept out by alternating projections
(Gaure 2013; Correia 2016), and the standard error is clustered by model.
"""
import numpy as np


def _demean(v, groups, n_groups):
    sums = np.bincount(groups, weights=v, minlength=n_groups)
    counts = np.bincount(groups, minlength=n_groups)
    return v - (sums / np.maximum(counts, 1))[groups]


def sweep(v, fe_list, tol=1e-10, max_iter=1000):
    """Residual of v after projecting out every fixed effect in fe_list (alternating projections)."""
    v = np.asarray(v, dtype=float).copy()
    coded = [np.unique(g, return_inverse=True) for g in fe_list]
    coded = [(inv, len(u)) for u, inv in coded]
    for _ in range(max_iter):
        before = v.copy()
        for inv, k in coded:
            v = _demean(v, inv, k)
        if np.max(np.abs(v - before)) < tol:
            break
    return v


def drop_singletons(model):
    """Mask keeping rows whose model appears at least twice (singletons carry no within information)."""
    _, inv, counts = np.unique(model, return_inverse=True, return_counts=True)
    return counts[inv] > 1


def depreciation(log_price, age, model, sale_year):
    """beta, clustered SE, n rows, n models for one machine class.

    Returns a dict with beta (log points per year), se, annual rate 1 - exp(beta) and its 95% interval.
    """
    keep = drop_singletons(model)
    y, x, m, s = log_price[keep], age[keep].astype(float), model[keep], sale_year[keep]
    yt = sweep(y, [m, s])
    xt = sweep(x, [m, s])
    sxx = float(xt @ xt)
    beta = float(xt @ yt) / sxx
    e = yt - beta * xt
    _, inv = np.unique(m, return_inverse=True)
    score = np.bincount(inv, weights=xt * e)
    g = len(score)
    se = float(np.sqrt(np.sum(score ** 2) * g / max(g - 1, 1)) / sxx)
    lo, hi = beta - 1.96 * se, beta + 1.96 * se
    return {
        "beta": beta, "se": se, "n": int(keep.sum()), "models": int(g),
        "rate": 1 - np.exp(beta), "rate_lo": 1 - np.exp(hi), "rate_hi": 1 - np.exp(lo),
    }
