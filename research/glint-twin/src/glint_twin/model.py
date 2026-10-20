"""Monopulse angle glint from two unresolved point scatterers, stylised.

Strong scatterer (amplitude 1) at +d/2, weak scatterer (amplitude r<=1) at -d/2, relative phase phi ~ U[0, 2 pi) per look
(frequency agility or aspect change). Ideal linear sum/difference monopulse: estimate = Re(Delta/Sigma) with
Sigma = 1 + r e^{j phi}, Delta = k (d/2)(1 - r e^{j phi}), so the estimate is (d/2) Y with
    Y = (1 - r^2) / (1 + r^2 + 2 r cos phi).
All functions work in units of d/2 (Y = 1 is the strong scatterer, Y = -1 the weak one).
"""
import math
import random


def glint(r, phi):
    return (1 - r * r) / (1 + r * r + 2 * r * math.cos(phi))


def centroid(r):
    """Power centroid of the two scatterers (weights 1, r^2) in units of d/2; also the exact median of Y."""
    return (1 - r * r) / (1 + r * r)


def mean_y(r):
    """Exact mean of Y over uniform phase: the strong scatterer (r < 1)."""
    return 1.0 if r < 1 else 0.0 if r == 1 else -1.0


def var_y(r):
    """Exact variance of Y: 2 r^2 / (1 - r^2); infinite as r -> 1 (Y is identically 0 at r = 1 but any receiver noise breaks that)."""
    return 2 * r * r / (1 - r * r)


def y_min(r):
    return (1 - r) / (1 + r)


def y_max(r):
    return (1 + r) / (1 - r)


def tail_prob(y, r):
    """P(Y > y), exact. Y > y iff cos(phi) < ((1-r^2)/y - 1 - r^2)/(2r) for y > 0."""
    if y <= y_min(r):
        return 1.0
    if y >= y_max(r):
        return 0.0
    c = ((1 - r * r) / y - 1 - r * r) / (2 * r)
    return 1.0 - math.acos(c) / math.pi


def outside_span_prob(r):
    """P(Y > 1) = arccos(r)/pi: the estimate lies beyond the strong scatterer, outside the span of the two targets."""
    return math.acos(r) / math.pi


def quantile(p, r):
    """Exact p-quantile of Y: Y <= y iff cos(phi) >= c(y), so P(Y <= y) = phi*/pi with phi* = arccos c(y); invert at phi* = pi p."""
    return glint(r, math.pi * p)


def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def gaussian_twin_tail(y, r):
    """P(Y > y) under the twin: Normal(centroid, var_y) (variance matched to the real glint, mean at the power centroid)."""
    return 1.0 - norm_cdf((y - centroid(r)) / math.sqrt(var_y(r)))


def median_density(r):
    """Density of Y at its median (cos phi = 0): (1/pi)(1+r^2)^2 / (2 r (1-r^2))."""
    return (1 + r * r) ** 2 / (math.pi * 2 * r * (1 - r * r))


def median_var_per_look(r):
    """Asymptotic variance of the sample median of N looks times N: 1/(4 f(m)^2) = pi^2 r^2 (1-r^2)^2 / (1+r^2)^4."""
    return 1.0 / (4 * median_density(r) ** 2)


def mean_bias(r):
    """Bias of the mean glint relative to the power centroid: 2 r^2/(1+r^2) (units d/2)."""
    return mean_y(r) - centroid(r)


def mean_beats_median_var(r):
    """True iff the per-look variance of the sample mean is below that of the sample median (asymptotically)."""
    return var_y(r) < median_var_per_look(r)


def sample(r, n, rng):
    return [glint(r, rng.uniform(0.0, 2 * math.pi)) for _ in range(n)]


def median(xs):
    s = sorted(xs)
    m = len(s)
    return s[m // 2] if m % 2 else 0.5 * (s[m // 2 - 1] + s[m // 2])


def rms_error(r, n_looks, estimator, target, trials, seed):
    """RMS error of an estimator over n_looks looks against a target (units d/2)."""
    rng = random.Random(seed)
    s = 0.0
    for _ in range(trials):
        s += (estimator(sample(r, n_looks, rng)) - target) ** 2
    return math.sqrt(s / trials)


def mean_est(xs):
    return sum(xs) / len(xs)


def twin_rms_mean(r, n_looks):
    """RMS error of the mean of N looks against the centroid as the Gaussian twin predicts: sqrt(var/N)."""
    return math.sqrt(var_y(r) / n_looks)


def real_rms_mean_to_centroid(r, n_looks):
    """Exact RMS error of the mean of N looks against the centroid: sqrt(bias^2 + var/N)."""
    return math.sqrt(mean_bias(r) ** 2 + var_y(r) / n_looks)
