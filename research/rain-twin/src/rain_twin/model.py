"""Two-way rain attenuation of a radar detection range, stylised.

Radar detects a point target at range r iff 40 log10(r_fs/r) >= A(r) (dB), where r_fs is the clear-air detection range and A(r) is the
two-way path attenuation. One-way specific attenuation is k R^g dB/km for rain rate R (mm/h); the path is cut into cells of length ell km, each
wet with probability p and then carrying an exponential rain rate of mean m, else dry. A(r) is non-decreasing and the margin is decreasing in
r, so the detection set is an interval [0, r_det] with a random r_det.
"""
import math
import random


def margin_db(r, r_fs):
    return 40.0 * math.log10(r_fs / r)


def lambert_w(x):
    """Principal branch for x >= 0 (Newton on w e^w = x)."""
    if x == 0:
        return 0.0
    w = math.log1p(x) if x < 3 else math.log(x) - math.log(math.log(x))
    for _ in range(60):
        e = math.exp(w)
        step = (w * e - x) / (e * (w + 1))
        w -= step
        if abs(step) < 1e-15 * max(1.0, abs(w)):
            break
    return w


def uniform_rain_range(r_fs, k, g, rate):
    """Detection range under a uniform rain rate: solve 40 log10(r_fs/r) = 2 k rate^g r  ->  r = W(beta r_fs)/beta, beta = 2 k rate^g ln10/40."""
    beta = 2 * k * rate ** g * math.log(10) / 40.0
    if beta == 0:
        return r_fs
    return lambert_w(beta * r_fs) / beta


def moment_ratio(g, p):
    """E[R^g] / (E R)^g for the wet/dry exponential cell: p^(1-g) Gamma(1+g) (Jensen gap of the power law)."""
    return p ** (1 - g) * math.gamma(1 + g)


def cell_moment(g, p, m):
    """E[R^g] for one cell: p m^g Gamma(1+g)."""
    return p * m ** g * math.gamma(1 + g)


def mean_atten_per_km(k, g, p, m):
    """E[A(r)]/r in dB/km (two-way): 2 k E[R^g]."""
    return 2 * k * cell_moment(g, p, m)


def var_atten(r, ell, k, g, p, m):
    """Var A(r) for r a whole number of cells: (2 k ell)^2 n (E R^{2g} - (E R^g)^2)."""
    n = r / ell
    return (2 * k * ell) ** 2 * n * (cell_moment(2 * g, p, m) - cell_moment(g, p, m) ** 2)


def draw_rates(n, p, m, rng):
    return [rng.expovariate(1.0 / m) if rng.random() < p else 0.0 for _ in range(n)]


def make_atten(rates, ell, k, g):
    """Return A(r) (piecewise linear, two-way dB) for the cell rates."""
    slopes = [2 * k * R ** g for R in rates]
    cum = [0.0]
    for s in slopes:
        cum.append(cum[-1] + s * ell)

    def A(r):
        j = min(int(r / ell), len(slopes) - 1)
        return cum[j] + slopes[j] * (r - j * ell)
    return A


def r_det(rates, ell, k, g, r_fs, iters=50):
    """Detection range for one rain field: root of margin(r) - A(r), bisection (margin - A is strictly decreasing)."""
    A = make_atten(rates, ell, k, g)
    lo, hi = 1e-6, r_fs
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        if margin_db(mid, r_fs) >= A(mid):
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def sample_r_det(n_trials, ell, k, g, r_fs, p, m, seed=1):
    rng = random.Random(seed)
    ncell = int(math.ceil(r_fs / ell))
    return sorted(r_det(draw_rates(ncell, p, m, rng), ell, k, g, r_fs) for _ in range(n_trials))


def detect_prob(sorted_rdet, r):
    """P(real detects at r) = P(r_det >= r) from a sorted sample."""
    from bisect import bisect_left
    return 1.0 - bisect_left(sorted_rdet, r) / len(sorted_rdet)


def brier(twin_prob, sorted_rdet_eval, ranges):
    """Mean Brier score of a twin probability function against real outcomes: E over fields and ranges of (p(r) - 1[r_det >= r])^2."""
    tot = 0.0
    for rd in sorted_rdet_eval:
        for r in ranges:
            tot += (twin_prob(r) - (1.0 if rd >= r else 0.0)) ** 2
    return tot / (len(sorted_rdet_eval) * len(ranges))
