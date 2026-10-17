"""Gravity twin.  Real plant: damped-free pendulum  th'' = -g sin(th) + u  (th = 0 hangs down), PD toward target th*:
u = kp (th* - th) - kd w + gff sin(th*).  Twin: gravity omitted (g = 0), th'' = u, closed loop s^2 + kd s + kp,
stable for every kp, kd > 0 with zero steady-state error and no dependence on th*.
Real equilibria solve  F(th) = kp (th* - th) + gff sin(th*) - g sin(th) = 0  and an equilibrium is stable iff
kp + g cos(th_e) > 0 (kd > 0).  Units: g = 1 sets the time scale; kp is then in units of g.
"""
import math


def force(th, kp, g, ths, gff=0.0):
    return kp * (ths - th) + gff * math.sin(ths) - g * math.sin(th)


def equilibria(kp, g, ths, gff=0.0, n=40000):
    """All equilibria, as (theta, stable).  |kp (ths - th)| <= g + |gff| brackets every root."""
    half = (g + abs(gff) + abs(g * 0)) / kp + 1e-9
    lo, hi = ths - half - 1e-6, ths + half + 1e-6
    out = []
    prev_t, prev_f = lo, force(lo, kp, g, ths, gff)
    for i in range(1, n + 1):
        t = lo + (hi - lo) * i / n
        f = force(t, kp, g, ths, gff)
        if prev_f == 0.0 or prev_f * f < 0:
            a, b, fa = prev_t, t, prev_f
            for _ in range(200):
                m = 0.5 * (a + b)
                fm = force(m, kp, g, ths, gff)
                if fa * fm <= 0:
                    b = m
                else:
                    a, fa = m, fm
            r = 0.5 * (a + b)
            if not out or abs(r - out[-1][0]) > 1e-9:
                out.append((r, kp + g * math.cos(r) > 0))
        prev_t, prev_f = t, f
    return out


def nearest_stable(kp, g, ths, gff=0.0):
    """Stable equilibrium closest to the target (None if none)."""
    st = [t for t, s in equilibria(kp, g, ths, gff) if s]
    return min(st, key=lambda t: abs(t - ths)) if st else None


def offset_first_order(kp, g, ths, gff=0.0):
    """Linearised sag  e = th* - th_e  ~ (g - gff) sin(th*) / (kp + g cos(th*))."""
    return (g - gff) * math.sin(ths) / (kp + g * math.cos(ths))


def simulate(kp, kd, g, ths, th0, T, w0=0.0, gff=0.0, dt=2e-3):
    """RK4.  Returns (theta(T), omega(T))."""
    c = gff * math.sin(ths)

    def f(th, w):
        return w, -g * math.sin(th) + kp * (ths - th) - kd * w + c

    th, w = th0, w0
    for _ in range(int(round(T / dt))):
        a = f(th, w)
        b = f(th + dt / 2 * a[0], w + dt / 2 * a[1])
        cc = f(th + dt / 2 * b[0], w + dt / 2 * b[1])
        d = f(th + dt * cc[0], w + dt * cc[1])
        th += dt / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + d[0])
        w += dt / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + d[1])
    return th, w


def twin_gains(kp, zeta):
    return kp, 2.0 * zeta * math.sqrt(kp)


def holds(kp, kd, g, ths, th0, T=80.0, tol=0.05):
    th, w = simulate(kp, kd, g, ths, th0, T)
    return abs(th - ths) < tol and abs(w) < tol


def basin_halfwidth(kp, kd, g, ths, hmax=3.0, iters=14, step=0.25):
    """Smallest start distance h from the target (starts th0 = ths -/+ h at rest, both sides must converge) that fails to hold,
    found by a coarse outward scan then bisection.  Returns hmax if none fails below hmax.  The basin need not be an interval;
    this is the first failure scanning outward."""
    def ok(h):
        return holds(kp, kd, g, ths, ths - h) and holds(kp, kd, g, ths, ths + h)
    h = step
    prev = 0.0
    while h <= hmax + 1e-12:
        if not ok(h):
            a, b = prev, h
            for _ in range(iters):
                m = 0.5 * (a + b)
                if ok(m):
                    a = m
                else:
                    b = m
            return 0.5 * (a + b)
        prev, h = h, h + step
    return hmax
