"""Trapezoidal-velocity comparator for the carry (added in robofab-trapezoid).

The path is the same joint-space line as in topp.py, q(s) = qa + s (qb - qa). The path parameter follows a
symmetric trapezoidal velocity profile of duration T: it ramps up over a fraction f of T, cruises, and ramps
down over a fraction f. f = 0.5 is a triangle; f -> 0 is a rectangle (infinite acceleration). In units of 1/T
the cruise speed is 1/(1 - f), so the peak joint speed is max|dq| / (T (1 - f)).
"""
import math

from .model import G


def trap(tau, f):
    """Position, velocity, acceleration of the trapezoid at tau = t/T in [0, 1] (per unit time^k)."""
    v = 1.0 / (1.0 - f)
    a = v / f
    if tau < f:
        return 0.5 * a * tau * tau, a * tau, a
    if tau <= 1.0 - f:
        return 0.5 * a * f * f + v * (tau - f), v, 0.0
    r = 1.0 - tau
    return 1.0 - 0.5 * a * r * r, a * r, -a


def move(arm, qa, qb, T, f, n=200, mu=0.5, mass=None, h=1e-5):
    """Peak |torque| per joint and peak per-jaw force m sqrt((g+az)^2+ar^2)/(2 mu) of a trapezoid move."""
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    tau = [0.0, 0.0]
    force = 0.0
    for k in range(n + 1):
        # sample cell midpoints so that the acceleration jump at the corners is not hit exactly
        x = (k + 0.5) / (n + 1)
        p, v, a = trap(x, f)
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
            j = [[(arm.fk(q[0] + h, q[1])[i] - arm.fk(q[0] - h, q[1])[i]) / (2 * h),
                  (arm.fk(q[0], q[1] + h)[i] - arm.fk(q[0], q[1] - h)[i]) / (2 * h)] for i in range(2)]
            ar = cen[0] + j[0][0] * qdd[0] + j[0][1] * qdd[1]
            az = cen[1] + j[1][0] * qdd[0] + j[1][1] * qdd[1]
            force = max(force, mass * math.hypot(G + az, ar) / (2 * mu))
    return {"tau1": tau[0], "tau2": tau[1], "force": force}


def min_time_trap(arm, qa, qb, tau_max, mass, fcap, f, mu=0.5, tmax=40.0, tol=1e-4, wmax=None, n=200):
    """Shortest duration T of a trapezoid with ramp fraction f meeting the torque, jaw-force and speed limits
    (bisection; all three loosen as T grows), or None if even tmax fails."""
    dmax = max(abs(qb[0] - qa[0]), abs(qb[1] - qa[1]))

    def ok(T):
        if wmax is not None and dmax / (T * (1.0 - f)) > wmax:
            return False
        r = move(arm, qa, qb, T, f, n=n, mu=mu, mass=mass)
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


def best_trap(arm, qa, qb, tau_max, mass, fcap, mu=0.5, wmax=None, fracs=FRACS):
    """Best ramp fraction on the grid: returns (T, f) with the smallest T, or None if none is feasible."""
    best = None
    for f in fracs:
        T = min_time_trap(arm, qa, qb, tau_max, mass, fcap, f, mu=mu, wmax=wmax)
        if T is not None and (best is None or T < best[0]):
            best = (T, f)
    return best
