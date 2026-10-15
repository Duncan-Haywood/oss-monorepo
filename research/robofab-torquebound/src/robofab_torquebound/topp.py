"""Time-optimal rest-to-rest motion along a fixed joint-space line under joint torque limits.

The path is q(s) = qa + s (qb - qa), s in [0, 1]. Along it the joint torques are affine in the
path acceleration s'' and the squared path speed u = s'^2:  tau_i = A_i s'' + B_i u + G_i.
I discretise s, bound u by a velocity limit curve, then integrate forward (maximum acceleration)
and backward (maximum deceleration) and take the pointwise minimum. This is the standard
numerical-integration approach to time-optimal path parameterisation (Bobrow, Dubowsky and
Gibson, 1985; Pfeiffer and Johanni, 1987); this file is my own short implementation, checked
against a closed-form case in tests/. Pure Python, stylised.
"""
import math

from .model import G

# Jaw-force cap (added in robofab-jawcap). The grip bound F = m sqrt((g+a_z)^2 + a_r^2)/(2 mu) uses the
# wrist acceleration, which along the joint-space line is also affine in s'' and u:
# a = P s'' + Q u with P = dx/ds and Q = d2x/ds2 (x = wrist (r, z)). F <= Fcap is then a quadratic
# inequality in s'' (a disc in the (a_r, a_z + g) plane), so it gives an interval of s'' like the torques do.


def wrist_coeffs(arm, qa, qb, s, h=1e-4):
    """P, Q (each (r, z)) of the wrist acceleration a = P s'' + Q u at path position s."""
    def x(t):
        return arm.fk(qa[0] + t * (qb[0] - qa[0]), qa[1] + t * (qb[1] - qa[1]))
    x0, x1, x2 = x(s - h), x(s), x(s + h)
    p = [(x2[i] - x0[i]) / (2 * h) for i in range(2)]
    q = [(x2[i] - 2 * x1[i] + x0[i]) / h ** 2 for i in range(2)]
    return p, q


def coeffs(arm, qa, qb, s):
    """A, B, G (per joint) at path position s (no jaw term; see wrist_coeffs)."""
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    q = (qa[0] + s * dq[0], qa[1] + s * dq[1])
    z = (0.0, 0.0)
    g = arm.torque(q, z, z)
    a = arm.torque(q, z, dq)
    b = arm.torque(q, dq, z)
    return ([a[i] - g[i] for i in range(2)], [b[i] - g[i] for i in range(2)], g)


def jaw_interval(w, u, rmax):
    """Interval of s'' with the wrist acceleration inside the disc |(a_r, a_z + g)| <= rmax, rmax = 2 mu Fcap / m."""
    (pr, pz), (qr, qz) = w
    cr, cz = qr * u, G + qz * u
    a2 = pr * pr + pz * pz
    a1 = 2 * (pr * cr + pz * cz)
    a0 = cr * cr + cz * cz - rmax * rmax
    if a2 < 1e-18:
        return (-math.inf, math.inf) if a0 <= 0 else None
    d = a1 * a1 - 4 * a2 * a0
    if d < 0:
        return None
    r = math.sqrt(d)
    return ((-a1 - r) / (2 * a2), (-a1 + r) / (2 * a2))


def acc_bounds(c, u, tau, jaw=None):
    """(lowest, highest) feasible s'' at path speed^2 u, or None if no s'' keeps both torques in range
    (and, if jaw = (w, rmax) is given, the jaw force under its cap)."""
    lo, hi = -math.inf, math.inf
    if jaw is not None:
        iv = jaw_interval(jaw[0], u, jaw[1])
        if iv is None:
            return None
        lo, hi = iv
    for a, b, g in zip(*c):
        rest = b * u + g
        if abs(a) < 1e-15:
            if abs(rest) > tau:
                return None
            continue
        x, y = (-tau - rest) / a, (tau - rest) / a
        lo, hi = max(lo, min(x, y)), min(hi, max(x, y))
    return (lo, hi) if lo <= hi + 1e-12 else None


def u_limit(c, tau, jaw=None, ucap=1e6):
    """Largest u with a feasible s''. Without a jaw cap feasibility is monotone in u (bisection). With one it
    need not be (a centripetal term can cancel gravity), so I scan a geometric grid for the largest feasible u
    and bisect between it and the next grid point."""
    if acc_bounds(c, 0.0, tau, jaw) is None:
        return 0.0
    if jaw is None:
        lo, hi = 0.0, ucap
        if acc_bounds(c, hi, tau) is not None:
            return hi
    else:
        grid = [1e-4 * 1.1 ** i for i in range(int(math.log(ucap / 1e-4) / math.log(1.1)) + 1)]
        lo, hi = 0.0, None
        for u in reversed(grid):
            if acc_bounds(c, u, tau, jaw) is not None:
                lo = u
                break
            hi = u
        if hi is None:
            return lo
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if acc_bounds(c, mid, tau, jaw) is None:
            hi = mid
        else:
            lo = mid
    return lo


def solve(arm, qa, qb, tau, n=400, jaw_cap=None, mass=None, mu=0.5, wmax=None):
    """Time-optimal profile. Returns dict with total time T, node arrays s, u, and path acceleration
    sdd at the nodes, or None if the start cannot accelerate (e.g. gravity alone exceeds the limit).
    jaw_cap (N per jaw, with the held part's mass and friction mu) adds the jaw-force constraint."""
    ds = 1.0 / n
    cs = [coeffs(arm, qa, qb, k * ds) for k in range(n + 1)]
    if jaw_cap is None:
        jw = [None] * (n + 1)
    else:
        rmax = 2 * mu * jaw_cap / mass
        jw = [(wrist_coeffs(arm, qa, qb, k * ds), rmax) for k in range(n + 1)]
    cap = [u_limit(c, tau, j) for c, j in zip(cs, jw)]
    if wmax is not None:                                 # joint speed |dq_i| sqrt(u) <= wmax is a constant cap on u
        dmax = max(abs(qb[0] - qa[0]), abs(qb[1] - qa[1]))
        if dmax > 0:
            cap = [min(c, (wmax / dmax) ** 2) for c in cap]
    cap[0] = cap[n] = 0.0
    u = [0.0] * (n + 1)
    for k in range(n):                                   # forward: accelerate as hard as allowed
        bd = acc_bounds(cs[k], u[k], tau, jw[k])
        if bd is None or bd[1] <= 0 and u[k] == 0.0:
            return None
        u[k + 1] = min(u[k] + 2 * ds * bd[1], cap[k + 1])
        u[k + 1] = max(u[k + 1], 0.0)
    v = [0.0] * (n + 1)
    for k in range(n, 0, -1):                            # backward: decelerate as hard as allowed
        bd = acc_bounds(cs[k], v[k], tau, jw[k])
        if bd is None or bd[0] >= 0 and v[k] == 0.0:
            return None
        v[k - 1] = min(v[k] - 2 * ds * bd[0], cap[k - 1])
    u = [min(a, b) for a, b in zip(u, v)]
    # s'' = (1/2) du/ds, by central differences (one-sided at the ends)
    sdd = [(u[min(k + 1, n)] - u[max(k - 1, 0)]) / (2 * ds * (1 if 0 < k < n else 0.5)) / 2 for k in range(n + 1)]
    T = sum(2 * ds / (math.sqrt(u[k]) + math.sqrt(u[k + 1])) for k in range(n) if u[k] + u[k + 1] > 0)
    return {"T": T, "u": u, "sdd": sdd, "ds": ds, "n": n}


def peak_torque(arm, qa, qb, prof):
    """Peak |tau| per joint along the solved profile (an after-the-fact check of the limit)."""
    pk = [0.0, 0.0]
    for k in range(prof["n"] + 1):
        c = coeffs(arm, qa, qb, k * prof["ds"])
        for i in range(2):
            t = c[0][i] * prof["sdd"][k] + c[1][i] * prof["u"][k] + c[2][i]
            pk[i] = max(pk[i], abs(t))
    return pk


def peak_joint_speed(qa, qb, prof):
    """Peak joint speed (rad/s) along the solved profile: max_i |dq_i| sqrt(u)."""
    dmax = max(abs(qb[0] - qa[0]), abs(qb[1] - qa[1]))
    return dmax * math.sqrt(max(prof["u"]))


def wrist_force(arm, qa, qb, prof, mass, mu=0.5, h=1e-5):
    """Peak per-jaw force m sqrt((g+az)^2+ar^2)/(2 mu) along the profile, plus peak wrist accelerations."""
    from .model import G
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    f = azm = arm_ = 0.0
    for k in range(prof["n"] + 1):
        s = k * prof["ds"]
        q = (qa[0] + s * dq[0], qa[1] + s * dq[1])
        sd = math.sqrt(prof["u"][k])
        qd = (dq[0] * sd, dq[1] * sd)
        qdd = (dq[0] * prof["sdd"][k], dq[1] * prof["sdd"][k])
        x0 = arm.fk(q[0] - qd[0] * h, q[1] - qd[1] * h)
        x1 = arm.fk(*q)
        x2 = arm.fk(q[0] + qd[0] * h, q[1] + qd[1] * h)
        cen = [(x2[i] - 2 * x1[i] + x0[i]) / h ** 2 for i in range(2)]
        j = [[(arm.fk(q[0] + h, q[1])[i] - arm.fk(q[0] - h, q[1])[i]) / (2 * h),
              (arm.fk(q[0], q[1] + h)[i] - arm.fk(q[0], q[1] - h)[i]) / (2 * h)] for i in range(2)]
        ar = cen[0] + j[0][0] * qdd[0] + j[0][1] * qdd[1]
        az = cen[1] + j[1][0] * qdd[0] + j[1][1] * qdd[1]
        azm, arm_ = max(azm, az), max(arm_, abs(ar))
        f = max(f, mass * math.hypot(G + az, ar) / (2 * mu))
    return {"force": f, "az_up": azm, "ar": arm_}
