"""Radar ego-velocity from n Doppler returns off stationary targets: y_i = v + e_i (1-D radial model).
Twin: every target is static, e_i ~ N(0, s0^2).  'Real': with probability eps a return comes from a moving target and
e_i ~ N(0, s0^2 + tau^2) (zero-mean radial-velocity offset, so both estimators stay unbiased by symmetry).
Estimators: sample mean (least squares) and sample median."""
import math, random

__all__ = ["var_mean", "var_median_asym", "var_median_exact", "cov_claim_ratio", "coverage_mean", "median_wins_band",
           "crossover_eps", "excess_kurtosis", "sample", "mc_var", "ls2d_cov_ratio_mc"]


def _phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def _Phi(z):
    return 0.5 * math.erfc(-z / math.sqrt(2))


def var_mean(n, eps, tau, s0=1.0):
    """Exact Var of the sample mean: (s0^2 + eps tau^2)/n."""
    return (s0 * s0 + eps * tau * tau) / n


def _f0(eps, tau, s0):
    s = math.hypot(s0, tau)
    return ((1 - eps) / s0 + eps / s) / math.sqrt(2 * math.pi)


def var_median_asym(n, eps, tau, s0=1.0):
    """Asymptotic Var of the sample median: 1/(4 n f(0)^2)."""
    return 1.0 / (4 * n * _f0(eps, tau, s0) ** 2)


def var_median_exact(n, eps, tau, s0=1.0, steps=40000):
    """Exact Var of the median of an odd number n=2m+1 of iid mixture draws, by Simpson integration of x^2 g(x) with
    g(x) = n!/(m!)^2 F^m (1-F)^m f (density of the median order statistic; symmetric, mean 0)."""
    assert n % 2 == 1
    m = (n - 1) // 2
    s = math.hypot(s0, tau)
    L = 14.0 * s
    lc = math.lgamma(n + 1) - 2 * math.lgamma(m + 1)

    def g(x):
        F = (1 - eps) * _Phi(x / s0) + eps * _Phi(x / s)
        f = (1 - eps) * _phi(x / s0) / s0 + eps * _phi(x / s) / s
        if f <= 0 or F <= 0 or F >= 1:
            return 0.0
        return x * x * math.exp(lc + m * (math.log(F) + math.log1p(-F)) + math.log(f))

    h = 2 * L / steps
    tot = g(-L) + g(L)
    for i in range(1, steps):
        tot += g(-L + i * h) * (4 if i % 2 else 2)
    return tot * h / 3


def cov_claim_ratio(eps, tau, s0=1.0):
    """Real variance of the LS estimate over the twin's claimed variance s0^2/n: 1 + eps tau^2 / s0^2."""
    return 1 + eps * tau * tau / (s0 * s0)


def coverage_mean(n, eps, tau, s0=1.0, z=1.959963984540054):
    """Exact coverage of the twin-certified interval mean +- z s0/sqrt(n): a binomial mixture over the number K of
    moving targets, since given K the mean is exactly Gaussian with variance (n s0^2 + K tau^2)/n^2."""
    tot = 0.0
    for K in range(n + 1):
        w = math.exp(math.lgamma(n + 1) - math.lgamma(K + 1) - math.lgamma(n - K + 1) + K * math.log(eps) + (n - K) * math.log1p(-eps)) if 0 < eps < 1 else float(K == (n if eps >= 1 else 0))
        if w < 1e-300:
            continue
        tot += w * (2 * _Phi(z * s0 * math.sqrt(n) / math.sqrt(n * s0 * s0 + K * tau * tau)) - 1)
    return tot


def median_wins_band(tau, s0=1.0, grid=20000):
    """Asymptotic (n->inf) set of contamination rates eps in (0,1) where the median has lower variance than the mean:
    returns (eps_lo, eps_hi) or None.  The set is an interval because at eps=0 the mean wins (2/pi), at eps=1 it wins
    again, and (mean var)*(median precision) is unimodal in between for the values checked in the tests."""
    inside = [e for e in (i / grid for i in range(1, grid)) if var_median_asym(1, e, tau, s0) < var_mean(1, e, tau, s0)]
    return (inside[0], inside[-1]) if inside else None


def crossover_eps(tau, s0=1.0):
    """Smallest eps where the median overtakes the mean (asymptotically), by bisection; None if it never does."""
    band = median_wins_band(tau, s0, grid=2000)
    if band is None:
        return None
    lo, hi = max(band[0] - 1 / 2000, 0.0), band[0]
    d = lambda e: var_median_asym(1, e, tau, s0) - var_mean(1, e, tau, s0)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if d(mid) > 0 else (lo, mid)
    return 0.5 * (lo + hi)


def excess_kurtosis(eps, tau, s0=1.0):
    """Excess kurtosis of one residual: 3 eps (1-eps) tau^4 / (s0^2 + eps tau^2)^2."""
    return 3 * eps * (1 - eps) * tau ** 4 / (s0 * s0 + eps * tau * tau) ** 2


def sample(n, eps, tau, rng, s0=1.0):
    return [rng.gauss(0, s0 * math.sqrt(1 + (tau / s0) ** 2) if rng.random() < eps else s0) for _ in range(n)]


def mc_var(n, eps, tau, reps, rng, s0=1.0):
    """Monte Carlo (mean-estimator variance, median-estimator variance, their standard errors)."""
    a, b = [], []
    for _ in range(reps):
        x = sorted(sample(n, eps, tau, rng, s0))
        a.append(sum(x) / n)
        b.append(x[n // 2] if n % 2 else 0.5 * (x[n // 2 - 1] + x[n // 2]))
    va = sum(t * t for t in a) / reps
    vb = sum(t * t for t in b) / reps
    return va, vb, va * math.sqrt(2 / reps), vb * math.sqrt(2 / reps)


def ls2d_cov_ratio_mc(n, eps, tau, reps, rng, s0=1.0):
    """2-D ego-velocity (vx, vy) from n returns at azimuths spread over a forward 120-degree sector; LS covariance
    trace over its twin-claimed value s0^2 tr((H'H)^-1).  The geometry cancels in the ratio, which is 1+eps tau^2/s0^2."""
    th = [math.radians(-60 + 120 * (i + 0.5) / n) for i in range(n)]
    c = [math.cos(t) for t in th]
    s = [math.sin(t) for t in th]
    a, b, d = sum(x * x for x in c), sum(x * y for x, y in zip(c, s)), sum(y * y for y in s)
    det = a * d - b * b
    inv = ((d / det, -b / det), (-b / det, a / det))
    acc = 0.0
    for _ in range(reps):
        e = sample(n, eps, tau, rng, s0)
        r0, r1 = sum(x * y for x, y in zip(c, e)), sum(x * y for x, y in zip(s, e))
        ex, ey = inv[0][0] * r0 + inv[0][1] * r1, inv[1][0] * r0 + inv[1][1] * r1
        acc += ex * ex + ey * ey
    return acc / reps / (s0 * s0 * (inv[0][0] + inv[1][1]))
