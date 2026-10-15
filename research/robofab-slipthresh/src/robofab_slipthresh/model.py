"""Jaw force needed to hold a part while the gripper accelerates (stylised).

Builds on `robofab-grasp` (box geometry, mass and bounds are imported by copy of its small formulas).
Seen from the gripper frame, a part held by two flat pads feels an effective gravity
g_eff = g + a_z upward in the frame (lift) plus a tangential acceleration a_t in the pad plane.
Friction at two pads must carry the vector sum: N >= m * sqrt((g + a_z)^2 + a_t^2) / (2 mu).
"""
import math

G = 9.81
DENSITY = 1240.0  # kg/m^3, PLA-like (assumed, not measured)


def bbox(boxes):
    return tuple(min(b[k] for b in boxes) if k < 3 else max(b[k] for b in boxes) for k in range(6))


def vol_m3(boxes):
    return sum((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in boxes) * 1e-9


def mass_kg(boxes, density=DENSITY):
    return density * vol_m3(boxes)


def com(boxes):
    v = [(b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in boxes]
    t = sum(v)
    return tuple(sum(vi * (b[k] + b[k + 3]) / 2 for vi, b in zip(v, boxes)) / t for k in range(3))


def com_offset_mm(boxes, axis):
    """Distance (mm) in the pad plane from the centre of the bounding box to the centre of mass."""
    bb, c = bbox(boxes), com(boxes)
    o = [k for k in range(3) if k != axis]
    return math.hypot(*[c[k] - (bb[k] + bb[k + 3]) / 2 for k in o])


def effective_load(az, at):
    """Magnitude (m/s^2) of the in-plane load per unit mass: sqrt((g+az)^2 + at^2)."""
    return math.hypot(G + az, at)


def force_bound(boxes, mu, az=0.0, at=0.0):
    """Minimum force per jaw (N): m * sqrt((g+az)^2 + at^2) / (2 mu). Ignores torque about the pad axis."""
    return mass_kg(boxes) * effective_load(az, at) / (2 * mu)


def bar(length_mm, t=10.0, w=10.0):
    """A uniform bar: t along x (grasp axis), length along y, w along z. Held horizontally by one end."""
    return [(0, 0, 0, t, length_mm, w)]


def torque_bounds(length_mm, mu, pad_h=10.0, t=10.0, w=10.0, density=DENSITY):
    """Bracket on the per-jaw force (N) to hold a bar by a pad window [0, pad_h] on its y axis, gravity -z.

    Pad patch: pad_h (y) by w (z) on each side. The centre of mass is d = length/2 - pad_h/2 from the patch centre.
    lower = max(force-only, torque-only): needed if friction budget were shared perfectly.
    upper = force-only + torque-only: sufficient (each takes its own share of the friction budget).
    Torque capacity per pad uses the mean distance r_mean of the patch from its centre, uniform pressure.
    """
    m = density * length_mm * t * w * 1e-9
    d = (length_mm / 2 - pad_h / 2) * 1e-3
    n = 200
    r = [(((i + .5) / n - .5) * pad_h * 1e-3, ((j + .5) / n - .5) * w * 1e-3) for i in range(n) for j in range(n)]
    r_mean = sum(math.hypot(a, b) for a, b in r) / len(r)
    f_only = m * G / (2 * mu)
    t_only = m * G * d / (2 * mu * r_mean)
    return {"force_only": f_only, "torque_only": t_only, "lower": max(f_only, t_only), "upper": f_only + t_only,
            "d_mm": d * 1e3, "r_mean_mm": r_mean * 1e3}
