"""Flat-earth two-ray (ground-bounce) radar detection, stylised.

Real system: monostatic radar at height hr, target at height ht, ground reflection coefficient -1, grazing angles small.
Path difference 2 hr ht / r, so the one-way field factor is |1 - e^{-j 2u}| = 2|sin u| with u = 2 pi hr ht / (lam r) and the
two-way power factor relative to free space is 16 sin^4(u). Detection is deterministic: SNR >= threshold, SNR_fs(r) = T (r_fs/r)^4,
so the target is detected iff 16 sin^4(u) >= c(r) = (r/r_fs)^4.
"""
import math
import random


def u_of(r, hr, ht, lam):
    return 2 * math.pi * hr * ht / (lam * r)


def lobe_gain(u):
    return 16.0 * math.sin(u) ** 4


def cfs(r, r_fs):
    """Detection threshold in units of free-space SNR margin: detect iff lobe_gain >= c."""
    return (r / r_fs) ** 4


def real_detect(r, hr, ht, lam, r_fs):
    return lobe_gain(u_of(r, hr, ht, lam)) >= cfs(r, r_fs)


def freespace_detect(r, r_fs):
    return r <= r_fs


def meangain_detect(r, r_fs, g=6.0):
    """Free-space twin with the lobe-averaged power gain (mean of 16 sin^4 = 6) folded in: detect iff c <= g."""
    return cfs(r, r_fs) <= g


def detect_fraction(c):
    """Fraction of phase u (uniform) at which 16 sin^4 u >= c: 1 - (2/pi) asin((c/16)^(1/4)), 0 for c > 16."""
    if c <= 0:
        return 1.0
    if c >= 16:
        return 0.0
    return 1.0 - (2 / math.pi) * math.asin((c / 16.0) ** 0.25)


def mean_gain(n=200000):
    return sum(lobe_gain(math.pi * (i + 0.5) / n) for i in range(n)) / n


def shift_disagreement(c, delta):
    """Probability (uniform u) that detect(u) != detect(u+delta) for the threshold c; arcs of length L on a circle of period pi."""
    f = detect_fraction(c)
    L = math.pi * f
    P = math.pi
    d = delta % P
    d = min(d, P - d)
    overlap = max(0.0, L - d) + max(0.0, L - (P - d))
    return 2.0 * (L - overlap) / P


def u_shift(r, hr, dh, lam):
    """Phase shift (in u) caused by a target-height error dh at range r."""
    return 2 * math.pi * hr * dh / (lam * r)


def r_crit(hr, dh, lam):
    """Range inside which a height error dh moves the lobes by more than pi/4 in u (a quarter lobe period): 8 hr dh / lam."""
    return 8 * hr * dh / lam


def indep_disagreement(f):
    """Disagreement of two independent detectors with detection probability f."""
    return 2 * f * (1 - f)


def brier_freespace(c):
    f = detect_fraction(c)
    return (1 - f) if c <= 1 else f


def brier_ensemble(c):
    f = detect_fraction(c)
    return f * (1 - f)


def ensemble_prob(r, hr, ht_twin, sigma, lam, r_fs, n, rng):
    """Twin detection probability: fraction of n height draws ~ N(ht_twin, sigma^2) that detect at range r."""
    if sigma == 0:
        return 1.0 if real_detect(r, hr, ht_twin, lam, r_fs) else 0.0
    return sum(real_detect(r, hr, rng.gauss(ht_twin, sigma), lam, r_fs) for _ in range(n)) / n


def brier_band(ranges, hr, ht_real, ht_twin, sigma, lam, r_fs, n=200, seed=1):
    rng = random.Random(seed)
    s = 0.0
    for r in ranges:
        y = 1.0 if real_detect(r, hr, ht_real, lam, r_fs) else 0.0
        p = ensemble_prob(r, hr, ht_twin, sigma, lam, r_fs, n, rng)
        s += (p - y) ** 2
    return s / len(ranges)
