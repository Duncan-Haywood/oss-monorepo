"""Dead reckoning of an underwater vehicle from DVL speed and a heading reference.

2-D, stdlib only. The vehicle moves at true speed u along a true heading psi(t); the
estimator integrates  (1+s)*u + noise  along  psi + bias + random walk.
"""
import math
import random


def analytic_rate(scale, bias_rad):
    """Position error per metre travelled on a straight track: sqrt(scale^2 + (2 sin(b/2))^2).

    Scale error is along-track, heading bias gives a chord 2 sin(b/2) per metre (cross-track).
    For a bias applied from the start of a straight line this is exact for the end point.
    """
    return math.hypot(scale, 2.0 * math.sin(bias_rad / 2.0))


def run_straight(length_m, speed=1.0, dt=1.0, scale=0.0, bias_rad=0.0, vel_sigma=0.0,
                 heading_rw_rad_sqrt_s=0.0, seed=0, fix_every_m=None, fix_sigma_m=0.0):
    """Dead-reckon a straight east-going track; return (final_error_m, max_error_m).

    vel_sigma: per-ping speed noise (m/s), averaged over dt by the caller's choice of dt.
    heading_rw_rad_sqrt_s: heading random walk (gyro angle random walk), rad per sqrt(s).
    fix_every_m: if set, the estimate is reset to truth + N(0, fix_sigma_m) each time this
    much true distance has passed (a surface GNSS fix).
    """
    rng = random.Random(seed)
    x_est = y_est = 0.0
    x = 0.0
    hdg = bias_rad
    since_fix = 0.0
    max_err = 0.0
    n = int(round(length_m / (speed * dt)))
    for _ in range(n):
        hdg += rng.gauss(0.0, heading_rw_rad_sqrt_s * math.sqrt(dt))
        v = speed * (1.0 + scale) + rng.gauss(0.0, vel_sigma)
        x_est += v * dt * math.cos(hdg)
        y_est += v * dt * math.sin(hdg)
        x += speed * dt
        since_fix += speed * dt
        if fix_every_m is not None and since_fix >= fix_every_m:
            x_est = x + rng.gauss(0.0, fix_sigma_m)
            y_est = rng.gauss(0.0, fix_sigma_m)
            since_fix = 0.0
        max_err = max(max_err, math.hypot(x_est - x, y_est))
    return math.hypot(x_est - x, y_est), max_err


def distance_to_bound(bound_m, scale, bias_rad):
    """Straight-line distance after which the analytic drift reaches bound_m."""
    return bound_m / analytic_rate(scale, bias_rad)
