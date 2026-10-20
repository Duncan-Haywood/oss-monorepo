"""Time to fill one 96-well plate from a reagent trough with a gantry or a two-link arm, 1 or 8 channels.

Every constant marked ASSUMED is a round number, not a measurement of any product. Stdlib only."""
import math

PITCH = 0.009                 # m, 96-well plate pitch (ANSI/SLAS microplate standard)
ROWS, COLS = 8, 12
TROUGH = (0.25, 0.15)         # m, trough aspirate point on the deck (ASSUMED layout; arm base at the origin)
PLATE0 = (0.30, -0.10)        # m, well A1 (ASSUMED layout)
V_TIP = 200.0                 # uL, tip capacity
T_ASP, T_DISP = 1.0, 0.5      # s, aspirate and dispense actions (ASSUMED)
GANTRY = dict(v=0.40, a=3.0)            # m/s, m/s^2 per axis (ASSUMED)
ARM = dict(l1=0.35, l2=0.35, w=2.0, alpha=12.0)  # m, m, rad/s, rad/s^2 per joint (ASSUMED)
COST = dict(gantry=1200.0, arm=1500.0, head1=300.0, head8=1800.0)  # USD, ASSUMED, not quoted prices
MAX_MULTI = 20                # most dispenses per aspiration (ASSUMED accuracy limit)


def trap_time(d, vmax, amax):
    """Time to move distance d from rest to rest under a trapezoidal speed profile."""
    d = abs(d)
    if d <= 0.0:
        return 0.0
    if d >= vmax * vmax / amax:
        return d / vmax + vmax / amax
    return 2.0 * math.sqrt(d / amax)


def ik(x, y, l1=ARM["l1"], l2=ARM["l2"]):
    """Elbow-up planar inverse kinematics; returns (q1, q2) or None if out of reach."""
    r2 = x * x + y * y
    c2 = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    if abs(c2) > 1.0:
        return None
    q2 = math.acos(c2)
    q1 = math.atan2(y, x) - math.atan2(l2 * math.sin(q2), l1 + l2 * math.cos(q2))
    return q1, q2


def move_time(kind, p, q):
    if kind == "gantry":
        return max(trap_time(p[0] - q[0], GANTRY["v"], GANTRY["a"]), trap_time(p[1] - q[1], GANTRY["v"], GANTRY["a"]))
    a, b = ik(*p), ik(*q)
    if a is None or b is None:
        raise ValueError("point out of arm reach")
    return max(trap_time(a[i] - b[i], ARM["w"], ARM["alpha"]) for i in (0, 1))


def well(r, c):
    return (PLATE0[0] + PITCH * c, PLATE0[1] + PITCH * r)


def targets(channels, order):
    """Head positions to dispense at, in order. 1 channel: every well; 8 channels: every column (head spans a column)."""
    if channels == 1:
        cells = [(r, c) for r in range(ROWS) for c in range(COLS)]      # row by row, always left to right
        if order == "serpentine":
            cells = [(r, c) for r in range(ROWS) for c in (range(COLS) if r % 2 == 0 else range(COLS - 1, -1, -1))]
        elif order == "column":
            cells = [(r, c) for c in range(COLS) for r in range(ROWS)]
        return [well(r, c) for r, c in cells]
    cols = range(COLS) if order != "reverse" else range(COLS - 1, -1, -1)
    return [well(ROWS // 2, c) for c in cols]     # head centre sits mid-column


def plate_time(kind, channels, ul_per_well, order="serpentine"):
    """Seconds to fill all 96 wells with ul_per_well each."""
    pts = targets(channels, order)
    n_multi = max(1, min(MAX_MULTI, int(V_TIP // ul_per_well)))
    t, pos, i = 0.0, TROUGH, 0
    while i < len(pts):
        t += move_time(kind, pos, TROUGH) + T_ASP
        pos = TROUGH
        for p in pts[i:i + n_multi]:
            t += move_time(kind, pos, p) + T_DISP
            pos = p
        i += n_multi
    return t + move_time(kind, pos, TROUGH)


def cost_per_plate_hour(kind, channels, ul_per_well, order="serpentine"):
    """Capital cost divided by plates per hour (USD per plate/h)."""
    cap = COST[kind] + (COST["head8"] if channels == 8 else COST["head1"])
    return cap / (3600.0 / plate_time(kind, channels, ul_per_well, order))


WELL_TOL = 0.0015            # m, tip must land within this radius of the well centre (ASSUMED)
SIGMA_GANTRY = 0.0002        # m, per-axis positioning noise (ASSUMED)
SIGMA_JOINT = math.radians(0.10)   # rad, per-joint angle noise (ASSUMED)


def hit_prob(kind, p):
    """Chance a dispense lands within WELL_TOL of the well centre, isotropic Gaussian error."""
    if kind == "gantry":
        sigma = SIGMA_GANTRY
    else:
        q1, q2 = ik(*p)
        # tip error from joint noise: 2x2 Jacobian, error covariance J J^T * s^2; use its mean variance per axis
        l1, l2 = ARM["l1"], ARM["l2"]
        j = [[-l1 * math.sin(q1) - l2 * math.sin(q1 + q2), -l2 * math.sin(q1 + q2)],
             [l1 * math.cos(q1) + l2 * math.cos(q1 + q2), l2 * math.cos(q1 + q2)]]
        var = sum(j[a][b] ** 2 for a in range(2) for b in range(2)) * SIGMA_JOINT ** 2 / 2.0
        sigma = math.sqrt(var)
    return 1.0 - math.exp(-WELL_TOL ** 2 / (2.0 * sigma ** 2))


def plate_success(kind, channels):
    """Chance every well of the plate is hit (1 channel: 96 independent dispenses; 8: a column's 8 tips share the head
    position, so the chance is the column's centre hit, taken as the chance for all 8 at once)."""
    p = 1.0
    for pt in targets(channels, "serpentine"):
        p *= hit_prob(kind, pt)
    return p
