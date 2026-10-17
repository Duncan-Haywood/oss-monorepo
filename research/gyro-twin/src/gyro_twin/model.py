"""Gyro noise model (pure Python): rate = bias + white noise, bias a random walk.

Continuous time: theta' = b + N xi, b' = K eta (b(0)=0). N: angle random walk (deg/sqrt(s)); K: rate random walk
(deg/s/sqrt(s)). The white-only twin is K = 0. Discrete step dt:
theta_{n+1} = theta_n + b_n dt + N sqrt(dt) xi_n ; b_{n+1} = b_n + K sqrt(dt) eta_n.
"""
import math
import random


def var_heading(t, N, K):
    """Continuous-time heading variance N^2 t + K^2 t^3 / 3."""
    return N * N * t + K * K * t ** 3 / 3


def var_heading_discrete(n, dt, N, K):
    """Exact variance of theta_n for the discrete recursion: N^2 dt n + K^2 dt^3 (n-1) n (2n-1) / 6."""
    return N * N * dt * n + K * K * dt ** 3 * (n - 1) * n * (2 * n - 1) / 6


def var_cross_track(t, N, K, v=1.0):
    """Variance of y = v * integral of theta at constant speed v: v^2 (N^2 t^3 / 3 + K^2 t^5 / 20)."""
    return v * v * (N * N * t ** 3 / 3 + K * K * t ** 5 / 20)


def allan_var(tau, N, K):
    """Allan variance of the rate: N^2 / tau + K^2 tau / 3."""
    return N * N / tau + K * K * tau / 3


def t_cross(N, K):
    """Time at which the rate-random-walk heading variance equals the white one (K^2 t^3/3 = N^2 t); it is also the
    averaging time at which the Allan variance is smallest (d/dtau of N^2/tau + K^2 tau/3 = 0)."""
    return math.sqrt(3) * N / K


def n_fit(N, K, tau0):
    """White-noise density that matches the real Allan variance at averaging time tau0 (single-point fit):
    N_fit^2 / tau0 = N^2 / tau0 + K^2 tau0 / 3."""
    return math.sqrt(N * N + K * K * tau0 * tau0 / 3)


def solve_interval(theta_max, N, K, z=1.0, kind="heading"):
    """Largest t with z^2 * variance(t) <= theta_max^2 (bisection); z = number of standard deviations allowed."""
    f = var_heading if kind == "heading" else (lambda t, N, K: var_cross_track(t, N, K))
    lo, hi = 0.0, 1.0
    while z * z * f(hi, N, K) < theta_max ** 2:
        hi *= 2
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        if z * z * f(mid, N, K) <= theta_max ** 2:
            lo = mid
        else:
            hi = mid
    return lo


def simulate(n_steps, dt, N, K, rng, record_at=None, v=None):
    """One path. Returns (theta, y) sampled at the step indices in record_at; y = v * sum theta dt if v is given."""
    th = b = y = 0.0
    sq, out = math.sqrt(dt), {}
    want = set(record_at or [n_steps])
    for i in range(1, n_steps + 1):
        bn = b + K * sq * rng.gauss(0, 1)
        thn = th + b * dt + N * sq * rng.gauss(0, 1)
        if v is not None:
            y += v * th * dt
        b, th = bn, thn
        if i in want:
            out[i] = (th, y)
    return out


def rate_record(n, dt, N, K, rng):
    """Gyro rate samples r_k = b_k + N / sqrt(dt) xi_k."""
    b, sq, r = 0.0, math.sqrt(dt), []
    for _ in range(n):
        r.append(b + N / sq * rng.gauss(0, 1))
        b += K * sq * rng.gauss(0, 1)
    return r


def overlapping_allan(rates, dt, ms):
    """Overlapping Allan variance at tau = m dt for each m in ms, from prefix sums of the rates."""
    ps = [0.0]
    for x in rates:
        ps.append(ps[-1] + x)
    out = []
    for m in ms:
        s, c = 0.0, 0
        for k in range(0, len(rates) - 2 * m + 1):
            a = (ps[k + m] - ps[k]) / m
            b = (ps[k + 2 * m] - ps[k + m]) / m
            s += (b - a) ** 2
            c += 1
        out.append(0.5 * s / c)
    return out
