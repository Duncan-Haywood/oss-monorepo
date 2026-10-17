"""Motion blur of a bar (pure Python).

A bright bar of width w (px) and contrast C occupies [0, w] at the start of an exposure and moves d = v*T px during it.
The instantaneous-exposure twin is d = 0. Pixels are unit-width boxes; noise is i.i.d. N(0, sigma^2) per pixel.
"""
import math
import random


def profile(x, w, d, c=1.0):
    """Exact time-averaged intensity at x: c * |[x-w, x] & [0, d]| / d (d > 0); the bar itself when d = 0."""
    if d <= 0:
        return c if 0.0 <= x <= w else 0.0
    return c * max(0.0, min(x, d) - max(x - w, 0.0)) / d


def profile_sim(x, w, d, c=1.0, n=2000):
    """Forward simulation: average n sub-exposures of the moving bar (no closed form)."""
    hit = 0
    for j in range(n):
        s = (j + 0.5) * d / n
        if 0.0 <= x - s <= w:
            hit += 1
    return c * hit / n


def peak(w, d, c=1.0):
    return c * min(1.0, w / d) if d > 0 else c


def cumulative(x, w, d, c=1.0):
    """Exact integral of profile from -inf to x (profile is piecewise linear with knots 0, min(w,d), max(w,d), w+d)."""
    if d <= 0:
        return c * max(0.0, min(x, w))
    lo, hi = min(w, d), max(w, d)
    p = c * lo / d
    if x <= 0:
        return 0.0
    if x <= lo:
        return 0.5 * p * x * x / lo
    if x <= hi:
        return 0.5 * p * lo + p * (x - lo)
    tail = w + d - hi
    u = min(x, w + d) - hi
    return 0.5 * p * lo + p * (hi - lo) + p * u - 0.5 * p * u * u / tail


def pixels(w, d, c=1.0, phase=0.0, lo=-3, hi=None):
    """Noiseless pixel values: exact box integrals of the profile over [i + phase, i + 1 + phase)."""
    hi = hi if hi is not None else int(w + d) + 4
    return [cumulative(i + phase + 1, w, d, c) - cumulative(i + phase, w, d, c) for i in range(lo, hi)]


def box_output(vals, length):
    """Max over positions of the sum of `length` consecutive pixels divided by sqrt(length): a unit-noise matched box filter."""
    pre = [0.0]
    for v in vals:
        pre.append(pre[-1] + v)
    best = 0.0
    for i in range(len(vals) - length + 1):
        best = max(best, pre[i + length] - pre[i])
    return best / math.sqrt(length)


def q(z):
    return 0.5 * math.erfc(z / math.sqrt(2))


def qinv(p, lo=-10.0, hi=10.0):
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if q(mid) > p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def detect_prob(mean_out, sigma, alpha):
    """P(statistic > noise-only threshold), statistic ~ N(mean_out, sigma^2), false-alarm rate alpha."""
    return q(qinv(alpha) - mean_out / sigma)


def speed_limit_peak(w, c, sigma, alpha, pd):
    """Largest d with Pd >= pd for a single-pixel-peak detector, taking the peak to be C w/d (d >= w)."""
    z = qinv(alpha) - qinv(pd)
    return w * c / (sigma * z)


def speed_limit_box(w, c, sigma, alpha, pd):
    """Largest d with Pd >= pd for the full-length matched box: C w / sqrt(w + d) >= sigma z."""
    z = qinv(alpha) - qinv(pd)
    return (w * c / (sigma * z)) ** 2 - w


def box_output_len_d(w, d, c=1.0):
    """Closed form for a box of length d centred on the smear (d >= w): C w / sqrt(d) * (1 - w/(4d)). The window drops two
    triangular corners of area w^2/8 each out of the C w collected by the full-length box."""
    return c * w / math.sqrt(d) * (1.0 - w / (4.0 * d))


def speed_limit_box_len_d(w, c, sigma, alpha, pd):
    """Largest d with box_output_len_d >= sigma z (decreasing in d for d >= w), by bisection."""
    z = qinv(alpha) - qinv(pd)
    lo, hi = w, 1e7
    if box_output_len_d(w, lo, c) < sigma * z:
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if box_output_len_d(w, mid, c) >= sigma * z:
            lo = mid
        else:
            hi = mid
    return lo


def mc_detect(mean_out, sigma, alpha, trials, rng):
    t = qinv(alpha) * sigma
    return sum(1 for _ in range(trials) if mean_out + rng.gauss(0.0, sigma) > t) / trials
