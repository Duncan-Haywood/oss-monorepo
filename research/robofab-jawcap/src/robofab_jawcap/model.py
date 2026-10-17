"""Stylised dynamics of a vertical-plane two-link arm carrying a printed part (pure Python).

q1 is the shoulder elevation from horizontal, q2 the elbow angle relative to link 1; the wrist
point is at radial distance r and height z from the shoulder axis. Links are uniform rods; the
gripper and the part are point masses at the wrist. All masses, torque limits and the friction
coefficient are assumed values, not measurements. SI units (metres, kg, N m).
"""
import math

G = 9.81


class Arm:
    def __init__(self, l1, l2, m1, m2, mp):
        self.l1, self.l2, self.m1, self.m2, self.mp = l1, l2, m1, m2, mp

    def fk(self, q1, q2):
        a, b = q1, q1 + q2
        return (self.l1 * math.cos(a) + self.l2 * math.cos(b), self.l1 * math.sin(a) + self.l2 * math.sin(b))

    def ik(self, r, z, branch=1):
        """Two-link IK; branch +1 is elbow bent positive. Returns (q1, q2) or None if out of reach."""
        d2 = r * r + z * z
        c = (d2 - self.l1 ** 2 - self.l2 ** 2) / (2 * self.l1 * self.l2)
        if abs(c) > 1:
            return None
        q2 = branch * math.acos(c)
        q1 = math.atan2(z, r) - math.atan2(self.l2 * math.sin(q2), self.l1 + self.l2 * math.cos(q2))
        return q1, q2

    def mass_matrix(self, q2):
        l1, l2, m1, m2, mp = self.l1, self.l2, self.m1, self.m2, self.mp
        lc1, lc2 = l1 / 2, l2 / 2
        i1, i2 = m1 * l1 ** 2 / 12, m2 * l2 ** 2 / 12
        c = math.cos(q2)
        m11 = m1 * lc1 ** 2 + i1 + m2 * (l1 ** 2 + lc2 ** 2 + 2 * l1 * lc2 * c) + i2 + mp * (l1 ** 2 + l2 ** 2 + 2 * l1 * l2 * c)
        m12 = m2 * (lc2 ** 2 + l1 * lc2 * c) + i2 + mp * (l2 ** 2 + l1 * l2 * c)
        m22 = m2 * lc2 ** 2 + i2 + mp * l2 ** 2
        return m11, m12, m22

    def gravity(self, q1, q2):
        lc1, lc2 = self.l1 / 2, self.l2 / 2
        g2 = (self.m2 * lc2 + self.mp * self.l2) * G * math.cos(q1 + q2)
        g1 = (self.m1 * lc1 + self.m2 * self.l1 + self.mp * self.l1) * G * math.cos(q1) + g2
        return g1, g2

    def torque(self, q, qd, qdd):
        (q1, q2), (d1, d2), (a1, a2) = q, qd, qdd
        m11, m12, m22 = self.mass_matrix(q2)
        h = -(self.m2 * self.l1 * self.l2 / 2 + self.mp * self.l1 * self.l2) * math.sin(q2)
        g1, g2 = self.gravity(q1, q2)
        return (m11 * a1 + m12 * a2 + h * (2 * d1 * d2 + d2 * d2) + g1,
                m12 * a1 + m22 * a2 - h * d1 * d1 + g2)


def min_jerk(s):
    """Position, velocity, acceleration of the min-jerk blend 10s^3-15s^4+6s^5 at s in [0,1] (per unit time^k)."""
    return (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5, 30 * s ** 2 - 60 * s ** 3 + 30 * s ** 4, 60 * s - 180 * s ** 2 + 120 * s ** 3)


def move(arm, qa, qb, T, n=200, mu=0.5, mass=None):
    """Joint-space min-jerk move of duration T. Returns peak |torque| per joint, peak wrist
    acceleration components, and the peak required per-jaw force for a held part of `mass` kg
    (None to skip): m*sqrt((g+az)^2 + ar^2)/(2 mu), with az and ar the wrist's vertical and
    radial acceleration; the grasp axis is taken as tangential, so both lie along the pad faces."""
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    tau = [0.0, 0.0]
    azmax = armax = 0.0
    force = 0.0
    h = 1e-5
    for k in range(n + 1):
        s = k / n
        p, v, a = min_jerk(s)
        q = (qa[0] + dq[0] * p, qa[1] + dq[1] * p)
        qd = (dq[0] * v / T, dq[1] * v / T)
        qdd = (dq[0] * a / T ** 2, dq[1] * a / T ** 2)
        t = arm.torque(q, qd, qdd)
        tau = [max(tau[0], abs(t[0])), max(tau[1], abs(t[1]))]
        # wrist acceleration by differentiating the kinematics: a = J qdd + (dJ/dt) qd, via finite differences of velocity
        x0 = arm.fk(q[0] - qd[0] * h, q[1] - qd[1] * h)
        x1 = arm.fk(*q)
        x2 = arm.fk(q[0] + qd[0] * h, q[1] + qd[1] * h)
        acc_c = [(x2[i] - 2 * x1[i] + x0[i]) / h ** 2 for i in range(2)]   # centripetal-type part along the path
        j = [[(arm.fk(q[0] + h, q[1])[i] - arm.fk(q[0] - h, q[1])[i]) / (2 * h),
              (arm.fk(q[0], q[1] + h)[i] - arm.fk(q[0], q[1] - h)[i]) / (2 * h)] for i in range(2)]
        ar = acc_c[0] + j[0][0] * qdd[0] + j[0][1] * qdd[1]
        az = acc_c[1] + j[1][0] * qdd[0] + j[1][1] * qdd[1]
        azmax, armax = max(azmax, az), max(armax, abs(ar))
        if mass is not None:
            force = max(force, mass * math.hypot(G + az, ar) / (2 * mu))
    return {"tau1": tau[0], "tau2": tau[1], "az_up": azmax, "ar": armax, "force": force}


def min_time(arm, qa, qb, tau_max, tmax=10.0, dt=0.01):
    """Shortest duration (s, on a `dt` grid) whose min-jerk move keeps both joint torques within
    `tau_max`, or None if even `tmax` is not enough (e.g. gravity alone exceeds the limit)."""
    T = dt
    while T <= tmax:
        r = move(arm, qa, qb, T, n=100)
        if max(r["tau1"], r["tau2"]) <= tau_max:
            return round(T, 10)
        T += dt
    return None


def min_time_capped(arm, qa, qb, tau_max, mass, fcap, mu=0.5, tmax=20.0, tol=1e-4):
    """Shortest min-jerk duration (bisection to `tol`; both limits are assumed to loosen as T grows) with joint
    torques within `tau_max` and the peak jaw force bound within `fcap`, or None if even `tmax` fails
    (e.g. fcap below the static hold force m g / (2 mu))."""
    def ok(T):
        r = move(arm, qa, qb, T, n=100, mu=mu, mass=mass)
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
