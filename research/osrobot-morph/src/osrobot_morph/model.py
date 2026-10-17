"""Co-design of a planar two-link arm's body (link split) and controller (PD gains) for one task.

Stylised. Every physical number marked ASSUMED is a made-up round value, not a measured or quoted
figure for any product. Pure Python, no dependencies.
"""
import math, random

# ASSUMED parameters (SI units)
TOTAL_REACH = 0.50      # l1 + l2, fixed: the "same material budget" for every body
RHO = 1.0               # link mass per metre, kg/m
M_ELBOW = 0.15          # elbow motor, lumped at the end of link 1, kg
M_PAYLOAD = 0.05        # gripper + part at the tip, kg
TAU_MAX = 0.6           # torque limit of each joint motor, N m (same for every body)
B_VISC = 0.01           # joint viscous friction, N m s/rad
DT = 0.002              # integration step, s
HORIZON = 1.5           # s allowed per move
TOL = 0.002             # settled when tip error < TOL ...
HOLD = 0.05             # ... for HOLD seconds
# Task: tray offset from the base, so the split of the reach matters
TRAY = (0.15, 0.35, -0.10, 0.10)   # xmin, xmax, ymin, ymax in metres


def fk(l1, l2, q1, q2):
    return (l1 * math.cos(q1) + l2 * math.cos(q1 + q2),
            l1 * math.sin(q1) + l2 * math.sin(q1 + q2))


def ik(l1, l2, x, y):
    """Elbow-up-positive branch (q2 > 0); None if out of reach."""
    r2 = x * x + y * y
    c2 = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    if c2 > 1.0 or c2 < -1.0:
        return None
    q2 = math.acos(c2)
    q1 = math.atan2(y, x) - math.atan2(l2 * math.sin(q2), l1 + l2 * math.cos(q2))
    return q1, q2


def dyn_params(l1, l2):
    m1, m2 = RHO * l1, RHO * l2
    I1 = m1 * l1 ** 2 / 3 + M_ELBOW * l1 ** 2          # link 1 + elbow motor, about joint 1
    I2 = m2 * l2 ** 2 / 3 + M_PAYLOAD * l2 ** 2        # link 2 + payload, about joint 2
    M2 = m2 + M_PAYLOAD
    s2 = m2 * l2 / 2 + M_PAYLOAD * l2                  # first moment of link 2 about joint 2
    return I1, I2, M2, s2


def accel(l1, l2, p, q2, w1, w2, t1, t2):
    I1, I2, M2, s2 = p
    c = math.cos(q2)
    a = l1 * s2 * c
    m11 = I1 + I2 + M2 * l1 * l1 + 2 * a
    m12 = I2 + a
    m22 = I2
    h = l1 * s2 * math.sin(q2)
    r1 = t1 - B_VISC * w1 + h * (2 * w1 * w2 + w2 * w2)
    r2 = t2 - B_VISC * w2 - h * w1 * w1
    det = m11 * m22 - m12 * m12
    return (m22 * r1 - m12 * r2) / det, (m11 * r2 - m12 * r1) / det


def sat(t):
    return max(-TAU_MAX, min(TAU_MAX, t))


def move_time(l1, l2, gains, start, goal):
    """Seconds until the tip has stayed within TOL of `goal` for HOLD seconds; HORIZON if never.

    gains = (kp1, kd1, kp2, kd2): joint PD on a step in the IK joint targets, torque saturated.
    """
    qs, qg = ik(l1, l2, *start), ik(l1, l2, *goal)
    if qs is None or qg is None:
        return None
    kp1, kd1, kp2, kd2 = gains
    p = dyn_params(l1, l2)
    q1, q2 = qs
    w1 = w2 = 0.0
    inside = 0.0
    n = int(HORIZON / DT)
    for k in range(n):
        t1 = sat(kp1 * (qg[0] - q1) - kd1 * w1)
        t2 = sat(kp2 * (qg[1] - q2) - kd2 * w2)
        a1, a2 = accel(l1, l2, p, q2, w1, w2, t1, t2)
        w1 += a1 * DT; w2 += a2 * DT          # semi-implicit Euler
        q1 += w1 * DT; q2 += w2 * DT
        x, y = fk(l1, l2, q1, q2)
        if math.hypot(x - goal[0], y - goal[1]) < TOL:
            inside += DT
            if inside >= HOLD:
                return (k + 1) * DT - HOLD
        else:
            inside = 0.0
        if abs(q1) > 20 or abs(w1) > 1e3:     # diverged
            return HORIZON
    return HORIZON


def sample_moves(n, seed):
    rng = random.Random(seed)
    xa, xb, ya, yb = TRAY
    pt = lambda: (rng.uniform(xa, xb), rng.uniform(ya, yb))
    return [(pt(), pt()) for _ in range(n)]


def reachable(l1, l2):
    """True if every corner and edge midpoint of the tray, and the tray centre, is in reach."""
    xa, xb, ya, yb = TRAY
    pts = [(x, y) for x in (xa, (xa + xb) / 2, xb) for y in (ya, (ya + yb) / 2, yb)]
    return all(ik(l1, l2, *p) is not None for p in pts)


def score(l1, l2, gains, moves):
    """Mean move time over `moves`; unreachable body or setting-failed moves count as HORIZON."""
    if not reachable(l1, l2):
        return HORIZON
    return sum(move_time(l1, l2, gains, s, g) for s, g in moves) / len(moves)


def success_rate(l1, l2, gains, moves):
    if not reachable(l1, l2):
        return 0.0
    return sum(move_time(l1, l2, gains, s, g) < HORIZON for s, g in moves) / len(moves)


GAIN_BOX = [(0.5, 60.0), (0.005, 3.0), (0.5, 60.0), (0.005, 3.0)]   # log-uniform ranges


def tune(l1, l2, moves, n_evals, seed, start=None):
    """Random search then shrinking local search over the four gains. Returns (gains, score, evals)."""
    rng = random.Random(seed)
    lo = [math.log(a) for a, _ in GAIN_BOX]; hi = [math.log(b) for _, b in GAIN_BOX]
    best = start
    best_s = score(l1, l2, start, moves) if start else float("inf")
    evals = 1 if start else 0
    n_rand = n_evals // 2
    while evals < n_rand:
        g = tuple(math.exp(rng.uniform(a, b)) for a, b in zip(lo, hi))
        s = score(l1, l2, g, moves); evals += 1
        if s < best_s: best, best_s = g, s
    width = 0.5
    while evals < n_evals:
        g = tuple(min(math.exp(h), max(math.exp(a), x * math.exp(rng.gauss(0, width))))
                  for x, a, h in zip(best, lo, hi))
        s = score(l1, l2, g, moves); evals += 1
        if s < best_s: best, best_s = g, s
        else: width = max(0.05, width * 0.98)
    return best, best_s, evals


DEFAULT_GAINS = (10.0, 0.5, 10.0, 0.5)   # a plausible hand-set controller, not tuned


def split_to_links(frac):
    return TOTAL_REACH * frac, TOTAL_REACH * (1 - frac)
