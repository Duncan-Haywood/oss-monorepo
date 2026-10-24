"""Fixed-step integrators on the Kepler problem against the exact two-body solution.

Units: GM = 1, semi-major axis a = 1, so the period is 2*pi and the specific energy is -1/2.
Start at periapsis (r = 1-e, purely tangential speed), so the exact orbit is known in closed form
from Kepler's equation M = E - e sin E.
"""
import math


def kepler_E(M, e):
    """Solve M = E - e sin E by Newton's method (safe start for high e)."""
    M = math.fmod(M, 2 * math.pi)
    E = M if e < 0.8 else math.pi
    for _ in range(60):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < 1e-15:
            break
    return E


def exact(t, e):
    """Position and velocity at time t for the orbit that starts at periapsis on the +x axis."""
    E = kepler_E(t, e)
    x = math.cos(E) - e
    y = math.sqrt(1 - e * e) * math.sin(E)
    r = 1 - e * math.cos(E)
    vx = -math.sin(E) / r
    vy = math.sqrt(1 - e * e) * math.cos(E) / r
    return x, y, vx, vy


def acc(x, y):
    r3 = (x * x + y * y) ** 1.5
    return -x / r3, -y / r3


def energy(s):
    x, y, vx, vy = s
    return 0.5 * (vx * vx + vy * vy) - 1 / math.hypot(x, y)


def step(method, s, h):
    x, y, vx, vy = s
    if method == "euler":
        ax, ay = acc(x, y)
        return (x + h * vx, y + h * vy, vx + h * ax, vy + h * ay)
    if method == "semi":
        ax, ay = acc(x, y)
        vx += h * ax; vy += h * ay
        return (x + h * vx, y + h * vy, vx, vy)
    if method == "verlet":
        ax, ay = acc(x, y)
        vx += 0.5 * h * ax; vy += 0.5 * h * ay
        x += h * vx; y += h * vy
        ax, ay = acc(x, y)
        return (x, y, vx + 0.5 * h * ax, vy + 0.5 * h * ay)
    if method == "rk4":
        def f(q):
            a = acc(q[0], q[1])
            return (q[2], q[3], a[0], a[1])
        k1 = f(s)
        k2 = f(tuple(si + 0.5 * h * k for si, k in zip(s, k1)))
        k3 = f(tuple(si + 0.5 * h * k for si, k in zip(s, k2)))
        k4 = f(tuple(si + h * k for si, k in zip(s, k3)))
        return tuple(si + h / 6 * (a + 2 * b + 2 * c + d) for si, a, b, c, d in zip(s, k1, k2, k3, k4))
    raise ValueError(method)


def run(method, e, steps_per_orbit, orbits):
    """Integrate for `orbits` periods; return dict of end-of-run position error, energy drift
    and the worst relative energy excursion seen at any step."""
    h = 2 * math.pi / steps_per_orbit
    s = exact(0.0, e)
    E0 = energy(s)
    worst = 0.0
    n = steps_per_orbit * orbits
    for _ in range(n):
        s = step(method, s, h)
        if not all(map(math.isfinite, s)) or math.hypot(s[0], s[1]) > 1e6:
            return {"pos_err": float("inf"), "dE": float("inf"), "worst_dE": float("inf")}
        worst = max(worst, abs(energy(s) - E0) / abs(E0))
    ex = exact(n * h, e)
    return {"pos_err": math.hypot(s[0] - ex[0], s[1] - ex[1]),
            "dE": (energy(s) - E0) / abs(E0), "worst_dE": worst}


def precession_per_orbit(method, e, steps_per_orbit, orbits):
    """Angle of the Laplace-Runge-Lenz vector after `orbits` periods (rad per orbit); exact is 0."""
    h = 2 * math.pi / steps_per_orbit
    s = exact(0.0, e)
    for _ in range(steps_per_orbit * orbits):
        s = step(method, s, h)
    x, y, vx, vy = s
    r = math.hypot(x, y)
    h_ang = x * vy - y * vx
    ex = vy * h_ang - x / r
    ey = -vx * h_ang - y / r
    return math.atan2(ey, ex) / orbits
