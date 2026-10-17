"""Real sensor: photon counts K ~ Poisson(lam) per pixel. Twin: K ~ Normal(lam, s2) with constant s2.
Task: decide dark (lam0) vs bright (lam1), lam0 < lam1, equal priors, rule 'say bright iff K >= m'."""
import math


def pmf(k, lam):
    return math.exp(k * math.log(lam) - lam - math.lgamma(k + 1))


def cdf(k, lam):
    """P(K <= k), exact sum."""
    return sum(pmf(i, lam) for i in range(0, int(k) + 1)) if k >= 0 else 0.0


def phi(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))


def log_mean(a, b):
    return (b - a) / math.log(b / a)


def arith_mean(a, b):
    return 0.5 * (a + b)


def sqrt_mean(a, b):
    """Threshold of a sqrt-transformed (variance 1/4 Gaussian) twin: ((sqrt a + sqrt b)/2)^2 = (A+G)/2."""
    return (0.5 * (math.sqrt(a) + math.sqrt(b))) ** 2


def count_threshold(t):
    """Smallest integer m with 'K >= m' equivalent to 'K > t'."""
    return math.floor(t) + 1


def real_error(m, lam0, lam1):
    """Exact error of 'bright iff K >= m' under Poisson counts, equal priors."""
    return 0.5 * ((1 - cdf(m - 1, lam0)) + cdf(m - 1, lam1))


def best_m(lam0, lam1, mmax=None):
    mmax = mmax or int(3 * lam1 + 20)
    return min(range(0, mmax), key=lambda m: real_error(m, lam0, lam1))


def twin_error(lam0, lam1, s2):
    """Error the homoscedastic Gaussian twin predicts for its own optimal (midpoint) rule."""
    return phi(-(lam1 - lam0) / (2 * math.sqrt(s2)))


def matched_var(lam0, lam1):
    """Twin variance matched to the scene's mean brightness (one number for both classes)."""
    return arith_mean(lam0, lam1)


def real_error_rule(rule, lam0, lam1):
    return real_error(count_threshold(rule(lam0, lam1)), lam0, lam1)


def sample_error(m, lam0, lam1, n, rng):
    def poisson(l):
        L, k, p = math.exp(-l), 0, 1.0
        # Knuth is slow for large l; use inversion by cumulative pmf
        u = rng.random()
        c = 0.0
        k = 0
        while True:
            c += pmf(k, l)
            if u <= c or k > 20 * l + 50:
                return k
            k += 1
    e = 0
    for _ in range(n):
        e += (poisson(lam0) >= m) + (poisson(lam1) < m)
    return e / (2 * n)
