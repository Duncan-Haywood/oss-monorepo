"""Range twin.  Real sensor: the loop sees y = clip(x, -R, R) (a lidar/radar with a maximum range R, or a saturating
position reading).  Twin sensor: y = x (R = infinity).

P loop on an integrator plant:  x+ = x - k*y.  PI loop (same as backlash-twin):  z += y, x += -(kp*y + ki*z).
Beyond R the P loop is speed-capped at k*R, so the approach is linear, not geometric.  The loops are piecewise linear,
hence positively homogeneous: every normalised quantity depends on x0/R only.
"""
import math


def clip(x, r):
    return max(-r, min(r, x))


def run_p(k, r, x0, n):
    x, xs = x0, [x0]
    for _ in range(n):
        x -= k * clip(x, r)
        xs.append(x)
    return xs


def steps_to_tol(xs, tol):
    """First index at which |x| <= tol (and it stays: monotone loops only)."""
    for i, x in enumerate(xs):
        if abs(x) <= tol:
            return i
    return None


def twin_steps(k, x0, tol):
    """Geometric law, 0 < k < 1: smallest n with |x0|(1-k)^n <= tol."""
    if abs(x0) <= tol:
        return 0
    return math.ceil(math.log(tol / abs(x0)) / math.log(1 - k))


def real_steps(k, r, x0, tol):
    """Exact step count for the range-limited P loop, 0 < k < 1, x0 > 0: ceil((x0-R)/(kR)) capped steps to reach
    x <= R, then geometric from x1 = x0 - j1*k*R."""
    if x0 <= tol:
        return 0
    j1 = 0
    x1 = x0
    if x0 > r:
        j1 = math.ceil((x0 - r) / (k * r))
        x1 = x0 - j1 * k * r
    if x1 <= tol:  # only possible when tol >= R-ish; handled by caller grids
        return j1
    return j1 + math.ceil(math.log(tol / x1) / math.log(1 - k))


def run_pi(kp, ki, r, x0, n, freeze=False):
    """PI loop from x = x0, z = 0.  freeze=True: conditional integration (z frozen while |x| > R)."""
    x, z = x0, 0.0
    xs = [x0]
    for _ in range(n):
        y = clip(x, r)
        if not (freeze and abs(x) > r):
            z += y
        x += -(kp * y + ki * z)
        xs.append(x)
    return xs


def twin_radius(kp, ki):
    """Spectral radius of the linear loop (characteristic polynomial z^2 - (2-kp-ki) z + (1-kp))."""
    tr, det = 2 - kp - ki, 1 - kp
    disc = tr * tr - 4 * det
    if disc >= 0:
        s = math.sqrt(disc)
        return max(abs(tr + s), abs(tr - s)) / 2
    return math.sqrt(det)


def overshoot(xs):
    """Largest excursion to the wrong side (x0 > 0)."""
    return max(0.0, -min(xs))


def settle_index(xs, tol):
    """Last index with |x| > tol, plus one (0 if never outside)."""
    last = -1
    for i, x in enumerate(xs):
        if abs(x) > tol:
            last = i
    return last + 1


def fitted_gain_factor(r, l):
    """Effective gain, as a fraction of the true k, of a least-squares fit of the step -dx/k on x, from logs with x
    uniform on [-L, L]: E[x clip(x)]/E[x^2] = 1.5 r - 0.5 r^3 with r = R/L (1 if R >= L)."""
    q = min(1.0, r / l)
    return 1.5 * q - 0.5 * q ** 3
