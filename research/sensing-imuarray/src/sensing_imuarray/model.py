"""Single-axis gyro noise model and fusion of n units with correlated errors.

A unit's rate error is white noise (angle random walk, density N in deg/sqrt(s))
plus a bias that random-walks (rate random walk, density K in deg/s/sqrt(s)).
The integrated angle error after time T has variance
    N^2 T  +  K^2 T^3 / 3.
Units in an array share a fraction rho_w of the white-noise variance (a shared
mount: common vibration) and rho_b of the bias-walk variance (common
temperature drift). Equal-weight fusion of n equicorrelated errors has
variance factor (1 + (n-1) rho) / n.
"""
import math
import numpy as np
from dataclasses import dataclass


@dataclass(frozen=True)
class Grade:
    N: float  # angle random walk, deg / sqrt(s)
    K: float  # rate random walk, deg / s / sqrt(s)


def angle_var(g, T):
    return g.N ** 2 * T + g.K ** 2 * T ** 3 / 3.0


def fused_factor(n, rho):
    return (1.0 + (n - 1) * rho) / n


def fused_angle_var(g, n, T, rho_w, rho_b):
    return (g.N ** 2 * T * fused_factor(n, rho_w)
            + g.K ** 2 * T ** 3 / 3.0 * fused_factor(n, rho_b))


def better_grade(cheap, k):
    """A unit whose both noise densities are k times lower."""
    return Grade(cheap.N / k, cheap.K / k)


def units_needed(cheap, better, T, rho_w, rho_b, nmax=100000):
    """Smallest n whose fused angle variance is <= the better unit's; None if no n."""
    target = angle_var(better, T)
    floor = (cheap.N ** 2 * T * rho_w + cheap.K ** 2 * T ** 3 / 3.0 * rho_b)
    if floor >= target:
        return None
    lo, hi = 1, 2
    while fused_angle_var(cheap, hi, T, rho_w, rho_b) > target:
        hi *= 2
        if hi > nmax:
            return None
    while lo < hi:
        mid = (lo + hi) // 2
        if fused_angle_var(cheap, mid, T, rho_w, rho_b) <= target:
            hi = mid
        else:
            lo = mid + 1
    return lo


def breakeven_rho(cheap, better, n, T):
    """Largest common rho (white and bias) at which n fused cheap units still tie."""
    a = better_target = angle_var(better, T)
    s = angle_var(cheap, T)
    # s * (1 + (n-1) rho)/n = a  ->  rho = (a n / s - 1)/(n-1)
    r = (a * n / s - 1.0) / (n - 1) if n > 1 else float("nan")
    return r


def crossover_time(g):
    """Horizon where bias walk equals white noise in angle variance."""
    return math.sqrt(3.0) * g.N / g.K


def simulate_units(g, n, T, dt, rho_w, rho_b, trials, rng):
    """Monte Carlo of n equicorrelated units; returns per-trial final angle error
    of each unit, shape (trials, n)."""
    steps = int(round(T / dt))
    ang = np.zeros((trials, n))
    bias = np.zeros((trials, n))
    sw, sb = g.N / math.sqrt(dt), g.K * math.sqrt(dt)
    for _ in range(steps):
        cw = rng.standard_normal((trials, 1))
        ow = rng.standard_normal((trials, n))
        cb = rng.standard_normal((trials, 1))
        ob = rng.standard_normal((trials, n))
        bias += sb * (math.sqrt(rho_b) * cb + math.sqrt(1 - rho_b) * ob)
        rate = bias + sw * (math.sqrt(rho_w) * cw + math.sqrt(1 - rho_w) * ow)
        ang += rate * dt
    return ang


def allan_var(rate, dt, m):
    """Non-overlapping Allan variance of a rate series at tau = m dt."""
    k = len(rate) // m
    means = rate[: k * m].reshape(k, m).mean(axis=1)
    return 0.5 * np.mean(np.diff(means) ** 2)


def fit_allan(taus, avars):
    """Least squares fit of avar = N^2/tau + K^2 tau/3 (both non-negative)."""
    A = np.stack([1.0 / taus, taus / 3.0], axis=1)
    w = 1.0 / avars  # relative weighting
    sol, *_ = np.linalg.lstsq(A * w[:, None], avars * w, rcond=None)
    sol = np.clip(sol, 0, None)
    return math.sqrt(sol[0]), math.sqrt(sol[1])
