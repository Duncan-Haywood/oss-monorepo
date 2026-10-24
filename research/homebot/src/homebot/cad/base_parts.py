"""Printed parts of the carriage, lift, head, base and desk post (millimetres, body frames).

Bought hardware these parts expect: 2020 V-slot extrusion (mast, spokes, desk post) with M5
T-nuts, four mini V-wheels with M5 bolts and eccentric spacers on the carriage, 6 mm GT2
belt (open, ~2.2 m) with two 623ZZ idlers, M3/M4/M5 screws and nuts.
"""
from __future__ import annotations

import math

import cadquery as cq
import numpy as np

from ..layout import EX, EY, EZ, LIFT_HORN_Y, LIFT_PULLEY_X, ArmGeometry, carriage_box, wheel_servo_radius
from ..params import Robot
from .geom import MM, box, cyl, cyl_axis, horn_holes, place_servo_cutter, servo_frame_matrix, transform, union_all
from .parts import _servo_cradle


def _extrusion_cut(x0, x1, y0, y1, z0, z1, clear=0.25):
    return box(x0 - clear, x1 + clear, y0 - clear, y1 + clear, z0, z1)


def _rz(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


# --------------------------------------------------------------------------------------
# Carriage (one half; the other half is its mirror image across y = 0)
# --------------------------------------------------------------------------------------

def carriage(robot: Robot):
    a, sb, lf = robot.arm, robot.servo_body, robot.lift
    G = ArmGeometry(robot)
    x0, x1, z0, z1 = (v * MM for v in carriage_box(robot))
    yo = -(a.shoulder_width / 2 + G.carriage_face_y) * MM  # outer face (right half, y < 0)
    w = 2.4
    shell = box(x0, x1, yo, 0, z0, z1).cut(box(x0 + w, x1 - w, yo + w, -w, z0 + w, z1 - w))
    # lightening windows in the front, back and top walls (between the internal bosses)
    win_y = (yo + 48.0, -30.0)
    shell = shell.cut(box(x1 - w - 1, x1 + 1, win_y[0], win_y[1], z0 + 14, z1 - 14))
    shell = shell.cut(box(x0 - 1, x0 + w + 1, win_y[0], win_y[1], z0 + 14, z1 - 14))
    shell = shell.cut(box(x0 + 14, x1 - 14, win_y[0], win_y[1], z1 - w - 1, z1 + 1))
    shell = shell.cut(box(x0 + 14, x1 - 14, win_y[0], win_y[1], z0 - 1, z0 + w + 1))
    S = np.array([a.shoulder_forward, -a.shoulder_width / 2, 0.0])
    sx = S[0] * MM
    y_in = yo + 40.0
    # J1 shaft boss with two 608 bearings
    boss = cyl_axis(15.0, yo, y_in, "y", (sx, 0, 0))
    # J1 servo cradle (output outward through the outer wall)
    px, pz = G.j1_pinion_xz
    s1 = S + np.array([px, -(G.j1_horn_y - sb.horn_top), pz])
    R1 = servo_frame_matrix(-EY, EZ)
    j1 = _servo_cradle(robot, s1, R1, top_open=0.0)
    # lift servo cradle
    ls = np.array([LIFT_PULLEY_X, LIFT_HORN_Y - sb.horn_top, 0.0])
    RL = servo_frame_matrix(EY, EZ)
    lift = _servo_cradle(robot, ls, RL, top_open=0.0)
    # V-wheel axle bosses either side of the mast channel
    wy = -lf.v_wheel_offset * MM
    bosses = []
    for zw in lf.v_wheel_z:
        for xs in (-15.0, 12.0):
            bosses.append(box(xs, xs + 3.0, wy - 9, -w, zw * MM - 10, zw * MM + 10))
    idl = [box(-23.0, -11.0, -12.0, -w, zi - 6, zi + 6) for zi in (-24.0, 24.0)]
    joins = []
    for xb, zb in ((x0 + 8, z0 + 8), (x1 - 8, z0 + 8), (x0 + 8, z1 - 8), (x1 - 8, z1 - 8)):
        joins.append(box(xb - 5, xb + 5, -12, 0, zb - 5, zb + 5))
    part = union_all([shell, boss, j1, lift] + bosses + idl + joins)
    # bearings and shaft
    part = part.cut(cyl_axis(11.05, yo - 1, yo + 7.0, "y", (sx, 0, 0)))
    part = part.cut(cyl_axis(11.05, y_in - 7.0, y_in + 1, "y", (sx, 0, 0)))
    part = part.cut(cyl_axis(4.6, yo - 1, y_in + 1, "y", (sx, 0, 0)))
    # servo envelopes (horns pass through the walls)
    part = part.cut(place_servo_cutter(sb, s1, R1, horn_r=12.0))
    part = part.cut(place_servo_cutter(sb, ls, RL, horn_r=12.0))
    # mast channel, V-wheel space and axles
    part = part.cut(box(-10.5, 10.5, -10.5, 0.1, z0 - 1, z1 + 1))
    part = part.cut(box(-12.0, 12.0, wy - 8.0, -10.0, z0 - 1, z1 + 1))
    for zw in lf.v_wheel_z:
        part = part.cut(cyl_axis(2.6, -20, 20, "x", (0, wy, zw * MM)))
        part = part.cut(cyl_axis(3.6, 12.0, 20, "x", (0, wy, zw * MM)))  # eccentric spacer side
    # belt slot and pulley pocket
    pr = robot.lift.pulley_radius * MM
    part = part.cut(box(LIFT_PULLEY_X * MM - pr - 4, -10.5, -4.0, 0.1, z0 - 1, z1 + 1))
    part = part.cut(cyl_axis(pr + 3.5, -6.0, 0.1, "y", (LIFT_PULLEY_X * MM, 0, 0)))
    for zi in (-24.0, 24.0):
        part = part.cut(cyl_axis(1.65, -13, 0.1, "y", (-17.0, 0, zi)))
        part = part.cut(cyl_axis(5.6, -6.0, 0.1, "y", (-17.0, 0, zi)))  # 623ZZ idler
    # cable hole to the arm and bolt holes joining the halves
    part = part.cut(cyl_axis(6.0, y_in - 1, -w + 0.1, "y", (x1 - 20, 0, z1 - 20)))
    for xb, zb in ((x0 + 8, z0 + 8), (x1 - 8, z0 + 8), (x0 + 8, z1 - 8), (x1 - 8, z1 - 8)):
        part = part.cut(cyl_axis(1.65, -13, 1, "y", (xb, 0, zb)))
    return part


def pulley(robot: Robot):
    """GT2 pulley bolted to the lift servo horn (part z from the horn face)."""
    n = robot.lift.pulley_teeth
    r_od = (n * 2.0 / math.pi - 0.508) / 2
    body = cyl(r_od, 1.5, 8.5)
    for k in range(n):
        ang = 2 * math.pi * k / n
        body = body.cut(cyl(0.6, 1.0, 9.0, (r_od + 0.1) * math.cos(ang), (r_od + 0.1) * math.sin(ang)))
    part = union_all([cyl(r_od + 2.0, 0, 1.5), body, cyl(r_od + 2.0, 8.5, 10.0)])
    part = part.cut(horn_holes(robot.servo_body, -1, 11, centre_clear=8.0))
    r = robot.servo_body.horn_bolt_circle * MM / 2
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(2.9, 7.5, 11, r * math.cos(ang), r * math.sin(ang)))
    return part


# --------------------------------------------------------------------------------------
# Head
# --------------------------------------------------------------------------------------

def mast_cap(robot: Robot):
    """Sits on the mast top (z = 0 at the extrusion end), holds the pan servo output-up."""
    sb, h = robot.servo_body, robot.head
    t = h.cap_thickness * MM
    sock = box(-13, 13, -13, 13, -22, t).cut(_extrusion_cut(-10, 10, -10, 10, -23, 0))
    sock = sock.cut(cyl_axis(2.7, -14, 14, "x", (0, 0, -11))).cut(cyl_axis(2.7, -14, 14, "y", (0, 0, -11)))
    plate = box(-38.0, 14.0, -15.5, 15.5, 0, t)
    ps = np.array([0.0, 0.0, h.cap_thickness - sb.bottom])
    RP = servo_frame_matrix(EZ, -EX)
    cradle = _servo_cradle(robot, ps, RP, top_open=-12.0)
    belt = box(-24, -13, -6, 6, -22, -4).cut(box(-14.5, -11.0, -4, 4, -23, -3))  # belt end clamp
    part = union_all([sock, plate, cradle, belt])
    part = part.cut(place_servo_cutter(sb, ps, RP, horn_r=12.0))
    return part


def neck(robot: Robot):
    """Pan child: horn plate and the cradle of the tilt servo (axis along y, output +y)."""
    sb, h = robot.servo_body, robot.head
    G = ArmGeometry(robot)
    disc = cyl(13.0, 0, 4.0)
    ts = np.array([0.0, -G.pitch_case_top, h.tilt_height])
    RT = servo_frame_matrix(EY, EZ)
    cradle = _servo_cradle(robot, ts, RT, top_open=-3.0)
    yb = (-G.pitch_case_top + robot.servo_body.bottom) * MM - 3.0
    plate = box(-15.0, 15.0, yb, 13.0, 0, 4.0)
    column = box(-15.0, 15.0, yb, -13.5, 0, h.tilt_height * MM - 10.0)
    part = union_all([disc, plate, column, cradle])
    part = part.cut(place_servo_cutter(sb, ts, RT, horn_r=14.0))
    part = part.cut(horn_holes(sb, -1, 6))
    return part


def head(robot: Robot):
    """Tilt child: plate on the tilt horn and a camera plate (1/4-20 tripod hole + strap slots)."""
    sb, h = robot.servo_body, robot.head
    G = ArmGeometry(robot)
    yh = (-G.pitch_case_top + sb.horn_top) * MM  # horn face (y)
    horn_plate = cyl_axis(13.0, yh, yh + 4.0, "y")
    horn_plate = horn_plate.cut(transform(horn_holes(sb, -1, 6), servo_frame_matrix(EY, EZ), (0, yh, 0)))
    xc = h.camera_forward * MM - 12.0
    arm = box(-6.0, xc, yh, yh + 4.0, -8.0, 8.0)
    face = box(xc - 4.0, xc, -40.0, 40.0, -16.0, 16.0)
    part = union_all([horn_plate, arm, face])
    part = part.cut(cyl_axis(3.3, xc - 5, xc + 1, "x"))
    for ys in (-30.0, 30.0):
        part = part.cut(box(xc - 5, xc + 1, ys - 2, ys + 2, -9, 9))
    return part


# --------------------------------------------------------------------------------------
# Base
# --------------------------------------------------------------------------------------

def hub(robot: Robot):
    """Centre of the Y frame (z = spoke centre line): three spoke sockets + mast socket."""
    b = robot.base
    zb = (b.mast_bottom - b.frame_z) * MM
    body = cyl(45.0, -13.0, 13.0).union(cyl(17.0, 13.0, 30.0))
    body = body.cut(_extrusion_cut(-10, 10, -10, 10, zb, 31))
    for phi in b.wheel_angles:
        R = _rz(math.degrees(phi))
        body = body.cut(transform(_extrusion_cut(25.0, 60.0, -10, 10, -10.0, 10.0), R))
        body = body.cut(transform(cyl(2.7, 0, 14, 36.0, 0), R))
    body = body.cut(cyl_axis(2.7, -18, 18, "x", (0, 0, 22.0)))
    return body


def wheel_mount(robot: Robot):
    """Wheel servo cradle on the end of a spoke (part frame: wheel along +x)."""
    b, sb = robot.base, robot.servo_body
    rs = wheel_servo_radius(robot)
    so = np.array([rs, 0.0, b.wheel_radius])
    R = servo_frame_matrix(EX, EZ)
    cradle = _servo_cradle(robot, so, R, top_open=-6.0)
    se = b.spoke_end * MM
    fz = b.frame_z * MM
    sock = box(se - 28.0, se + 1.0, -13.0, 13.0, fz - 13.0, fz + 13.0)
    sock = sock.cut(_extrusion_cut(se - 30.0, se, -10, 10, fz - 10, fz + 10))
    sock = sock.cut(cyl(2.7, fz, fz + 14, se - 14.0, 0))
    bridge = box(se, (rs + sb.bottom) * MM, -15.2, 15.2, fz - 13.0, fz + 13.0)
    part = union_all([sock, cradle, bridge])
    part = part.cut(place_servo_cutter(sb, so, R, horn_r=12.0))
    return part


def wheel_hub(robot: Robot):
    """Horn-to-omni-wheel adapter (part z from the horn face), drilled for the AndyMark
    DuraOmni 4 in wheel: six 4 mm holes on a 47.6 mm (1.875 in) bolt circle, with a spigot
    that centres in its 0.96 in (24.4 mm) bore. For a VEX 4 in omni wheel use LeKiwi's hub."""
    sb = robot.servo_body
    part = cyl(29.0, 0, 4.0).union(cyl(12.0, 4.0, 14.0))
    part = part.cut(horn_holes(sb, -1, 15, centre_clear=8.0))
    r = sb.horn_bolt_circle * MM / 2
    for k in range(4):  # counterbores for the M3 horn screws from the wheel side
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(3.0, 4.0, 15, r * math.cos(ang), r * math.sin(ang)))
    for k in range(6):
        ang = k * math.pi / 3
        part = part.cut(cyl(2.15, -1, 5, 23.8 * math.cos(ang), 23.8 * math.sin(ang)))
    return part


def deck(robot: Robot):
    """One 60-degree deck sector (six make the deck), centred on +x; half-lap tabs join them.
    Sectors centred on a spoke carry the wheel notch; print all six from this file and cut
    the notch only where a wheel is (the notch is harmless elsewhere)."""
    b = robot.base
    R1, R0 = b.deck_radius * MM, 47.0
    t = b.deck_thickness * MM
    k = math.tan(math.pi / 6)
    wedge = (cq.Workplane("XY").polyline([(0, 0), (R1 * 1.2, -R1 * 1.2 * k), (R1 * 1.2, R1 * 1.2 * k)])
             .close().extrude(t))
    ring = cyl(R1, 0, t).cut(cyl(R0, -1, t + 1))
    part = ring.intersect(wedge)
    tab = transform(box(R0 + 5, R1 - 5, 0, 10, 0, t / 2), _rz(30))
    part = part.union(tab.intersect(ring))
    part = part.cut(transform(box(R0 + 4, R1 - 4, -10.5, 0, t / 2, t + 1), _rz(-30)))
    for rr in (90.0, 170.0):
        for deg, dy in ((30, 5.0), (-30, -5.0)):
            c = _rz(deg) @ np.array([rr, dy, 0])
            part = part.cut(cyl(1.65, -1, t + 1, c[0], c[1]))
    for rr in (110.0, 150.0):
        part = part.cut(box(rr - 2, rr + 2, -15, 15, -1, t + 1))
    part = part.cut(box(140.0, R1 + 1, -17.0, 17.0, -1, t + 1))
    return part


def post_foot(robot: Robot):
    """Foot for the desk post: 2020 socket on a plate with four screw holes."""
    plate = box(-45, 45, -45, 45, 0, 8)
    sock = box(-14, 14, -14, 14, 0, 45)
    part = plate.union(sock).cut(_extrusion_cut(-10, 10, -10, 10, 4, 46))
    for sx in (-35, 35):
        for sy in (-35, 35):
            part = part.cut(cyl(2.7, -1, 9, sx, sy))
    part = part.cut(cyl_axis(2.7, -15, 15, "x", (0, 0, 30)))
    return part


def _info():
    from .build import I3, PartInfo, _rx, _ry

    return {
        "carriage": (carriage, PartInfo("carriage", 2, True, _rx(-90), "two mirrored halves bolted together around the mast")),
        "pulley": (pulley, PartInfo("pulley", 1, False, I3, "printed GT2 pulley; a bought 36T pulley on a horn adapter also works")),
        "mast_cap": (mast_cap, PartInfo("mast_cap", 1, False, I3)),
        "neck": (neck, PartInfo("neck", 1, False, I3)),
        "head": (head, PartInfo("head", 1, False, _ry(90))),
        "hub": (hub, PartInfo("hub", 1, False, I3)),
        "wheel_mount": (wheel_mount, PartInfo("wheel_mount", 3, False, I3)),
        "wheel_hub": (wheel_hub, PartInfo("wheel_hub", 3, False, I3, "match the wheel bolt pattern to your omni wheels")),
        "deck": (deck, PartInfo("deck", 6, False, I3)),
        "post_foot": (post_foot, PartInfo("post_foot", 1, False, I3, "desk builds only")),
    }


class _Lazy(dict):
    """Defers importing build.py (which imports this module) until the parts are listed."""

    def items(self):
        return _info().items()

    def __getitem__(self, k):
        return _info()[k]

    def __contains__(self, k):
        return k in _info()


PARTS = _Lazy()
