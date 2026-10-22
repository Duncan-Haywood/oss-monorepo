"""Inverse of the burst break-even formula of sensing-burst: given K frames, how big a sensor can the burst match?

Model (Poisson-Gaussian, as in sensing-burst): a small-sensor frame records e = s*x electrons of signal and r electrons
of read noise. A burst of N frames at the large frame's exposure has variance (e + r^2)/(N s^2); one frame from a sensor
of area ratio A has (A e + r^2)/(A s)^2. Equal variance: N = A^2 (e + r^2)/(A e + r^2).
"""
import math


def frames_needed(e, r, A):
    """Break-even frame count for per-frame signal e (electrons per small-sensor pixel), read noise r (electrons)."""
    return A * A * (e + r * r) / (A * e + r * r)


def max_area_ratio(e, r, K):
    """Largest A a K-frame burst can match: positive root of (e + r^2) A^2 - K e A - K r^2 = 0.
    Tends to K when shot noise dominates (e >> r^2) and to sqrt(K) when read noise does (e << r^2)."""
    a, b, c = e + r * r, -K * e, -K * r * r
    return (-b + math.sqrt(b * b - 4 * a * c)) / (2 * a)


def signal_for_area_ratio(r, K, A):
    """Per-frame signal e at which K frames just match area ratio A, from A^2 (e + r^2) = K (A e + r^2).
    None unless sqrt(K) < A < K (below sqrt(K) any light level works, at K or above none does)."""
    if not (K ** 0.5 < A < K):
        return None
    return r * r * (A * A - K) / (K * A - A * A)
