"""Stereo depth from noisy disparity, stylised.

Rectified pair, focal length f (px), baseline B (m), k = f B. A point at depth Z has true disparity d0 = k / Z. The real
matcher returns d = d0 + sigma * eps (eps ~ N(0,1), sigma in px) and reports depth k / d, but only when d >= dmin (the
matcher's disparity search floor; smaller values are returned as "no match"). The common twin instead adds Gaussian noise to
depth, with the linearised standard deviation sigma_Z = Z^2 sigma / k (relative noise s = sigma Z / k).
"""
import math
import random


class Sensor:
    def __init__(self, f=700.0, B=0.12, sigma=0.25, dmin=1.0):
        self.f, self.B, self.k, self.sigma, self.dmin = f, B, f * B, sigma, dmin

    def d0(self, Z):
        return self.k / Z

    def s(self, Z):
        """Relative disparity noise sigma/d0 = linearised relative depth noise."""
        return self.sigma * Z / self.k

    def zmax(self):
        return self.k / self.dmin


def phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def Phi(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))


def p_valid(S, Z):
    """P(d >= dmin): fraction of looks that return a depth."""
    return 1 - Phi((S.dmin - S.d0(Z)) / S.sigma)


def twin_p_beyond_range(S, Z):
    """Gaussian-depth twin: P(depth > zmax), the twin's counterpart of a lost match."""
    return Phi(-(S.zmax() - Z) / (S.s(Z) * Z))


def over_prob(S, a, Z):
    """Exact P(depth returned and > Z(1+a)) = P(dmin <= d < d0/(1+a))."""
    hi = S.d0(Z) / (1 + a)
    if hi <= S.dmin:
        return 0.0
    return Phi((hi - S.d0(Z)) / S.sigma) - Phi((S.dmin - S.d0(Z)) / S.sigma)


def under_prob(S, a, Z):
    """Exact P(depth < Z(1-a)) = P(d > d0/(1-a)), 0 < a < 1."""
    return 1 - Phi((S.d0(Z) / (1 - a) - S.d0(Z)) / S.sigma)


def twin_over_prob(S, a, Z):
    return Phi(-a / S.s(Z))


def twin_under_prob(S, a, Z):
    return Phi(-a / S.s(Z))


def quantile(S, p, Z):
    """Exact p-quantile of the returned depth among valid looks (unconditional CDF renormalised by p_valid)."""
    pv = p_valid(S, Z)
    # P(valid, depth <= z) = 1 - Phi((k/z - d0)/sigma); want = p * pv
    target = 1 - p * pv
    lo, hi = -10.0, 10.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < target:
            lo = mid
        else:
            hi = mid
    d = S.d0(Z) + 0.5 * (lo + hi) * S.sigma
    return S.k / d


def _simpson(g, a, b, n=20000):
    h = (b - a) / n
    t = g(a) + g(b)
    for i in range(1, n):
        t += g(a + i * h) * (4 if i % 2 else 2)
    return t * h / 3


def depth_moment(S, Z, n):
    """E[depth^n | valid], exact by quadrature over disparity on [dmin, d0 + 12 sigma] (finite because of the floor)."""
    d0, sg = S.d0(Z), S.sigma
    hi = max(d0 + 12 * sg, S.dmin + 12 * sg)
    f = lambda d: (S.k / d) ** n * phi((d - d0) / sg) / sg
    return _simpson(f, S.dmin, hi) / p_valid(S, Z)


def gated_mean(S, Z):
    return depth_moment(S, Z, 1)


def gated_var(S, Z):
    m = depth_moment(S, Z, 1)
    return depth_moment(S, Z, 2) - m * m


def mean_bias_rel(S, Z):
    """Relative bias of the gated mean depth: E[depth | valid]/Z - 1 (about s^2 for small s)."""
    return gated_mean(S, Z) / Z - 1


def harmonic_bias_rel_leading(S, Z, N=1):
    """Delta-method relative bias of k / mean(d) over N looks: s^2 / N."""
    return S.s(Z) ** 2 / N


def twin_rms_mean(S, Z, N):
    """Gaussian-depth twin's predicted relative RMS error of the mean of N looks: s / sqrt(N)."""
    return S.s(Z) / math.sqrt(N)


def real_rms_mean(S, Z, N):
    """Exact relative RMS error of the mean depth of N valid looks (looks i.i.d., gate conditioning included)."""
    b = mean_bias_rel(S, Z)
    v = gated_var(S, Z) / (Z * Z)
    return math.sqrt(b * b + v / N)


def sample_disparities(S, Z, n, rng):
    d0 = S.d0(Z)
    return [d0 + S.sigma * rng.gauss(0, 1) for _ in range(n)]


def valid_depths(S, Z, n, rng):
    return [S.k / d for d in sample_disparities(S, Z, n, rng) if d >= S.dmin]


def estimators(S, Z, N, rng):
    """Mean depth, harmonic (k / mean disparity) and median depth over the valid looks of N frames; None if none valid."""
    ds = [d for d in sample_disparities(S, Z, N, rng) if d >= S.dmin]
    if not ds:
        return None
    zs = sorted(S.k / d for d in ds)
    m = len(zs)
    med = zs[m // 2] if m % 2 else 0.5 * (zs[m // 2 - 1] + zs[m // 2])
    return sum(zs) / m, S.k / (sum(ds) / m), med
