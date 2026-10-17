"""Coast-down of a mass with viscous + Coulomb friction (real) vs a viscous-only twin. Pure Python.

Real:  m v' = -b v - c   (v > 0).   Twin:  m v' = -k v.
"""
import math


def real_stop_time(v0, m, b, c):
    return (m / b) * math.log1p(b * v0 / c)


def real_stop_distance(v0, m, b, c):
    """x = m * int_0^v0 v/(b v + c) dv."""
    return (m / b) * (v0 - (c / b) * math.log1p(b * v0 / c))


def twin_stop_distance(v0, m, k):
    return m * v0 / k


def twin_time_to_speed(v0, eps, m, k):
    """Time for the twin to slow to eps (it never reaches 0)."""
    return (m / k) * math.log(v0 / eps) if v0 > eps else 0.0


def simulate_coast(v0, m, b, c, dt=1e-4):
    """RK4 of the real system until v <= 0; returns (distance, time). Stop time is located by linear root of v."""
    f = lambda v: -(b * v + c) / m
    v, x, t = v0, 0.0, 0.0
    while True:
        k1 = f(v); k2 = f(v + 0.5 * dt * k1); k3 = f(v + 0.5 * dt * k2); k4 = f(v + dt * k3)
        vn = v + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6
        if vn <= 0:
            # deceleration is nearly constant over the last step: solve for the fraction of dt
            frac = v / (v - vn)
            return x + 0.5 * v * frac * dt, t + frac * dt
        x += 0.5 * (v + vn) * dt
        v, t = vn, t + dt


def fit_k(vs, accels, m):
    """Least squares through the origin of deceleration a on v: k/m = sum(a v)/sum(v^2)."""
    return m * sum(a * v for a, v in zip(accels, vs)) / sum(v * v for v in vs)


def fit_k_closed(v1, v2, m, b, c):
    """Continuous uniform speeds on [v1, v2]: k = b + c E[v]/E[v^2]."""
    ev = (v1 + v2) / 2
    ev2 = (v2 ** 3 - v1 ** 3) / (3 * (v2 - v1))
    return b + c * ev / ev2


def fit_affine(vs, accels, m):
    """OLS of a on (1, v): returns (b, c) estimates (model class includes Coulomb)."""
    n = len(vs)
    sv, sa = sum(vs), sum(accels)
    svv = sum(v * v for v in vs)
    sva = sum(v * a for v, a in zip(vs, accels))
    slope = (n * sva - sv * sa) / (n * svv - sv * sv)
    icpt = (sa - slope * sv) / n
    return m * slope, m * icpt


def crossover_speed(m, b, c, k, lo=1e-9, hi=1e9):
    """Speed v* where twin and real stopping distances agree (twin too long below, too short above)."""
    g = lambda v: twin_stop_distance(v, m, k) - real_stop_distance(v, m, b, c)
    # g(v) > 0 for small v (twin overestimates), g < 0 for large v if k > b
    if g(hi) >= 0 or g(lo) <= 0:
        return None
    for _ in range(300):
        mid = math.sqrt(lo * hi)
        if g(mid) > 0:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def max_rel_error(k, m, b, c, v1, v2, n=400):
    w = 0.0
    for i in range(n + 1):
        v = v1 * (v2 / v1) ** (i / n)
        w = max(w, abs(twin_stop_distance(v, m, k) / real_stop_distance(v, m, b, c) - 1))
    return w


def minimax_k(m, b, c, v1, v2):
    """k minimising the worst relative stopping-distance error over [v1, v2] (golden section; the max of
    two monotone-in-k envelope errors is unimodal in k)."""
    lo, hi = 1e-6, 1e6
    # unimodal in log k
    a, z = math.log(lo), math.log(hi)
    g = (math.sqrt(5) - 1) / 2
    c1, c2 = z - g * (z - a), a + g * (z - a)
    f1, f2 = max_rel_error(math.exp(c1), m, b, c, v1, v2), max_rel_error(math.exp(c2), m, b, c, v1, v2)
    for _ in range(120):
        if f1 < f2:
            z, c2, f2 = c2, c1, f1
            c1 = z - g * (z - a)
            f1 = max_rel_error(math.exp(c1), m, b, c, v1, v2)
        else:
            a, c1, f1 = c1, c2, f2
            c2 = a + g * (z - a)
            f2 = max_rel_error(math.exp(c2), m, b, c, v1, v2)
    k = math.exp((a + z) / 2)
    return k, max_rel_error(k, m, b, c, v1, v2)
