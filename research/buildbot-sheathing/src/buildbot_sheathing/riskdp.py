"""Optimal risk-constrained re-zero schedules for a random-walk force bias (milestone 75).

Milestone 73 gave every press one per-press risk eps (CAL) and let `rezero.greedy` place re-zeros at
the resulting deadlines. Here the wall's risk budget alpha is spent where it buys the most.

Exact segment risk. Under a pure random walk (rho = 0) the bias since the last re-zero is
sigma W(E), W a standard 3-D Brownian motion. Its norm R = sigma ||W|| is a Markov process (a 3-D
Bessel process), so the probability that a segment of presses i..j stays inside every press's
allowance is a 1-D Markov chain on R: propagate the density of R from press to press with the
exact transition law (R_next^2 / (sigma^2 h) is noncentral chi-square, 3 degrees of freedom,
noncentrality R^2 / (sigma^2 h)), and at each press remove the mass beyond its allowance. The grid
has an edge at every allowance, so the removal is exact; the only approximation is placing the mass
of a cell at its midpoint, which `segment_logsurv`'s `dr_frac` controls (a refinement check is in
the experiment).

Optimal schedule. Re-zeros reset the walk, so segments are independent and the wall's survival is
the product of its segments' survivals. With LS[i][l] the log survival of the segment that starts at
press i and covers l + 1 presses, the fewest re-zeros with wall failure <= alpha is a layered
dynamic programme: F_k[j] = max_i F_{k-1}[i] + LS[i][j - i - 1], the smallest k with
F_k[n] >= log(1 - alpha), minus the implied first re-zero (`optimal`). It is exact for open-loop
schedules under this model; `brute_force` checks it on small walls.
"""
from itertools import combinations

import numpy as np
from scipy import stats
from scipy.special import ndtr

N_DIM = 3


def grid(allow, dr):
    """Cell edges on [0, max(allow)] with spacing <= dr and an edge at every distinct allowance."""
    pts = [0.0] + sorted(set(float(a) for a in allow))
    edges = [0.0]
    for lo, hi in zip(pts[:-1], pts[1:]):
        k = max(1, int(np.ceil((hi - lo) / dr)))
        edges += list(np.linspace(lo, hi, k + 1)[1:])
    return np.array(edges)


def first_step(edges, sigma, h, n=N_DIM):
    """Cell masses of R after h seconds from R = 0."""
    return np.diff(stats.chi2.cdf(edges ** 2 / (sigma ** 2 * h), n))


def radial_cdf(s, r, sd):
    """P(||x0 + sd Z|| <= s) for ||x0|| = r > 0 and Z standard 3-D normal (closed form of the
    noncentral chi law with 3 degrees of freedom)."""
    a, b = (s - r) / sd, (s + r) / sd
    return ndtr(a) + ndtr(b) - 1.0 + (sd / r) * (_phi(b) - _phi(a))


def _phi(x):
    return np.exp(-0.5 * x * x) / np.sqrt(2 * np.pi)


def kernel(edges, sigma, h, n=N_DIM):
    """K[i, j]: probability that R moves from cell i's midpoint into cell j in h seconds
    (row sums below 1: the rest left the grid, beyond every allowance)."""
    assert n == 3, "closed form is for 3-D"
    mid = 0.5 * (edges[1:] + edges[:-1])
    cdf = radial_cdf(edges[None, :], mid[:, None], sigma * np.sqrt(h))
    return np.clip(np.diff(cdf, axis=1), 0.0, None)


def segment_logsurv(gaps, taus, allow, period, sigma, alpha, dr_frac=1 / 3, n=N_DIM):
    """LS[p] for each start phase p < period: log survival of the segment starting at press p after
    l + 1 presses, l = 0, 1, ...; each list stops once the survival drops below 1 - alpha (no such
    segment can be part of a feasible schedule) or the wall ends. The wall must be periodic in
    `period` from press 1 on (gaps[0] is never used: elapsed at a segment's first press is its tau).
    All phases are propagated together, one column each."""
    gaps, taus, allow = (np.asarray(v, float) for v in (gaps, taus, allow))
    m = len(taus)
    P = min(period, m)
    dr = dr_frac * sigma * np.sqrt(taus.min())
    edges = grid(allow, dr)
    upper = edges[1:]
    kcache = {}

    def K(h):
        key = round(float(h), 9)
        if key not in kcache:
            kcache[key] = kernel(edges, sigma, h, n)
        return kcache[key]

    floor = np.log1p(-alpha)
    X = np.stack([first_step(edges, sigma, taus[p], n) for p in range(P)], axis=1)
    X[upper[:, None] > allow[None, :P] + 1e-15] = 0.0
    ls = [[np.log(max(X[:, p].sum(), 1e-300))] for p in range(P)]
    alive = np.array([ls[p][0] >= floor for p in range(P)])
    step = 1
    while alive.any():
        cols = np.flatnonzero(alive & (np.arange(P) + step < m))
        if cols.size == 0:
            break
        j = cols + step
        h = gaps[j] + taus[j]
        Y = np.zeros((X.shape[0], cols.size))
        for hv in np.unique(np.round(h, 9)):
            sel = np.abs(h - hv) < 1e-9
            Y[:, sel] = K(hv).T @ X[:, cols[sel]]
        Y[upper[:, None] > allow[None, j] + 1e-15] = 0.0
        X[:, cols] = Y
        tot = np.log(np.maximum(Y.sum(axis=0), 1e-300))
        for c, v in zip(cols, tot):
            ls[c].append(v)
        alive[:] = False
        alive[cols[tot >= floor]] = True
        step += 1
    return [np.array(v) for v in ls]


def wall_logsurv(LS, period, m, starts):
    """Log survival of the wall under re-zeros before `starts` (one before press 0 implied);
    -inf if some segment is longer than its table (its survival is below 1 - alpha)."""
    cut = [0] + sorted(starts) + [m]
    tot = 0.0
    for a, b in zip(cut[:-1], cut[1:]):
        t = LS[a % period]
        if b - a > len(t):
            return -np.inf
        tot += t[b - a - 1]
    return tot


def optimal(LS, period, m, alpha, kmax=2000):
    """Fewest re-zeros (and their positions) with wall failure <= alpha; None if none within kmax."""
    floor = np.log1p(-alpha)
    L = max(len(t) for t in LS)
    ph = np.arange(m) % period
    tab = np.full((period, L), -np.inf)
    for p, t in enumerate(LS):
        tab[p, :len(t)] = t
    F = np.full(m + 1, -np.inf)
    F[0] = 0.0
    back = []
    for k in range(1, kmax + 1):
        G = np.full(m + 1, -np.inf)
        arg = np.full(m + 1, -1)
        ok = np.flatnonzero(np.isfinite(F[:m]))
        if ok.size == 0:
            return None
        for l in range(L):
            i = ok[ok + l + 1 <= m]
            if i.size == 0:
                break
            c = F[i] + tab[ph[i], l]
            j = i + l + 1
            better = c > G[j]
            G[j[better]] = c[better]
            arg[j[better]] = i[better]
        back.append(arg)
        F = G
        if F[m] >= floor:
            starts, j = [], m
            for a in reversed(back):
                j = a[j]
                starts.append(j)
            starts = sorted(s for s in starts if s > 0)
            return k - 1, starts, float(F[m])
    return None


def brute_force(LS, period, m, alpha):
    """Fewest re-zeros by enumeration (small m only)."""
    floor = np.log1p(-alpha)
    for k in range(m):
        for c in combinations(range(1, m), k):
            if wall_logsurv(LS, period, m, c) >= floor:
                return k
    return None
