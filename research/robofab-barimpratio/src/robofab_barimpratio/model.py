"""Bar-at-one-end force models (copied from robofab-liftload, plus `point_contact_bound`).

Jaw force needed to hold a part while the gripper accelerates (stylised).

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


CORNERS = ((0.0, 0.0), (10.0, 0.0), (0.0, 10.0), (10.0, 10.0))  # (y, z) in mm: corners of a 10 x 10 mm pad window


def point_contact_bound(length_mm, mu, points=CORNERS, centre=(5.0, 5.0), t=10.0, w=10.0, density=DENSITY, n_dir=40000):
    """Least per-pad force (N) for n equal point contacts per pad, each with a friction disc of radius mu * N / n.

    Two identical pads (the same points on both faces). The wrench to carry is the bar's weight (0, -m g) in the
    pad plane plus its moment about the pad-normal axis through `centre` (the bar's centre of mass is
    (length/2, 5) mm). By convex duality a wrench w is carried iff u.w <= sum_i radius * |g_i(u)| for every
    direction u = (u_y, u_z, u_m), where g_i(u) = (u_y + u_m * z_i', u_z - u_m * y_i') and (y_i', z_i') is
    point i relative to `centre`. The least force is the maximum over directions, found on a Fibonacci grid
    of `n_dir` directions (exact in the limit). Ignores the elastic compliance that the simulator has.
    """
    import numpy as np
    m = density * length_mm * t * w * 1e-9
    d = (length_mm / 2 - centre[0]) * 1e-3
    wrench = np.array([0.0, -m * G, -m * G * d])  # (F_y, F_z, M about the pad normal), SI units
    i = np.arange(n_dir) + 0.5
    phi = np.arccos(1 - 2 * i / n_dir)
    th = np.pi * (1 + 5 ** 0.5) * i
    u = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
    pts = np.array([[(p[0] - centre[0]) * 1e-3, (p[1] - centre[1]) * 1e-3] for p in points])
    n = len(pts)
    cap = np.zeros(n_dir)
    for yy, zz in pts:
        g = np.stack([u[:, 0] + u[:, 2] * zz, u[:, 1] - u[:, 2] * yy], 1)
        cap += np.hypot(g[:, 0], g[:, 1])
    cap *= 2 * mu / n  # two pads; each point carries N / n of the normal force
    ok = cap > 1e-12
    return float(np.max((u @ wrench)[ok] / cap[ok]))
