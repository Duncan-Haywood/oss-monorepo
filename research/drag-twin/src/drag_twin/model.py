"""Drag twin.  Real system: a vehicle of unit mass with quadratic drag, v' = -c v|v| + u.  Twin: linear drag, v' = -k v + u, with k
fitted on data at one speed or over a speed range.  All truths are closed form.

Coast-down (u = 0):        real v(t) = v0/(1 + c v0 t), distance ln(1 + c v0 t)/c (never stops, log-divergent distance);
                           twin v(t) = v0 e^{-kt}, distance (v0 - v)/k (stops within v0/k).
Constant thrust F:         real terminal speed sqrt(F/c); twin F/k.
Braking (u = -B, B > 0):   real stopping distance ln(1 + c v0^2/B)/(2c); twin (1/k)(v0 - (B/k) ln(1 + k v0/B)).
"""
import math


def real_speed(t, v0, c):
    return v0 / (1.0 + c * v0 * t)


def twin_speed(t, v0, k):
    return v0 * math.exp(-k * t)


def real_time_to_ratio(r, v0, c):
    """Time for the real speed to fall to v0/r (r > 1)."""
    return (r - 1.0) / (c * v0)


def twin_time_to_ratio(r, k):
    return math.log(r) / k


def k_matched(c, v_fit):
    """Linear coefficient that matches the real drag force at speed v_fit: k = c v_fit."""
    return c * v_fit


def k_lsq_uniform(c, vmax):
    """Least-squares (through the origin) linear fit of c v^2 on speeds uniform in [0, vmax]: k = 3 c vmax / 4."""
    return 0.75 * c * vmax


def terminal_real(F, c):
    return math.sqrt(F / c)


def terminal_twin(F, k):
    return F / k


def stop_dist_real(v0, B, c):
    return math.log1p(c * v0 * v0 / B) / (2.0 * c)


def stop_dist_twin(v0, B, k):
    return (v0 - (B / k) * math.log1p(k * v0 / B)) / k


def safe_speed_real(D, B, c):
    """Largest speed from which real braking stops within D: v0^2 = (B/c)(e^{2cD} - 1)."""
    return math.sqrt(B / c * math.expm1(2.0 * c * D))


def safe_speed_twin(D, B, k):
    """Same for the twin, by bisection (stop_dist_twin is increasing in v0)."""
    lo, hi = 0.0, 1.0
    while stop_dist_twin(hi, B, k) < D:
        hi *= 2.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if stop_dist_twin(mid, B, k) < D:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def rk4_real(v0, c, u, T, dt):
    """Numerical check of the real closed forms: integrate v' = -c v|v| + u, return (v(T), distance)."""
    f = lambda v: -c * v * abs(v) + u
    v, x = v0, 0.0
    for _ in range(int(round(T / dt))):
        k1 = f(v); k2 = f(v + 0.5 * dt * k1); k3 = f(v + 0.5 * dt * k2); k4 = f(v + dt * k3)
        vn = v + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0
        x += 0.5 * (v + vn) * dt
        v = vn
    return v, x


def fit_k_from_coastdown(c, v0, T, dt, sigma=0.0, rng=None):
    """Fit linear k by least squares to the speed trace of a real coast-down from v0 over [0, T] (optionally noisy):
    minimise sum (v_i - v0 e^{-k t_i})^2 by golden-section search."""
    n = int(round(T / dt))
    ts = [i * dt for i in range(n + 1)]
    data = [real_speed(t, v0, c) + (rng.gauss(0, sigma) if rng else 0.0) for t in ts]

    def sse(k):
        return sum((d - v0 * math.exp(-k * t)) ** 2 for d, t in zip(data, ts))
    a, b = 1e-6, 10.0 * c * v0
    g = (math.sqrt(5) - 1) / 2
    x1, x2 = b - g * (b - a), a + g * (b - a)
    f1, f2 = sse(x1), sse(x2)
    for _ in range(100):
        if f1 < f2:
            b, x2, f2 = x2, x1, f1
            x1 = b - g * (b - a); f1 = sse(x1)
        else:
            a, x1, f1 = x1, x2, f2
            x2 = a + g * (b - a); f2 = sse(x2)
    return 0.5 * (a + b)
