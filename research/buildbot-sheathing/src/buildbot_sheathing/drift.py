"""Chance-constrained re-zero scheduling for a random-walk force bias (milestone 73).

Milestone 72 scheduled re-zeros for a bias drift linear in time since the last re-zero. Here the
drift since the last re-zero is

    d(E) = rho E u + sigma W(E),

W a standard n-dimensional Brownian motion (n = 3: the force bias), u a fixed unit vector,
rho in N/s, sigma in N/sqrt(s). A press with allowance a (N, milestone 71) is certified while
||d(E)|| <= a, so its violation probability at elapsed time E is

    p(E) = P(||rho E u + sigma sqrt(E) Z|| > a)
         = ncx2.sf(a^2 / (sigma^2 E), n, (rho E)^2 / (sigma^2 E)).

p is nondecreasing in E (Anderson's theorem: the Gaussian mass of a centred ball falls as the mean
moves away from the centre and as the covariance grows), which `monotone_on_grid` checks. A
per-press chance constraint p(E) <= eps is then a deadline E <= T(a, eps), and milestone 72's
greedy (`rezero.greedy`) stays optimal for it. Pure random walk has the closed form
T = (a / (sigma q))^2, q^2 the chi-square(n) upper eps quantile: the deadline grows as a^2, not a.

`wall_fail` estimates by Monte Carlo the probability that any press of a scheduled wall leaves its
allowance (the drift is reset to zero at each re-zero, so segments are independent).
"""
import numpy as np
from scipy import stats

N_DIM = 3
HOUR = 3600.0


def mean_norm(n=N_DIM):
    """E||Z|| for a standard n-dimensional normal Z."""
    from math import exp, lgamma, sqrt
    return sqrt(2.0) * exp(lgamma((n + 1) / 2) - lgamma(n / 2))


def matched(model, d1, n=N_DIM):
    """(rho N/s, sigma N/sqrt(s)) for a drift model matched to an hour's drift magnitude d1 (N):
    LIN: rho = d1/h; RW: E||sigma W(1 h)|| = d1; MIX: half of each."""
    s1 = d1 / (mean_norm(n) * np.sqrt(HOUR))
    if model == "LIN":
        return d1 / HOUR, 0.0
    if model == "RW":
        return 0.0, s1
    if model == "MIX":
        return 0.5 * d1 / HOUR, 0.5 * s1
    raise ValueError(model)


def p_violate(E, a, rho, sigma, n=N_DIM):
    E = np.asarray(E, float)
    if sigma == 0.0:
        return (rho * E > a).astype(float)
    v = sigma ** 2 * np.maximum(E, 1e-300)
    x = a ** 2 / v
    if rho == 0.0:
        return stats.chi2.sf(x, n)
    return stats.ncx2.sf(x, n, (rho * E) ** 2 / v)


def deadline(a, rho, sigma, eps, n=N_DIM):
    """Largest elapsed time E (s) with p_violate(E) <= eps."""
    if sigma == 0.0:
        return a / rho
    q = np.sqrt(stats.chi2.isf(eps, n))
    T_rw = (a / (sigma * q)) ** 2
    if rho == 0.0:
        return T_rw
    lo, hi = 0.0, min(T_rw, a / rho)            # the drift only shortens the random-walk deadline
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if p_violate(mid, a, rho, sigma, n) <= eps:
            lo = mid
        else:
            hi = mid
    return lo


def monotone_on_grid(a, rho, sigma, Emax, pts=1000, n=N_DIM):
    """Largest decrease of p_violate over a log grid on [1 s, Emax] (0 when nondecreasing)."""
    E = np.geomspace(1.0, Emax, pts)
    p = p_violate(E, a, rho, sigma, n)
    return float(max(0.0, -np.min(np.diff(p))))


def deadlines(allow, rho, sigma, eps, n=N_DIM):
    """Per-press deadlines, computed once per distinct allowance."""
    allow = np.asarray(allow, float)
    cache = {a: deadline(a, rho, sigma, eps, n) for a in np.unique(allow)}
    return np.array([cache[a] for a in allow])


def wall_fail(gaps, taus, allow, starts, rho, sigma, trials, seed, chunk=250, n=N_DIM):
    """Monte Carlo probability that some press leaves its allowance under schedule `starts`
    (re-zero before each listed press; one before press 0 implied)."""
    gaps, taus, allow = (np.asarray(v, float) for v in (gaps, taus, allow))
    m = len(taus)
    seg_start = np.zeros(m, bool)
    seg_start[0] = True
    seg_start[list(starts)] = True
    h = np.where(seg_start, taus, gaps + taus)          # time added to the elapsed clock at press m
    E = np.zeros(m)
    for i in range(m):
        E[i] = h[i] if seg_start[i] else E[i - 1] + h[i]
    seg_id = np.cumsum(seg_start) - 1
    first = np.flatnonzero(seg_start)
    rng = np.random.default_rng(seed)
    fails, done = 0, 0
    lin = rho * E                                        # along u = e_x
    while done < trials:
        k = min(chunk, trials - done)
        inc = rng.standard_normal((k, m, n)) * (sigma * np.sqrt(h))[None, :, None]
        C = np.cumsum(inc, axis=1)
        base = np.zeros_like(C)
        prev = first - 1
        okp = prev >= 0
        bvals = np.zeros((k, len(first), n))
        bvals[:, okp] = C[:, prev[okp]]
        base = bvals[:, seg_id]
        d = C - base
        d[:, :, 0] += lin[None, :]
        out = np.sum(d * d, axis=2) > allow[None, :] ** 2
        fails += int(np.count_nonzero(out.any(axis=1)))
        done += k
    return fails / trials
