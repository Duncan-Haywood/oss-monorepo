"""Trapezoidal and jerk-limited (S-curve) velocity comparators for the carry (S-curve added in robofab-scurve;
the trapezoid is copied from robofab-trapezoid).

The path is the same joint-space line as in topp.py, q(s) = qa + s (qb - qa). The path parameter follows a
symmetric trapezoidal velocity profile of duration T: it ramps up over a fraction f of T, cruises, and ramps
down over a fraction f. f = 0.5 is a triangle; f -> 0 is a rectangle (infinite acceleration). In units of 1/T
the cruise speed is 1/(1 - f), so the peak joint speed is max|dq| / (T (1 - f)).
"""
import math

from .model import G


def trap_plain(tau, f):
    """Position, velocity, acceleration of the trapezoid at tau = t/T in [0, 1] (per unit time^k)."""
    v = 1.0 / (1.0 - f)
    a = v / f
    if tau < f:
        return 0.5 * a * tau * tau, a * tau, a
    if tau <= 1.0 - f:
        return 0.5 * a * f * f + v * (tau - f), v, 0.0
    r = 1.0 - tau
    return 1.0 - 0.5 * a * r * r, a * r, -a


def _ramp(t, r, j, vend):
    """Jerk-limited velocity ramp of duration r reaching speed vend: acceleration rises linearly over r j / 2,
    holds, then falls linearly over r j / 2 (j in (0, 1]; j = 1 has no flat part). Returns (p, v, a) at t in [0, r]."""
    t1 = 0.5 * r * j
    A = vend / (r * (1.0 - 0.5 * j))
    J = A / t1
    v1, p1 = 0.5 * J * t1 ** 2, J * t1 ** 3 / 6.0
    t2 = r - t1
    if t < t1:
        return J * t ** 3 / 6.0, 0.5 * J * t * t, J * t
    v2 = v1 + A * (t2 - t1)
    p2 = p1 + v1 * (t2 - t1) + 0.5 * A * (t2 - t1) ** 2
    if t < t2:
        s = t - t1
        return p1 + v1 * s + 0.5 * A * s * s, v1 + A * s, A
    s = t - t2
    return p2 + v2 * s + 0.5 * A * s * s - J * s ** 3 / 6.0, v2 + A * s - 0.5 * J * s * s, A - J * s


def trap(tau, f, j=0.0):
    """Position, velocity, acceleration at tau = t/T in [0, 1]. j = 0 is the trapezoid of robofab-trapezoid; j in
    (0, 1] makes each ramp jerk-limited (an S-curve): the share of the ramp spent changing acceleration."""
    if j <= 0.0:
        return trap_plain(tau, f)
    v = 1.0 / (1.0 - f)
    if tau < f:
        return _ramp(tau, f, j, v)
    if tau <= 1.0 - f:
        pf = _ramp(f, f, j, v)[0]
        return pf + v * (tau - f), v, 0.0
    p, vv, a = _ramp(1.0 - tau, f, j, v)
    return 1.0 - p, vv, -a


def sample_points(n, f, ramp_samples=0):
    """Sample times x = t/T: n + 1 cell midpoints over the whole move (as in robofab-scurve) and, if ramp_samples > 0,
    that many extra midpoints inside each of the two ramps, so that a ramp much shorter than 1/(n+1) is still checked."""
    xs = [(k + 0.5) / (n + 1) for k in range(n + 1)]
    for i in range(ramp_samples):
        y = (i + 0.5) / ramp_samples * f
        xs += [y, 1.0 - y]
    return xs


def move(arm, qa, qb, T, f, n=200, mu=0.5, mass=None, h=1e-5, j=0.0, ramp_samples=0):
    """Peak |torque| per joint and peak per-jaw force m sqrt((g+az)^2+ar^2)/(2 mu) of a trapezoid move."""
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    tau = [0.0, 0.0]
    force = 0.0
    for x in sample_points(n, f, ramp_samples):   # midpoints, so the acceleration jump at the corners is not hit exactly
        p, v, a = trap(x, f, j)
        q = (qa[0] + dq[0] * p, qa[1] + dq[1] * p)
        qd = (dq[0] * v / T, dq[1] * v / T)
        qdd = (dq[0] * a / T ** 2, dq[1] * a / T ** 2)
        t = arm.torque(q, qd, qdd)
        tau = [max(tau[0], abs(t[0])), max(tau[1], abs(t[1]))]
        if mass is not None:
            x0 = arm.fk(q[0] - qd[0] * h, q[1] - qd[1] * h)
            x1 = arm.fk(*q)
            x2 = arm.fk(q[0] + qd[0] * h, q[1] + qd[1] * h)
            cen = [(x2[i] - 2 * x1[i] + x0[i]) / h ** 2 for i in range(2)]
            jac = [[(arm.fk(q[0] + h, q[1])[i] - arm.fk(q[0] - h, q[1])[i]) / (2 * h),
                  (arm.fk(q[0], q[1] + h)[i] - arm.fk(q[0], q[1] - h)[i]) / (2 * h)] for i in range(2)]
            ar = cen[0] + jac[0][0] * qdd[0] + jac[0][1] * qdd[1]
            az = cen[1] + jac[1][0] * qdd[0] + jac[1][1] * qdd[1]
            force = max(force, mass * math.hypot(G + az, ar) / (2 * mu))
    return {"tau1": tau[0], "tau2": tau[1], "force": force}


def min_time_trap(arm, qa, qb, tau_max, mass, fcap, f, mu=0.5, tmax=40.0, tol=1e-4, wmax=None, n=200, j=0.0, ramp_samples=0):
    """Shortest duration T of a trapezoid with ramp fraction f meeting the torque, jaw-force and speed limits
    (bisection; all three loosen as T grows), or None if even tmax fails."""
    dmax = max(abs(qb[0] - qa[0]), abs(qb[1] - qa[1]))

    def ok(T):
        if wmax is not None and dmax / (T * (1.0 - f)) > wmax:
            return False
        r = move(arm, qa, qb, T, f, n=n, mu=mu, mass=mass, j=j, ramp_samples=ramp_samples)
        return max(r["tau1"], r["tau2"]) <= tau_max and r["force"] <= fcap
    if not ok(tmax):
        return None
    lo, hi = 1e-3, tmax
    if ok(lo):
        return lo
    while hi - lo > tol:
        mid = 0.5 * (lo + hi)
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return hi


FRACS = (0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5)


def best_trap(arm, qa, qb, tau_max, mass, fcap, mu=0.5, wmax=None, fracs=FRACS, j=0.0, ramp_samples=0):
    """Best ramp fraction on the grid: returns (T, f) with the smallest T, or None if none is feasible."""
    best = None
    for f in fracs:
        T = min_time_trap(arm, qa, qb, tau_max, mass, fcap, f, mu=mu, wmax=wmax, j=j, ramp_samples=ramp_samples)
        if T is not None and (best is None or T < best[0]):
            best = (T, f)
    return best


def refine_trap(arm, qa, qb, tau_max, mass, fcap, best, fracs, mu=0.5, wmax=None, j=0.0, ramp_samples=0, iters=14):
    """Golden-section search of the ramp fraction f between the grid neighbours of the grid optimum `best` = (T, f).
    T(f) need not be unimodal, so the result is min(grid optimum, best point visited): never worse than the grid.
    Returns (T, f, evaluations)."""
    fs = sorted(fracs)
    i = fs.index(best[1])
    a, b = fs[max(i - 1, 0)], fs[min(i + 1, len(fs) - 1)]
    g = (math.sqrt(5.0) - 1.0) / 2.0
    ev = [0]

    def T_of(f):
        ev[0] += 1
        return min_time_trap(arm, qa, qb, tau_max, mass, fcap, f, mu=mu, wmax=wmax, j=j, ramp_samples=ramp_samples)

    def val(f):
        t = T_of(f)
        return float("inf") if t is None else t
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = val(c), val(d)
    top = best
    for _ in range(iters):
        for f, t in ((c, fc), (d, fd)):
            if t < top[0]:
                top = (t, f)
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = val(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = val(d)
    for f, t in ((c, fc), (d, fd)):
        if t < top[0]:
            top = (t, f)
    return top[0], top[1], ev[0]
