"""Gyro array under a temperature ramp: a shared tempco mean does not average away.

Each unit has white noise (ARW density N, deg/sqrt(s)), a bias random walk (K) and a
temperature coefficient c_i (deg/s per deg C). Across units c_i = mu + s * e_i with e_i
independent unit normals: mu is the part every unit shares (same die process, same board
heating), s the unit-to-unit spread. A common temperature ramp of r deg C/s over T seconds
adds angle error c_i * q with q = r T^2 / 2. Equal-weight fusion of n units gives

    var = (N^2 T + K^2 T^3/3 + s^2 q^2) / n  +  mu^2 q^2 .

The last term is a floor: no n removes it. Per-unit temperature compensation (a fitted
tempco, applied from a temperature sensor) leaves a fraction f of each c_i, so mu and s
scale by f. mu is treated as a fixed systematic of the grade (its square adds to the
variance), not as a random draw.
"""
import math
import numpy as np
from dataclasses import dataclass


@dataclass(frozen=True)
class Grade:
    N: float    # angle random walk, deg / sqrt(s)
    K: float    # rate random walk, deg / s / sqrt(s)
    mu: float   # shared tempco, deg/s per deg C
    s: float    # unit-to-unit tempco spread, deg/s per deg C


def white_walk_var(g, T):
    return g.N ** 2 * T + g.K ** 2 * T ** 3 / 3.0


def temp_ramp_q(r, T):
    """Integrated temperature excursion (deg C * s) of a linear ramp of r deg C/s."""
    return r * T ** 2 / 2.0


def fused_var(g, n, T, r, f=1.0):
    q = temp_ramp_q(r, T) * f
    return (white_walk_var(g, T) + g.s ** 2 * q ** 2) / n + g.mu ** 2 * q ** 2


def floor_rms(g, T, r, f=1.0):
    """Angle RMS error an infinite array still has (deg)."""
    return abs(g.mu) * temp_ramp_q(r, T) * f


def better_grade(g, k):
    """Every error term k times lower (so is the shared tempco)."""
    return Grade(g.N / k, g.K / k, g.mu / k, g.s / k)


def units_needed(cheap, better, T, r, f_cheap=1.0, f_better=1.0, nmax=10 ** 6):
    """Smallest n whose fused variance is <= the better unit's (a single unit, n = 1); None if none."""
    target = fused_var(better, 1, T, r, f_better)
    q = temp_ramp_q(r, T) * f_cheap
    floor = cheap.mu ** 2 * q ** 2
    if floor >= target:
        return None
    var1 = white_walk_var(cheap, T) + cheap.s ** 2 * q ** 2
    n = math.ceil(var1 / (target - floor) - 1e-12)
    return max(1, n) if n <= nmax else None


def max_ramp_for_tie(cheap, better, n, T, f_cheap=1.0, f_better=1.0):
    """Largest ramp rate (deg C/s) at which n fused cheap units still tie the better unit
    (bisection; the array's advantage shrinks monotonically in r when mu/k < mu)."""
    lo, hi = 0.0, 1.0
    if fused_var(cheap, n, T, 1e-12, f_cheap) > fused_var(better, 1, T, 1e-12, f_better):
        return 0.0
    while fused_var(cheap, n, T, hi, f_cheap) <= fused_var(better, 1, T, hi, f_better):
        hi *= 2
        if hi > 1e6:
            return float("inf")
    for _ in range(80):
        mid = (lo + hi) / 2
        if fused_var(cheap, n, T, mid, f_cheap) <= fused_var(better, 1, T, mid, f_better):
            lo = mid
        else:
            hi = mid
    return lo


def simulate(g, n, T, dt, r, trials, rng, f=1.0):
    """Monte Carlo of the fused angle error: white noise and bias walk independent per unit,
    tempcos drawn mu + s*e per unit and trial (mu enters as a fixed offset, so the sample
    second moment about zero is compared with fused_var). Returns fused errors, shape (trials,)."""
    steps = int(round(T / dt))
    ang = np.zeros((trials, n))
    bias = np.zeros((trials, n))
    sw, sb = g.N / math.sqrt(dt), g.K * math.sqrt(dt)
    for _ in range(steps):
        bias += sb * rng.standard_normal((trials, n))
        ang += (bias + sw * rng.standard_normal((trials, n))) * dt
    c = (g.mu + g.s * rng.standard_normal((trials, n))) * f
    ang += c * temp_ramp_q(r, T)
    return ang.mean(axis=1)
