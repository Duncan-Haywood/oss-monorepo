"""Scalar local-level Kalman filter with a mis-specified process-noise variance.

Truth:   x_t = x_{t-1} + w_t,  w ~ N(0, q);   y_t = x_t + v_t,  v ~ N(0, r).
Filter:  assumes (qa, ra) instead of (q, r); steady-state gain K from those.
The error recursion e_t = (1-K)(e_{t-1}+w_t) - K v_t is linear, so the true
steady-state posterior MSE of any fixed gain is exact (steady_mse).
"""
import math
import random


def gain(qa, ra):
    """Steady-state Kalman gain for assumed variances (qa, ra)."""
    p = 0.5 * (qa + math.sqrt(qa * qa + 4.0 * qa * ra))  # prior variance
    return p / (p + ra)


def steady_mse(k, q, r):
    """True steady-state posterior MSE of a filter with fixed gain k."""
    a = (1.0 - k) ** 2
    return (a * q + k * k * r) / (1.0 - a)


def optimal_mse(q, r):
    return steady_mse(gain(q, r), q, r)


def excess_ratio(lam, q=1.0, r=1.0):
    """MSE of a filter assuming qa = lam*q, divided by the optimal MSE."""
    return steady_mse(gain(lam * q, r), q, r) / optimal_mse(q, r)


def claimed_post_var(qa, ra):
    """Posterior variance the filter itself reports in steady state."""
    k = gain(qa, ra)
    return k * ra


def simulate_mse(k, q, r, n=200000, burn=1000, seed=0):
    """Monte-Carlo posterior MSE of a fixed-gain filter."""
    rng = random.Random(seed)
    sq, sr = math.sqrt(q), math.sqrt(r)
    x = 0.0
    xh = 0.0
    tot = 0.0
    for t in range(n + burn):
        x += rng.gauss(0.0, sq)
        y = x + rng.gauss(0.0, sr)
        pred = xh
        xh = pred + k * (y - pred)
        if t >= burn:
            tot += (xh - x) ** 2
    return tot / n
