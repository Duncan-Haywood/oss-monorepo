"""Near-optimal stopping for the noisy secretary problem by regression Monte Carlo (numpy).

Same model as secretary_margin.py: q_i ~ N(0,1) iid, x_i = q_i + sigma * e_i, success = the pick has the largest q.
Given x_i, q_i | x_i ~ N(m_i, v) with m_i = x_i / (1 + sigma^2), v = sigma^2 / (1 + sigma^2), independent across i.

After seeing x_1..x_t the decision maker knows, on a grid of q values,
    G_t(q) = prod_{j<t} P(q_j < q | x_j)                     (all earlier candidates below q)
and can compute exactly
    p_t = P(candidate t is the true best | x_1..x_t) = int f_t(q) G_t(q) Phi(q)^(n-t) dq,
the expected reward of stopping now, and
    w_t = P(the true best is still to come | x_1..x_t) = 1 - int Phi(q)^(n-t) dH_t(q),  H_t = G_t * F_t,
a summary of how promising continuing is. The exact Bayes-optimal policy depends on the whole function G_t, which
is infinite-dimensional, so it is approximated by Longstaff-Schwartz: backward in t, regress the realised payoff of
continuing (under the policy already fitted for t+1..n) on polynomial features of (p_t, w_t), and stop at t when
p_t is at least the fitted continuation value. Run on fresh trials this is a feasible policy, so its success rate
estimates a lower bound on the optimum. An upper bound comes from an information relaxation: a clairvoyant who
sees all n noisy scores first picks the largest posterior mean, i.e. argmax x, and no online policy can beat it.
With sigma = 0 everything reduces to the classical problem: p_t = 1[x_t is a record] * Phi(x_t)^(n-t).
"""
import numpy as np
from math import sqrt

SQ2 = sqrt(2.0)


def Phi(z):
    """Standard normal CDF (Abramowitz and Stegun 26.2.17 rational approximation, |error| < 7.5e-8)."""
    z = np.asarray(z, float)
    a = np.abs(z)
    k = 1.0 / (1.0 + 0.2316419 * a)
    poly = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))))
    upper = phi(a) * poly
    return np.where(z >= 0, 1.0 - upper, upper)


def phi(z):
    return np.exp(-0.5 * np.asarray(z, float) ** 2) / sqrt(2 * np.pi)


def trials_array(trials):
    """Convert secretary_margin.make_trials output to (best index array, x matrix)."""
    best = np.array([b for b, _ in trials], int)
    x = np.array([xs for _, xs in trials], float)
    return best, x


def features(x, sigma, grid=None, chunk=4000):
    """Chunked wrapper of _features (keeps the trials-by-grid arrays small)."""
    parts = [_features(x[i:i + chunk], sigma, grid) for i in range(0, x.shape[0], chunk)]
    return np.concatenate([a for a, _ in parts]), np.concatenate([b for _, b in parts])


def _features(x, sigma, grid=None):
    """p[k, t] (stop-now success probability) and w[k, t] (best still to come) for every trial k, step t (0-based)."""
    K, n = x.shape
    p = np.zeros((K, n))
    w = np.zeros((K, n))
    if sigma == 0.0:
        Fx = Phi(x)
        run_max = np.maximum.accumulate(x, axis=1)
        prev_max = np.concatenate([np.full((K, 1), -np.inf), run_max[:, :-1]], axis=1)
        for t in range(n):
            rest = n - 1 - t
            p[:, t] = (x[:, t] > prev_max[:, t]) * Fx[:, t] ** rest
            w[:, t] = 1.0 - Phi(run_max[:, t]) ** rest
        return p, w
    s2 = sigma * sigma
    v = s2 / (1 + s2)
    sv = sqrt(v)
    if grid is None:
        grid = np.linspace(-6.0, 6.0, 481)
    dq = grid[1] - grid[0]
    Pg = Phi(grid)                                   # prior CDF on grid, for future candidates
    m = x / (1 + s2)
    G = np.ones((K, grid.size))
    for t in range(n):
        rest = n - 1 - t
        z = (grid[None, :] - m[:, t:t + 1]) / sv
        f = phi(z) / sv                              # posterior density of q_t on the grid
        F = Phi(z)                                   # posterior CDF of q_t
        fut = Pg ** rest
        p[:, t] = (f * G * fut[None, :]).sum(1) * dq
        H = G * F
        dH = np.diff(H, axis=1)                      # trapezoid rule for the Stieltjes integral
        w[:, t] = 1.0 - H[:, 0] * fut[0] - (dH * (0.5 * (fut[1:] + fut[:-1]))[None, :]).sum(1)
        G = H
    np.clip(p, 0.0, 1.0, out=p)
    np.clip(w, 0.0, 1.0, out=w)
    return p, w


def basis(p, w, kind="default"):
    """Regression features for the continuation value. 'small' and 'rich' exist to check sensitivity."""
    cols = [np.ones_like(p), p, w]
    if kind != "small":
        cols += [p * p, w * w, p * w, w ** 3, np.sqrt(w)]
    if kind == "rich":
        cols += [p * w * w, p * p * w, w ** 4, p ** 3, np.sqrt(p), np.sqrt(p * w)]
    return np.stack(cols, axis=1)


def fit_policy(p, w, best, kind="default"):
    """Longstaff-Schwartz on training features. Returns coefficient list (None at the last step: always stop)."""
    K, n = p.shape
    payoff = (best == n - 1).astype(float)           # forced stop at the last candidate
    coefs = [kind] + [None] * n
    for t in range(n - 2, -1, -1):
        X = basis(p[:, t], w[:, t], kind)
        beta, *_ = np.linalg.lstsq(X, payoff, rcond=None)
        coefs[t + 1] = beta
        cont = X @ beta
        stop = p[:, t] >= cont
        payoff = np.where(stop, (best == t).astype(float), payoff)
    return coefs


def apply_policy(p, w, coefs):
    """0-based stopping index for each trial."""
    K, n = p.shape
    pick = np.full(K, n - 1)
    alive = np.ones(K, bool)
    for t in range(n - 1):
        stop = alive & (p[:, t] >= basis(p[:, t], w[:, t], coefs[0]) @ coefs[t + 1])
        pick[stop] = t
        alive &= ~stop
    return pick


def gm_threshold(k, tol=1e-12):
    """Gilbert-Mosteller (1966) full-information threshold b_k: root in (0,1) of sum_{j=1..k} (b^-j - 1)/j = 1.

    With sigma = 0 the optimal rule stops at a record x_t when Phi(x_t) >= b_{n-t} (k = candidates still to come).
    """
    if k == 0:
        return 0.0
    lo, hi = 1e-9, 1.0
    while hi - lo > tol:
        b = 0.5 * (lo + hi)
        if sum((b ** -j - 1.0) / j for j in range(1, k + 1)) > 1.0:
            lo = b
        else:
            hi = b
    return 0.5 * (lo + hi)


def gm_pick(x):
    """Exact optimal full-information rule (sigma = 0), vectorised."""
    K, n = x.shape
    b = np.array([gm_threshold(n - 1 - t) for t in range(n)])
    prev = np.concatenate([np.full((K, 1), -np.inf), np.maximum.accumulate(x, 1)[:, :-1]], 1)
    ok = (x > prev) & (Phi(x) >= b[None, :])
    ok[:, -1] = True
    return ok.argmax(1)


def oracle_pick(x):
    """Clairvoyant on noisy scores: the largest observed score (largest posterior mean)."""
    return x.argmax(1)


def margin_pick(x, r, d_abs):
    """Vectorised secretary_margin.pick_margin."""
    K, n = x.shape
    if r <= 1:
        return np.zeros(K, int)
    bar = x[:, : r - 1].max(1) + d_abs
    ok = x[:, r - 1:] > bar[:, None]
    first = ok.argmax(1) + r - 1
    return np.where(ok.any(1), first, n - 1)


def rate_se(hits):
    hits = np.asarray(hits, float)
    return hits.mean(), hits.std(ddof=1) / sqrt(hits.size)
