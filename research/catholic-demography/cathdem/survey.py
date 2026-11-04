"""Design-based estimates for complex survey data, numpy only.

Domain means, domain contrasts (A minus B) and their standard errors by Taylor
linearisation with stratified cluster sampling (with replacement at the first stage),
the estimator Stata's `svy: mean, over()` and R's `survey::svyby` use. Strata with a
single PSU are pooled into one stratum ("adjust" in Stata terms is not used; pooling is
the conservative "certainty-collapse" choice and is reported by `design_summary`).
"""
from math import sqrt
import numpy as np

Z95 = 1.959963984540054


def _influence(y, w, dom):
    """Linearised influence values of the weighted domain mean of y over rows where dom."""
    m = dom & ~np.isnan(y) & (w > 0)
    W = w[m].sum()
    if W <= 0:
        return np.nan, np.zeros_like(w), 0
    mean = float((w[m] * y[m]).sum() / W)
    z = np.zeros_like(w, dtype=float)
    z[m] = w[m] * (y[m] - mean) / W
    return mean, z, int(m.sum())


def _variance(z, strata, psu):
    """Between-PSU-within-stratum variance of the total of z."""
    key_s = strata
    # PSU totals
    pairs = np.stack([strata, psu], axis=1)
    uniq, inv = np.unique(pairs, axis=0, return_inverse=True)
    inv = inv.ravel()
    tot = np.bincount(inv, weights=z, minlength=len(uniq))
    s_of_psu = uniq[:, 0]
    ss, s_inv, counts = np.unique(s_of_psu, return_inverse=True, return_counts=True)
    # pool singleton strata into one
    single = counts[s_inv] == 1
    s_lab = np.where(single, -1, s_inv)
    ss2, s_inv2, n_h = np.unique(s_lab, return_inverse=True, return_counts=True)
    mean_h = np.bincount(s_inv2, weights=tot) / n_h
    dev = tot - mean_h[s_inv2]
    fac = np.where(n_h > 1, n_h / np.maximum(n_h - 1, 1), 0.0)
    return float((fac[s_inv2] * dev ** 2).sum())


def domain_mean(y, w, dom, strata, psu):
    """(mean, se, n) of y over the domain, design-based."""
    mean, z, n = _influence(y, w, dom)
    if n < 2:
        return mean, np.nan, n
    return mean, sqrt(_variance(z, strata, psu)), n


def contrast(y, w, dom_a, dom_b, strata, psu):
    """(mean_a - mean_b, se, n_a, n_b): the covariance between domains is kept."""
    ma, za, na = _influence(y, w, dom_a)
    mb, zb, nb = _influence(y, w, dom_b)
    if na < 2 or nb < 2:
        return np.nan, np.nan, na, nb
    return ma - mb, sqrt(_variance(za - zb, strata, psu)), na, nb


def ci(est, se):
    return est - Z95 * se, est + Z95 * se


def _variance_matrix(Z, strata, psu):
    """Between-PSU-within-stratum covariance of the column totals of Z (n x k); singletons pooled."""
    pairs = np.stack([strata, psu], axis=1)
    uniq, inv = np.unique(pairs, axis=0, return_inverse=True)
    inv = inv.ravel()
    tot = np.stack([np.bincount(inv, weights=Z[:, j], minlength=len(uniq)) for j in range(Z.shape[1])], axis=1)
    _, s_inv, counts = np.unique(uniq[:, 0], return_inverse=True, return_counts=True)
    s_lab = np.where(counts[s_inv] == 1, -1, s_inv)
    _, s_inv2, n_h = np.unique(s_lab, return_inverse=True, return_counts=True)
    mean_h = np.stack([np.bincount(s_inv2, weights=tot[:, j]) for j in range(tot.shape[1])], axis=1) / n_h[:, None]
    dev = tot - mean_h[s_inv2]
    fac = np.where(n_h > 1, n_h / np.maximum(n_h - 1, 1), 0.0)[s_inv2]
    return (dev * fac[:, None]).T @ dev


def logit(X, y, w, dom, strata, psu, iters=50, tol=1e-10):
    """Survey-weighted logistic regression on the domain `dom`, linearised (sandwich) variance.

    Rows outside the domain or with missing y or X keep their place in the design with zero
    score (the correct subpopulation variance). Returns (beta, cov, n). X includes the constant.
    """
    X = np.asarray(X, float)
    y = np.asarray(y, float)
    ok = dom & ~np.isnan(y) & ~np.isnan(X).any(axis=1) & (w > 0)
    ww = np.where(ok, w, 0.0)
    Xo = np.where(ok[:, None], X, 0.0)
    yo = np.where(ok, y, 0.0)
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Xo @ b))
        g = Xo.T @ (ww * (yo - p))
        H = (Xo * (ww * p * (1 - p))[:, None]).T @ Xo
        step = np.linalg.solve(H, g)
        b = b + step
        if np.abs(step).max() < tol:
            break
    p = 1 / (1 + np.exp(-Xo @ b))
    H = (Xo * (ww * p * (1 - p))[:, None]).T @ Xo
    Hi = np.linalg.inv(H)
    V = _variance_matrix(Xo * (ww * (yo - p))[:, None], strata, psu)
    return b, Hi @ V @ Hi, int(ok.sum())


def wald(b, cov, idx):
    """Wald chi-square statistic, df and p-value that the coefficients at idx are all zero."""
    from scipy.stats import chi2
    idx = list(idx)
    bb = b[idx]
    stat = float(bb @ np.linalg.solve(cov[np.ix_(idx, idx)], bb))
    return stat, len(idx), float(chi2.sf(stat, len(idx)))
