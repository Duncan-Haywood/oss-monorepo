"""Stylised reach model: a vertical-plane two-link arm on a turntable base.

The arm rotates about a vertical axis through (bx, by), so a target (x, y, z) needs radial
distance r = hypot(x-bx, y-by) and height z, solved as two-link inverse kinematics in the
(r, z) plane. Only the wrist point is checked (no orientation, collision or payload).
Lengths in mm. The gripper dimensions repeat the toy design of `research/robofab-selfparts`.
"""
import math

# part -> bounding box (x0, y0, z0, x1, y1, z1) of the final pose (toy design from robofab-selfparts)
GRIPPER = {
    "base": (0, 0, 0, 40, 30, 4), "rail_l": (0, 0, 4, 4, 30, 20), "rail_r": (36, 0, 4, 40, 30, 20),
    "finger_a": (6, 2, 4, 16, 10, 20), "finger_b": (24, 20, 4, 34, 28, 20),
    "link": (16, 12, 4, 24, 18, 10), "cover": (0, 0, 20, 40, 30, 24),
}
LIFT = 30.0  # clearance above the final pose where each part is approached from


def centre(b):
    return ((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)


def reachable(r, z, shoulder_h, l1, l2, elbow=(0.0, math.pi), shoulder=(-math.pi / 2, math.pi / 2)):
    """Two-link IK in the (r, z) plane. The elbow angle q2 is the interior bend from straight
    (0 = fully extended); either bend direction is tried. Returns True if some solution has
    q1 (shoulder elevation) in `shoulder` and |q2| in `elbow`."""
    dz = z - shoulder_h
    d2 = r * r + dz * dz
    c = (d2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    if c > 1 + 1e-12 or c < -1 - 1e-12:
        return False
    q2m = math.acos(max(-1.0, min(1.0, c)))
    for q2 in (q2m, -q2m):
        if not (elbow[0] - 1e-12 <= abs(q2) <= elbow[1] + 1e-12):
            continue
        q1 = math.atan2(dz, r) - math.atan2(l2 * math.sin(q2), l1 + l2 * math.cos(q2))
        if shoulder[0] - 1e-12 <= q1 <= shoulder[1] + 1e-12:
            return True
    return False


def targets(fixture=(0.0, 0.0), tray_gap=120.0, tray_cols=3, tray_pitch=50.0):
    """Wrist targets: for each free part, a pick point in a tray row and the place point plus
    the lift point above it. The fixture origin is the base part's corner; the tray row runs
    along +y at x = fixture_x + 40 + tray_gap."""
    fx, fy = fixture
    pts = {}
    for i, (n, b) in enumerate(GRIPPER.items()):
        if n == "base":
            continue
        cx, cy, cz = centre(b)
        pts[n] = {"place": (fx + cx, fy + cy, cz), "lift": (fx + cx, fy + cy, b[5] + LIFT)}
        row, col = divmod(i - 1, tray_cols)
        pts[n]["pick"] = (fx + 40 + tray_gap + row * tray_pitch, fy + col * tray_pitch, GRIPPER[n][5] - GRIPPER[n][2] / 2)
    return pts


def feasible(base, l1, l2, shoulder_h, pts, **lim):
    bx, by = base
    for p in pts.values():
        for k in ("place", "lift", "pick"):
            x, y, z = p[k]
            if not reachable(math.hypot(x - bx, y - by), z, shoulder_h, l1, l2, **lim):
                return False
    return True


def best_base(l1, l2, shoulder_h, pts, step=10.0, span=400.0, **lim):
    """Grid-search the base position (table plane) for one that reaches every target. Returns
    the feasible base closest to the fixture or None."""
    best = None
    n = int(span / step)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            b = (i * step, j * step)
            if feasible(b, l1, l2, shoulder_h, pts, **lim):
                d = math.hypot(*b)
                if best is None or d < best[0]:
                    best = (d, b)
    return best and best[1]


def min_link(shoulder_h, pts, ratio=1.0, lo=40.0, hi=600.0, step=5.0, **lim):
    """Smallest l1 (with l2 = ratio*l1) on a `step` mm grid whose arm can reach every target
    from some base position, or None."""
    l = lo
    while l <= hi:
        if best_base(l, ratio * l, shoulder_h, pts, **lim) is not None:
            return l
        l += step
    return None
