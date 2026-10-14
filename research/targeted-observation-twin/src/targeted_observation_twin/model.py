"""Targeted observation planned in a twin. A Gaussian field x ~ N(0, P_real) on an n-cell 1-D grid (a stand-in for a
severe-weather forecast error field); a UAV takes k scalar observations y = x_j + N(0, r) at sites j chosen from a corridor, then a
Kalman update with the TWIN's covariance P_twin corrects the forecast. The mission value is the verification-region error
sum_{i in V} Var(x_i - xhat_i).

Everything is exact linear algebra. With twin gain K = P_twin[:, j]/(P_twin[j,j] + r) the REAL error covariance after the update is
the Joseph form P_real - K P_real[j,:] - P_real[:,j] K' + (P_real[j,j] + r) K K', and the twin believes it is (I-Kh)P_twin."""
import math, random

__all__ = ["grid", "exp_cov", "update", "vtrace", "greedy", "plan_and_score", "cell_benefit", "harm_radius", "sample_errors",
           "cholesky", "estimate_twin", "ensemble_cov", "taper", "draw", "nearest_sites", "gain_ratio"]


def grid(n):
    return [(i + 0.5) / n for i in range(n)]


def exp_cov(n, ell, amp=None, p=2, nugget=1e-3):
    """Stretched-exponential covariance s_i s_j exp(-(|x_i - x_j|/ell)^p) on the unit-interval grid (p=1 exponential, p=2 Gaussian
    shape), amp = std-dev profile, plus a small diagonal nugget for conditioning."""
    x = grid(n)
    s = amp if amp is not None else [1.0] * n
    return [[s[i] * s[j] * math.exp(-(abs(x[i] - x[j]) / ell) ** p) + (nugget if i == j else 0.0) for j in range(n)] for i in range(n)]


def update(Pt, Pr, j, r):
    """One observation at site j with the twin's gain. Returns (Pt', Pr', K)."""
    n = len(Pt)
    d = Pt[j][j] + r
    K = [Pt[i][j] / d for i in range(n)]
    tj, rj, rjj = Pt[j], Pr[j], Pr[j][j] + r
    Pt2 = [[Pt[i][m] - K[i] * tj[m] for m in range(n)] for i in range(n)]
    Pr2 = [[Pr[i][m] - K[i] * rj[m] - rj[i] * K[m] + rjj * K[i] * K[m] for m in range(n)] for i in range(n)]
    return Pt2, Pr2, K


def vtrace(P, V):
    return sum(P[i][i] for i in V)


def greedy(Pt, V, sites, r, k):
    """Choose k sites one by one, each minimising the verification trace the TWIN predicts (twin-greedy)."""
    Pt_, picks = Pt, []
    for _ in range(k):
        best = None
        for j in sites:
            if j in picks:
                continue
            P2 = update(Pt_, Pt_, j, r)[0]
            v = vtrace(P2, V)
            if best is None or v < best[0] - 1e-15:
                best = (v, j, P2)
        picks.append(best[1])
        Pt_ = best[2]
    return picks


def plan_and_score(Pt, Pr, V, sites, r, k, picks=None):
    """Plan with the twin (unless picks are given), then apply the twin-gain updates. Returns dict with the picks, the verification
    trace the twin CLAIMS after each observation and the REAL trace after each."""
    if picks is None:
        picks = greedy(Pt, V, sites, r, k)
    claimed, real = [vtrace(Pt, V)], [vtrace(Pr, V)]
    A, B = Pt, Pr
    for j in picks:
        A, B, _ = update(A, B, j, r)
        claimed.append(vtrace(A, V))
        real.append(vtrace(B, V))
    return {"picks": picks, "claimed": claimed, "real": real}


def nearest_sites(sites, V, k):
    """Twin-free baseline: the k corridor sites closest to the verification region."""
    lo = min(V)
    return sorted(sites, key=lambda j: abs(j - lo))[:k]


def cell_benefit(Pt, Pr, j, i, r):
    """Exact real variance reduction at cell i from one twin-gain observation at j: 2 K P_r[i,j] - K^2 (P_r[j,j] + r)."""
    K = Pt[i][j] / (Pt[j][j] + r)
    return 2 * K * Pr[i][j] - K * K * (Pr[j][j] + r)


def gain_ratio(Pt, Pr, j, i, r):
    """Twin gain over the real-optimal gain at cell i. The update helps iff this is below 2 (and is best at 1)."""
    return (Pt[i][j] / (Pt[j][j] + r)) / (Pr[i][j] / (Pr[j][j] + r))


def harm_radius(ell_t, ell_r, p=2):
    """Equal variances, stretched-exponential kernels, no nugget: gain ratio = exp(d^p (ell_r^-p - ell_t^-p)); it passes 2 at this
    distance d. Infinite if the twin is no more correlated than reality."""
    if ell_t <= ell_r:
        return math.inf
    return (math.log(2) / (ell_r ** -p - ell_t ** -p)) ** (1.0 / p)


def cholesky(P):
    n = len(P)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = P[i][j] - sum(L[i][m] * L[j][m] for m in range(j))
            L[i][j] = math.sqrt(max(s, 1e-12)) if i == j else s / L[j][j]
    return L


def sample_errors(Pt, Pr, V, picks, r, m, seed, L=None):
    """Monte Carlo of the closed loop: draw x ~ N(0,Pr), observe, apply the twin-gain updates in sequence, return the mean squared
    error on V (per-draw sum over V) and its standard error. Checks the exact Joseph-form trace."""
    n = len(Pr)
    L = L or cholesky(Pr)
    rng = random.Random(seed)
    Pt_, Ks = Pt, []
    for j in picks:
        Pt_, _, K = update(Pt_, Pt_, j, r)
        Ks.append(K)
    vals = []
    for _ in range(m):
        z = [rng.gauss(0, 1) for _ in range(n)]
        x = [sum(L[i][c] * z[c] for c in range(i + 1)) for i in range(n)]
        e = x[:]                                     # error of xhat = 0 prior mean, updated sequentially
        xhat = [0.0] * n
        for j, K in zip(picks, Ks):
            y = x[j] + rng.gauss(0, math.sqrt(r))
            innov = y - xhat[j]
            xhat = [xhat[i] + K[i] * innov for i in range(n)]
        vals.append(sum((x[i] - xhat[i]) ** 2 for i in V))
    mean = sum(vals) / m
    return mean, math.sqrt(sum((v - mean) ** 2 for v in vals) / (m - 1) / m)


def draw(L, rng):
    n = len(L)
    z = [rng.gauss(0, 1) for _ in range(n)]
    return [sum(L[i][c] * z[c] for c in range(i + 1)) for i in range(n)]


def taper(n, c):
    """Gaussian localisation taper exp(-(d/c)^2) on the grid (Schur-multiplied into an ensemble covariance)."""
    x = grid(n)
    return [[math.exp(-(abs(x[i] - x[j]) / c) ** 2) for j in range(n)] for i in range(n)]


def ensemble_cov(L, M, seed, T=None):
    """Sample covariance of M draws from the TRUE model (mean removed, divided by M-1): a twin with the right statistics but a
    finite ensemble. T optionally tapers it (Schur product)."""
    rng = random.Random(seed)
    n = len(L)
    X = [draw(L, rng) for _ in range(M)]
    mu = [sum(x[i] for x in X) / M for i in range(n)]
    X = [[x[i] - mu[i] for i in range(n)] for x in X]
    P = [[sum(x[i] * x[j] for x in X) / (M - 1) for j in range(n)] for i in range(n)]
    if T is not None:
        P = [[P[i][j] * T[i][j] for j in range(n)] for i in range(n)]
    return P


def estimate_twin(samples, p=2):
    """Repair from m real field realisations (reanalysis-style): pooled lag-1 correlation -> ell, pooled variance -> amplitude.
    Returns (ell_hat, sigma2_hat) for a flat-amplitude stretched-exponential twin of shape p."""
    n = len(samples[0])
    dx = 1.0 / n
    s2 = sum(v * v for x in samples for v in x) / (len(samples) * n)
    c1 = sum(x[i] * x[i + 1] for x in samples for i in range(n - 1)) / (len(samples) * (n - 1))
    rho = max(min(c1 / s2, 0.999), 1e-3)
    return dx / (-math.log(rho)) ** (1.0 / p), s2
