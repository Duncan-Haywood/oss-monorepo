"""Evaluating a policy over a randomised scenario distribution: iid sampling vs low-discrepancy sampling.

A twin evaluates a policy by averaging its return over n scenarios drawn from the domain-randomisation
distribution, here uniform on [0,1]^d. Four samplers are compared; all are unbiased for the mean:

  mc      independent uniform draws
  lhs     Latin hypercube (one point per stratum in every coordinate)
  halton  Halton sequence with a random Cranley-Patterson shift (randomised quasi-Monte Carlo)
  rd      Roberts' R_d additive-recurrence lattice with a random shift

Three return functions with exact means (computed in rational arithmetic) span the smoothness range:
smooth (a product of linear terms), kink (a clipped cost, continuous but not differentiable) and
jump (a success/failure indicator, discontinuous).
"""
import itertools
import math
import random
from fractions import Fraction

__all__ = ["PRIMES", "sample", "Integrand", "smooth", "kink", "jump", "rmse_curve", "slope", "interval_coverage"]

PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)


def _radical_inverse(i, base):
    f, r = 1.0, 0.0
    while i > 0:
        f /= base
        r += f * (i % base)
        i //= base
    return r


def _phi(d):
    x = 2.0
    for _ in range(60):
        x = (1 + x) ** (1.0 / (d + 1))
    return x


def sample(kind, n, d, rng):
    """n points in [0,1]^d from sampler `kind`, drawn with `rng` (a fresh randomisation per call)."""
    if kind == "mc":
        return [[rng.random() for _ in range(d)] for _ in range(n)]
    if kind == "lhs":
        cols = []
        for _ in range(d):
            perm = list(range(n))
            rng.shuffle(perm)
            cols.append([(p + rng.random()) / n for p in perm])
        return [[cols[j][i] for j in range(d)] for i in range(n)]
    shift = [rng.random() for _ in range(d)]
    if kind == "halton":
        if d > len(PRIMES):
            raise ValueError("halton supports d <= %d" % len(PRIMES))
        return [[(_radical_inverse(i + 1, PRIMES[j]) + shift[j]) % 1.0 for j in range(d)] for i in range(n)]
    if kind == "rd":
        g = _phi(d)
        a = [(1.0 / g ** (j + 1)) % 1.0 for j in range(d)]
        return [[(shift[j] + a[j] * (i + 1)) % 1.0 for j in range(d)] for i in range(n)]
    raise ValueError(kind)


class Integrand:
    def __init__(self, name, f, mean, d):
        self.name, self.f, self.mean, self.d = name, f, mean, d

    def estimate(self, pts):
        return sum(self.f(p) for p in pts) / len(pts)


def _subset_sum(ws, x, power):
    """sum over subsets S of (-1)^|S| (x - w_S)_+^power, exactly (x, ws are Fractions)."""
    tot = Fraction(0)
    for k in range(len(ws) + 1):
        for S in itertools.combinations(ws, k):
            v = x - sum(S, Fraction(0))
            if v > 0:
                tot += (-1) ** k * v ** power
    return tot


def _cdf(ws, x):
    """P(sum w_j u_j <= x) for u uniform on the unit cube (generalised Irwin-Hall), exact."""
    d = len(ws)
    prod = Fraction(1)
    for w in ws:
        prod *= w
    return _subset_sum(ws, x, d) / (math.factorial(d) * prod)


def _cdf_integral(ws, x):
    """integral from 0 to x of _cdf."""
    d = len(ws)
    prod = Fraction(1)
    for w in ws:
        prod *= w
    return _subset_sum(ws, x, d + 1) / (math.factorial(d + 1) * prod)


def smooth(d, c=1.6, gamma=0.0):
    """prod_j (1 + c_j (u_j - 1/2)), c_j = c j^-gamma. Exact mean 1; gamma > 0 lowers the effective dimension."""
    cs = [c * (j + 1) ** (-gamma) for j in range(d)]

    def f(p):
        r = 1.0
        for cj, x in zip(cs, p):
            r *= 1.0 + cj * (x - 0.5)
        return r
    return Integrand("smooth", f, 1.0, d)


def _weights(d, decay):
    return [Fraction(max(1, round(8 / (j + 1))) if decay else 1) for j in range(d)]


def kink(d, decay=False, q=0.5):
    """Clipped cost max(0, sum w_j u_j - t) with t at the q-quantile of the sum (approx). Continuous, not smooth."""
    ws = _weights(d, decay)
    t = Fraction(sum(ws)) * Fraction(q)
    wf = [float(w) for w in ws]
    tf = float(t)
    # E[(s-t)_+] = (W - t) - integral_t^W F = (W - t) - (G(W) - G(t))
    W = sum(ws, Fraction(0))
    mean = (W - t) - (_cdf_integral(ws, W) - _cdf_integral(ws, t))

    def f(p):
        s = sum(w * x for w, x in zip(wf, p)) - tf
        return s if s > 0 else 0.0
    return Integrand("kink", f, float(mean), d)


def jump(d, decay=False, q=0.5):
    """Success indicator 1[sum w_j u_j <= t]. Discontinuous; exact mean is the generalised Irwin-Hall CDF."""
    ws = _weights(d, decay)
    t = Fraction(sum(ws)) * Fraction(q)
    wf = [float(w) for w in ws]
    tf = float(t)

    def f(p):
        return 1.0 if sum(w * x for w, x in zip(wf, p)) <= tf else 0.0
    return Integrand("jump", f, float(_cdf(ws, t)), d)


def rmse_curve(integrand, kind, ns, reps, seed):
    """RMSE of the n-point estimate for each n, over `reps` independent randomisations."""
    out = []
    for n in ns:
        rng = random.Random(f"{seed}/{integrand.name}/{kind}/{n}")
        se = 0.0
        for _ in range(reps):
            e = integrand.estimate(sample(kind, n, integrand.d, rng)) - integrand.mean
            se += e * e
        out.append(math.sqrt(se / reps))
    return out


def slope(ns, ys):
    """Least-squares slope of log y on log n (RMSE ~ n^slope)."""
    xs = [math.log(n) for n in ns]
    ls = [math.log(y) for y in ys]
    mx, my = sum(xs) / len(xs), sum(ls) / len(ls)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ls)) / sum((x - mx) ** 2 for x in xs)


def interval_coverage(integrand, kind, n_total, r, trials, seed, tcrit):
    """Coverage of the t-interval from r independent randomisations of n_total/r points each."""
    rng = random.Random(f"{seed}/cov/{integrand.name}/{kind}")
    m = n_total // r
    hit = 0
    for _ in range(trials):
        ests = [integrand.estimate(sample(kind, m, integrand.d, rng)) for _ in range(r)]
        mu = sum(ests) / r
        s = math.sqrt(sum((e - mu) ** 2 for e in ests) / (r - 1))
        if abs(mu - integrand.mean) <= tcrit * s / math.sqrt(r):
            hit += 1
    return hit / trials
