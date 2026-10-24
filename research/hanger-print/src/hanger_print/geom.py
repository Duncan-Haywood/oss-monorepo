"""Hanger geometry in millimetres, in the frontal plane: x to the right, y up, hook at the origin.

The arm is `hanger_fit.model.Hanger` with the same four parameters (w, slope, bow, r in cm):
a quadratic Bezier centreline from the hook to the centre of the end cap, offset by the
half-thickness r on both sides, ending in a round cap of radius r. The part is printed flat, so
`depth` (front to back) is the extrusion; hanger-fit's 2D section says nothing about it.
"""
import math
from dataclasses import dataclass

HUB_R = None       # hub disc radius defaults to the arm half-thickness
POST_W = 14.0      # mm, width of the post that carries the robot's rail loop
POST_H = 32.0      # mm, hook point to the centre of the loop
LOOP_RO = 12.0     # mm, outer radius of the loop
LOOP_RI = 5.0      # mm, hole radius: a 10 mm pin or hook of the rail passes through


@dataclass(frozen=True)
class Design:
    w: float        # cm, half width to the outer end of the arm
    slope: float    # degrees
    bow: float      # cm
    r: float        # cm, arm half-thickness and end radius
    depth: float = 12.0   # mm, extrusion (front to back)


def centreline(d, n=48):
    """Points (mm) of the arm centreline, hook to end-cap centre, as in hanger_fit.model.Hanger."""
    L = max(d.w - d.r, 0.5) * 10.0
    t = math.radians(d.slope)
    p0 = (0.0, 0.0)
    p2 = (L * math.cos(t), -L * math.sin(t))
    nrm = (math.sin(t), math.cos(t))
    p1 = (0.5 * (p0[0] + p2[0]) + 2.0 * d.bow * 10.0 * nrm[0],
          0.5 * (p0[1] + p2[1]) + 2.0 * d.bow * 10.0 * nrm[1])
    out = []
    for i in range(n + 1):
        u = i / n
        a, b, c = (1 - u) ** 2, 2 * u * (1 - u), u ** 2
        out.append((a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]))
    return out


def arm_parts(d, n=48, arc=16):
    """(top, bot, centre_end, arc_points) of the right arm; top/bot are n+1 stations each,
    arc_points run from top[-1] round the tip to bot[-1] (exclusive of both)."""
    c = centreline(d, n)
    r = d.r * 10.0
    top, bot = [], []
    for i, (x, y) in enumerate(c):
        j0, j1 = max(i - 1, 0), min(i + 1, n)
        tx, ty = c[j1][0] - c[j0][0], c[j1][1] - c[j0][1]
        m = math.hypot(tx, ty)
        nx, ny = -ty / m, tx / m          # left normal of the direction of travel
        top.append((x + r * nx, y + r * ny))
        bot.append((x - r * nx, y - r * ny))
    ce = c[-1]
    a0 = math.atan2(top[-1][1] - ce[1], top[-1][0] - ce[0])
    pts = [(ce[0] + r * math.cos(a0 - math.pi * k / arc), ce[1] + r * math.sin(a0 - math.pi * k / arc))
           for k in range(1, arc)]
    return top, bot, ce, pts


def arm_outline(d, n=48, arc=16, mirror=False):
    top, bot, _, pts = arm_parts(d, n, arc)
    o = top + pts + bot[::-1]
    return [(-x, y) for x, y in o][::-1] if mirror else o


def shells(d, n=48, arc=16, seg=48):
    """All shells of the hanger as a list of dicts {name, outline, hole}. Outlines are closed
    polygons in mm; shells overlap at the hub and a slicer or OpenSCAD's union merges them."""
    r = d.r * 10.0
    hub = [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    post = [(-POST_W / 2, 0.0), (POST_W / 2, 0.0), (POST_W / 2, POST_H), (-POST_W / 2, POST_H)]
    ring = [(LOOP_RO * math.cos(2 * math.pi * k / seg), POST_H + LOOP_RO * math.sin(2 * math.pi * k / seg))
            for k in range(seg)]
    hole = [(LOOP_RI * math.cos(2 * math.pi * k / seg), POST_H + LOOP_RI * math.sin(2 * math.pi * k / seg))
            for k in range(seg)]
    return [
        {"name": "arm_right", "outline": arm_outline(d, n, arc)},
        {"name": "arm_left", "outline": arm_outline(d, n, arc, mirror=True)},
        {"name": "hub", "outline": hub},
        {"name": "post", "outline": post},
        {"name": "loop", "outline": ring, "hole": hole},
    ]


def area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                     for i in range(len(poly)))


def bbox_fits(d, bed, step=5, half=False):
    """True if the part, turned about the vertical axis by some angle, fits a bed x bed square (mm).
    `half` checks one arm with its hub (a two-piece hanger). Returns (fits, best_angle_deg, bbox_w, bbox_h) for the angle with the smallest longer side."""
    pts = []
    for s in shells(d):
        if half and s["name"] not in ("arm_right", "hub"):
            continue
        pts += s["outline"]
    best = None
    for a in range(0, 90, step):
        c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
        xs = [c * x - s_ * y for x, y in pts]
        ys = [s_ * x + c * y for x, y in pts]
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        key = max(bw, bh)
        if best is None or key < best[0]:
            best = (key, a, bw, bh)
    return best[0] <= bed, best[1], best[2], best[3]
