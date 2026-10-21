"""Period and energy error of simulator integrators against the exact pendulum period.

Pendulum  theta'' = -w2 sin(theta), released from rest at theta0.
Exact period T = 4 K(k) / w, k = sin(theta0/2), K by the arithmetic-geometric mean.
"""
import math


def exact_period(theta0, w2=1.0):
    k = math.sin(theta0 / 2.0)
    a, b = 1.0, math.sqrt(1.0 - k * k)
    for _ in range(40):
        a, b = (a + b) / 2.0, math.sqrt(a * b)
    K = math.pi / (2.0 * a)
    return 4.0 * K / math.sqrt(w2)


def energy(theta, omega, w2=1.0):
    return 0.5 * omega * omega + w2 * (1.0 - math.cos(theta))


def step(method, th, om, dt, w2=1.0):
    f = lambda t: -w2 * math.sin(t)
    if method == "euler":  # explicit Euler
        return th + dt * om, om + dt * f(th)
    if method == "semi":  # semi-implicit (symplectic) Euler, MuJoCo/PyBullet style
        om2 = om + dt * f(th)
        return th + dt * om2, om2
    if method == "verlet":  # velocity Verlet
        a0 = f(th)
        th2 = th + dt * om + 0.5 * dt * dt * a0
        return th2, om + 0.5 * dt * (a0 + f(th2))
    if method == "rk4":
        k1t, k1o = om, f(th)
        k2t, k2o = om + 0.5 * dt * k1o, f(th + 0.5 * dt * k1t)
        k3t, k3o = om + 0.5 * dt * k2o, f(th + 0.5 * dt * k2t)
        k4t, k4o = om + dt * k3o, f(th + dt * k3t)
        return (th + dt / 6 * (k1t + 2 * k2t + 2 * k3t + k4t),
                om + dt / 6 * (k1o + 2 * k2o + 2 * k3o + k4o))
    raise ValueError(method)


def _hermite_root(t0, th0, om0, th1, om1, dt):
    """Zero of the cubic Hermite interpolant of theta on [0, dt]; returns offset."""
    lo, hi = 0.0, dt
    def h(s):
        u = s / dt
        h00, h10 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u
        h01, h11 = -2*u**3 + 3*u**2, u**3 - u**2
        return h00*th0 + h10*dt*om0 + h01*th1 + h11*dt*om1
    flo = h(lo)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if (h(mid) > 0) == (flo > 0):
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def simulate(method, theta0, dt, t_end, w2=1.0, start="rest"):
    """Returns (mean period from successive downward zero crossings, relative
    energy drift over the run, number of periods)."""
    if start == "rest":
        th, om = theta0, 0.0
    else:  # "bottom": theta=0 with the exact energy of the release from rest at theta0
        th, om = 0.0, math.sqrt(2.0 * w2 * (1.0 - math.cos(theta0)))
    e0 = energy(th, om, w2)
    n = int(round(t_end / dt))
    crossings = []
    for i in range(n):
        th1, om1 = step(method, th, om, dt, w2)
        if not (math.isfinite(th1) and math.isfinite(om1)) or abs(th1) > 1e6:
            return float("nan"), float("inf"), 0
        if th > 0 >= th1 and om < 0:  # downward crossing
            crossings.append(i * dt + _hermite_root(i * dt, th, om, th1, om1, dt))
        th, om = th1, om1
    drift = (energy(th, om, w2) - e0) / e0
    if len(crossings) < 2:
        return float("nan"), drift, 0
    per = (crossings[-1] - crossings[0]) / (len(crossings) - 1)
    return per, drift, len(crossings) - 1
