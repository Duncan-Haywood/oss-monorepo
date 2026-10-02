"""CadQuery helpers: primitives in absolute coordinates, rigid transforms, involute gears,
and the STS3215 envelope used to cut servo pockets. All CAD is in millimetres; the
simulator scales meshes by 1e-3.
"""
from __future__ import annotations

import math

import cadquery as cq
import numpy as np

from ..params import ServoBody

MM = 1000.0


def box(x0, x1, y0, y1, z0, z1) -> cq.Workplane:
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, y0, z0))


def cyl(r, z0, z1, x=0.0, y=0.0) -> cq.Workplane:
    """Cylinder along z."""
    z0, z1 = sorted((z0, z1))
    return cq.Workplane("XY").circle(r).extrude(z1 - z0).translate((x, y, z0))


def cyl_axis(r, a0, a1, axis: str, c=(0.0, 0.0, 0.0)) -> cq.Workplane:
    """Cylinder of radius r along a principal axis from a0 to a1 (coordinates on that axis),
    passing through point c."""
    a0, a1 = sorted((a0, a1))
    c = list(c)
    if axis == "z":
        return cyl(r, a0, a1, c[0], c[1])
    if axis == "x":
        return (cq.Workplane("YZ").circle(r).extrude(a1 - a0).translate((a0, c[1], c[2])))
    if axis == "y":
        # XZ workplane normal is -y: extrude goes toward -y
        return (cq.Workplane("XZ").circle(r).extrude(a1 - a0).translate((c[0], a1, c[2])))
    raise ValueError(axis)


def transform(wp: cq.Workplane, R=None, t=(0.0, 0.0, 0.0)) -> cq.Workplane:
    """Apply x' = R x + t (R orthogonal, mirrors allowed) to every solid of ``wp``."""
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.gp import gp_Trsf

    R = np.eye(3) if R is None else np.asarray(R, float)
    T = gp_Trsf()
    T.SetValues(R[0, 0], R[0, 1], R[0, 2], float(t[0]),
                R[1, 0], R[1, 1], R[1, 2], float(t[1]),
                R[2, 0], R[2, 1], R[2, 2], float(t[2]))
    shapes = [cq.Shape.cast(BRepBuilderAPI_Transform(s.wrapped, T, True).Shape())
              for s in wp.vals() if isinstance(s, cq.Shape)]
    return cq.Workplane("XY").newObject(shapes)


def union_all(parts) -> cq.Workplane:
    out = None
    for p in parts:
        if p is None:
            continue
        out = p if out is None else out.union(p)
    return out


# --------------------------------------------------------------------------------------
# Gears
# --------------------------------------------------------------------------------------

def gear_profile(module, teeth, shift=0.0, pressure_deg=20.0, backlash=0.15, n_inv=10) -> list[tuple[float, float]]:
    """Closed 2D outline (mm) of a profile-shifted involute spur gear, centred at the origin.

    ``backlash`` (mm) is removed from the tooth thickness on the pitch circle; ``shift`` is
    the profile-shift coefficient (positive on small pinions to avoid undercut).
    """
    m, z = module, teeth
    a = math.radians(pressure_deg)
    rp = m * z / 2
    rb = rp * math.cos(a)
    ra = rp + m * (1 + shift)
    rf = rp - m * (1.25 - shift)
    s = math.pi * m / 2 + 2 * shift * m * math.tan(a) - backlash  # tooth thickness on pitch circle

    def inv(alpha):
        return math.tan(alpha) - alpha

    half_pitch = s / (2 * rp) + inv(a)  # half tooth angle at the base circle
    r_start = max(rb, rf)
    rs = np.linspace(r_start, ra, n_inv)
    flank = []
    for r in rs:
        alpha = math.acos(min(1.0, rb / r))
        th = half_pitch - inv(alpha)
        flank.append((r, th))
    pts = []
    step = 2 * math.pi / z
    for k in range(z):
        c = k * step
        tooth = []
        # root on the left, up the right flank (negative angle side), across the tip, down the left flank
        if rf < r_start:
            tooth.append((rf, -flank[0][1]))
        tooth += [(r, -th) for r, th in flank]
        tooth += [(r, th) for r, th in reversed(flank)]
        if rf < r_start:
            tooth.append((rf, flank[0][1]))
        for r, th in tooth:
            pts.append((r * math.cos(c + th), r * math.sin(c + th)))
        # root arc to the next tooth
        th0 = flank[0][1]
        for f in np.linspace(0.25, 0.75, 3):
            ang = c + th0 + f * (step - 2 * th0)
            pts.append((rf * math.cos(ang), rf * math.sin(ang)))
    return pts


def spur_gear(module, teeth, width, shift=0.0, bore=0.0) -> cq.Workplane:
    """Gear (mm) from z = 0 to z = width, axis z."""
    g = cq.Workplane("XY").polyline(gear_profile(module, teeth, shift)).close().extrude(width)
    if bore > 0:
        g = g.cut(cyl(bore / 2, -1, width + 1))
    return g


def horn_holes(sb: ServoBody, z0, z1, centre_clear=8.0) -> cq.Workplane:
    """Cutter: 4 x M3 clearance holes on the horn bolt circle plus the centre-screw clearance."""
    r = sb.horn_bolt_circle * MM / 2
    cut = cyl(centre_clear / 2, z0, z1)
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        cut = cut.union(cyl(1.65, z0, z1, r * math.cos(ang), r * math.sin(ang)))
    return cut


# --------------------------------------------------------------------------------------
# Servo envelope (servo frame, mm)
# --------------------------------------------------------------------------------------

def servo_envelope(sb: ServoBody, clearance=0.3, horn=True, cable=True, horn_r=11.5) -> cq.Workplane:
    """Solid occupied by an STS3215 (with clearance): case, raised cover, bottom bump,
    idler boss, horn swept volume and the connector/cable space at the far end."""
    c = clearance
    L0 = -sb.axis_from_end * MM
    L1 = (sb.length - sb.axis_from_end) * MM
    W = sb.width * MM / 2
    H = sb.height * MM
    parts = [
        box(L0 - c, L1 + c, -W - c, W + c, -H - 1.5 - c, 0 + c),  # case incl. rear bottom step
        box(sb.top_raise_from * MM - 1.0, L1 + c, -W - c, W + c, 0, sb.top_raise * MM + c),
        cyl(6.5 + c, 0, 1.8 + c),
        box(-3.5, 30.0, -9.5 - c, 9.5 + c, -H - 1.5 - c - (sb.bottom_bump * MM - 1.5), -H),
        cyl(4.5 + c, sb.bottom * MM - c, -H),
    ]
    if horn:
        parts.append(cyl(horn_r, 0, sb.horn_screw_top * MM + 0.8))
    if cable:
        parts.append(box(L1, L1 + 7.0, -8.0, 8.0, -H + 3.0, -3.0))
    return union_all(parts)


def servo_mount_holes(sb: ServoBody, z_top, depth=30.0, head=True) -> cq.Workplane:
    """M2 screw cutters into the case bottom holes, from the bottom face downward
    (servo frame). ``z_top`` is the face the screws thread into."""
    cut = None
    for x, y in sb.case_holes:
        h = cyl(1.1, z_top - depth, z_top + 0.5, x * MM, y * MM)
        if head:
            h = h.union(cyl(2.2, z_top - depth, z_top - 2.4 - 1.5, x * MM, y * MM))
        cut = h if cut is None else cut.union(h)
    return cut


def servo_frame_matrix(z_out, x_len) -> np.ndarray:
    z = np.asarray(z_out, float)
    x = np.asarray(x_len, float)
    return np.column_stack([x, np.cross(z, x), z])


def place_servo_cutter(sb: ServoBody, origin_m, R, **kw) -> cq.Workplane:
    return transform(servo_envelope(sb, **kw), R, tuple(np.asarray(origin_m) * MM))


def to_mesh(wp: cq.Workplane, tol=0.05, ang=0.2):
    """CadQuery solid -> trimesh (mm)."""
    import trimesh

    shape = wp.val() if len(wp.vals()) == 1 else cq.Compound.makeCompound(wp.vals())
    verts, tris = shape.tessellate(tol, ang)
    v = np.array([(p.x, p.y, p.z) for p in verts])
    f = np.array(tris)
    return trimesh.Trimesh(v, f, process=True)
