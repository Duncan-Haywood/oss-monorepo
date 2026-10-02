"""Printed parts, each built in the frame of the body it belongs to (see ``homebot.layout``).

Every function returns a CadQuery solid in millimetres for the *right* arm (o = -1); the
left arm uses mirror images (``build.py`` exports both). Interfaces come from
``ArmGeometry`` so the parts and the MuJoCo model move together when a parameter changes.

Hardware assumed per joint: M3 screws into the aluminium horn (4 per horn), M2 x 6 screws
into the servo case, 608ZZ bearings + M8 bolt on the geared shoulder joints, a 6806ZZ
bearing on the upper-arm and forearm roll joints, and an M4 shoulder screw (or M4 bolt with
a printed bushing) as the passive pivot of each clevis.
"""
from __future__ import annotations

import math

import cadquery as cq
import numpy as np

from ..layout import EX, EY, EZ, ArmGeometry
from ..params import Robot
from .geom import (MM, box, cyl, cyl_axis, horn_holes, place_servo_cutter, servo_frame_matrix,
                   servo_mount_holes, spur_gear, transform, union_all)

O = -1.0  # right arm


def _servo_cradle(robot: Robot, origin_m, R, top_open=-8.0, side_stop=None, bottom_round=None, pivot=False):
    """Cradle around a servo (positive solid, servo frame then placed). The cradle wraps the
    case sides and bottom, leaves the output end free from ``top_open`` mm below the case top,
    has M2 screw holes into the case bottom and, if ``pivot``, a boss for the clevis pivot
    screw on the output axis below the bottom plate.

    ``side_stop``: x_s (mm) where the side walls stop toward the near end (clevis web clearance).
    ``bottom_round``: radius (mm) to which the bottom plate is trimmed around the axis on the
    near-end side (clevis web clearance)."""
    sb, a = robot.servo_body, robot.arm
    w = a.wall * MM
    L0 = -sb.axis_from_end * MM
    L1 = (sb.length - sb.axis_from_end) * MM
    W = sb.width * MM / 2 + 0.3
    zb = sb.bottom * MM - 0.3  # under the idler boss
    x_near = L0 - 0.3 if side_stop is None else side_stop
    walls = box(x_near, L1 + 0.3 + w, -W - w, W + w, zb - w, top_open)
    if bottom_round is not None:
        # keep the bottom plate only above the axis plus a disc of bottom_round around it
        keep = box(0, L1 + 0.3 + w, -W - w, W + w, zb - w - 1, top_open + 1).union(
            cyl(bottom_round, zb - w - 1, top_open + 1))
        walls = walls.intersect(keep)
    if pivot:
        walls = walls.union(cyl(5.0, zb - w - 2.0, zb))
    cut = place_servo_cutter(robot.servo_body, (0, 0, 0), np.eye(3), horn_r=0.1)
    walls = walls.cut(cut).cut(servo_mount_holes(sb, -sb.height * MM - 1.5, depth=12))
    if pivot:
        walls = walls.cut(cyl(2.8, zb - w - 2.5, zb - 0.5))  # M4 heat-set insert hole
    # cable window at the far end
    walls = walls.cut(box(L1 - 1, L1 + w + 1, -7, 7, -sb.height * MM + 4, -4))
    return transform(walls, R, tuple(np.asarray(origin_m) * MM))


def _bearing_ring(G: ArmGeometry, z_bottom_m, z_top_m, r_out=24.0):
    """Housing for a 6806 outer race (axis z), shoulder at the top."""
    bore, od, wd = (v * MM for v in G.bearing)
    z0, z1 = z_bottom_m * MM, z_top_m * MM
    ring = cyl(r_out, z0, z1 + 1.5).cut(cyl(od / 2 + 0.05, z0 - 1, z1)).cut(cyl(od / 2 - 2.5, z1 - 1, z1 + 3))
    return ring


def _hub(G: ArmGeometry, sb, bearing: bool):
    """Child hub bolted to a roll servo's horn (horn face at z = 0, child below)."""
    if bearing:
        bore, od, wd = (v * MM for v in G.bearing)
        z0, z1 = G.bearing_z[0] * MM, G.bearing_z[1] * MM
        hub = cyl(bore / 2 - 0.05, z0, z1).cut(cyl(11.0, 0.0, z1 + 1))  # cup around the horn
        hub = hub.union(cyl(bore / 2 + 2.5, z0 - 2.0, z0))  # flange under the inner race
        plate_bottom = z0 - 2.0
    else:
        hub = cyl(13.0, -5.0, 0.0)
        plate_bottom = -5.0
    hub = hub.cut(horn_holes(sb, plate_bottom - 1, 0.5))
    # counterbores for the M3 heads from below
    r = sb.horn_bolt_circle * MM / 2
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        hub = hub.cut(cyl(3.0, plate_bottom - 1, plate_bottom + 2.0, r * math.cos(ang), r * math.sin(ang)))
    return hub, plate_bottom


def _tube(z_top, z_bottom, r_out, wall=2.4):
    t = cyl(r_out, z_bottom, z_top).cut(cyl(r_out - wall, z_bottom - 1, z_top + 1))
    return t


# --------------------------------------------------------------------------------------
# Gears
# --------------------------------------------------------------------------------------

def gear42(robot: Robot):
    g = robot.arm.shoulder_gear
    G = ArmGeometry(robot)
    w = g.face_width * MM
    part = spur_gear(g.module * MM, g.gear_teeth, w, shift=-0.3, bore=8.3)
    # lightening holes and 4 x M3 mounting holes on r = 14
    for k in range(6):
        ang = k * math.pi / 3
        part = part.cut(cyl(6.5, -1, w + 1, 27 * math.cos(ang), 27 * math.sin(ang)))
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(1.65, -1, w + 1, 14 * math.cos(ang), 14 * math.sin(ang)))
    del G
    return part


def pinion(robot: Robot):
    g = robot.arm.shoulder_gear
    sb = robot.servo_body
    w = g.face_width * MM
    part = spur_gear(g.module * MM, g.pinion_teeth, w, shift=0.3)
    part = part.cut(horn_holes(sb, -1, w + 1, centre_clear=8.0))
    r = sb.horn_bolt_circle * MM / 2
    for k in range(4):  # counterbores for M3 x 16 heads on the outer face
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(3.0, w - 3.0, w + 1, r * math.cos(ang), r * math.sin(ang)))
    return part


# --------------------------------------------------------------------------------------
# Shoulder
# --------------------------------------------------------------------------------------

def shoulder_block(robot: Robot):
    """J1 child: carries the J1 gear on its inboard face, the J2 servo and the J2 bearings."""
    sb = robot.servo_body
    G = ArmGeometry(robot)
    o = O
    gy_out = o * G.j1_gear_y[1] * MM  # gear mounting face (outboard face of the gear)
    p2 = G.p2 * np.array([1, o, 1]) * MM
    # mounting plate for the J1 gear
    plate = cyl_axis(22.0, gy_out, gy_out + o * 6.0, "y")
    plate = plate.cut(cyl_axis(4.15, gy_out - 1 * o, gy_out + o * 7.0, "y"))
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        plate = plate.cut(cyl_axis(1.4, gy_out - o, gy_out + o * 7.0, "y", (14 * math.cos(ang), 0, 14 * math.sin(ang))))
    # M8 nut trap on the outboard side of the plate
    nut = cq.Workplane("XZ").polygon(6, 15.0).extrude(-(7.0)).translate((0, gy_out + o * 2.0, 0))
    plate = plate.cut(nut if o < 0 else transform(nut, np.diag([1, -1, 1])))
    # J2 servo, output pointing back (-x), case running up
    s2 = np.array([G.j2_horn_x + sb.horn_top, p2[1] / MM, G.j2_pinion[2]])
    R2 = servo_frame_matrix(-EX, EZ)
    cradle = _servo_cradle(robot, s2, R2, top_open=-3.0)
    # lobe with two 608 bearings for the J2 shaft (axis x through P2)
    lx0, lx1 = G.j2_gear_x[1] * MM + 4.0, G.j2_front_cheek_x[0] * MM - 1.0
    lobe = cyl_axis(G.lobe_r * MM, lx0, lx1, "x", p2)
    for x0, x1 in ((lx0 - 1, lx0 + 7.0), (lx1 - 7.0, lx1 + 1)):
        lobe = lobe.cut(cyl_axis(11.05, x0, x1, "x", p2))
    lobe = lobe.cut(cyl_axis(5.0, lx0 - 1, lx1 + 1, "x", p2))
    # body joining the plate, the cradle and the lobe
    yb0, yb1 = sorted((gy_out + o * 4.0, p2[1] + o * 15.0))
    body = box(lx0, 12.0, yb0, yb1, p2[2] + 6.0, 18.0)
    body = body.cut(place_servo_cutter(sb, s2, R2, horn_r=12.5))
    body = body.cut(cyl_axis(11.5, lx0 - 1, lx1 + 1, "x", p2))  # keep the bearing seats clear
    part = union_all([plate, cradle, lobe, body])
    part = part.cut(cyl_axis(4.15, lx0 - 1, lx1 + 1, "x", p2))
    # cable passage from the J2 servo down to the arm
    part = part.cut(box(-8, 2, p2[1] - 5, p2[1] + 5, p2[2] + 8, 10))
    return part


def upper_arm_top(robot: Robot):
    """J2 child: clevis around the shoulder lobe (J2 gear bolted to the back cheek) and the
    cradle + bearing housing of the J3 (upper-arm yaw) servo."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    bx0 = G.j2_gear_x[1] * MM  # back cheek starts at the gear's mounting face
    bx1 = bx0 + 3.5
    fx0, fx1 = (v * MM for v in G.j2_front_cheek_x)
    web0, web1 = -(G.lobe_r * MM + 1.5 + 4.0), -(G.lobe_r * MM + 1.5)
    back = cyl_axis(22.0, bx0, bx1, "x").union(box(bx0, bx1, -22, 22, web0, 0))
    front = cyl_axis(16.0, fx0, fx1, "x").union(box(fx0, fx1, -16, 16, web0, 0))
    web = box(bx0, fx1, -16, 16, web0, web1)
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        back = back.cut(cyl_axis(1.65, bx0 - 1, bx1 + 1, "x", (0, 14 * math.cos(ang), 14 * math.sin(ang))))
    clevis = union_all([back, front, web]).cut(cyl_axis(4.15, bx0 - 1, fx1 + 1, "x"))
    # J3 servo, output down, case running back
    s3 = np.array([0.0, 0.0, -a.roll_to_yaw + G.roll_case_top])
    R3 = servo_frame_matrix(-EZ, -EX)
    cradle = _servo_cradle(robot, s3, R3, top_open=1.5)
    hz = -a.roll_to_yaw * MM
    ring = _bearing_ring(G, -a.roll_to_yaw + G.bearing_z[0], -a.roll_to_yaw + G.bearing_z[1])
    skirt = box(-35.2 - 3, 12.7, -14.9, 14.9, hz + G.bearing_z[1] * MM, s3[2] * MM)
    skirt = skirt.cut(place_servo_cutter(sb, s3, R3, horn_r=20.0))
    part = union_all([clevis, cradle, ring, skirt])
    part = part.cut(cyl(G.bearing[1] * MM / 2 + 0.05, hz + G.bearing_z[0] * MM - 1, hz + G.bearing_z[1] * MM))
    part = part.cut(cyl(G.bearing[1] * MM / 2 - 2.5, hz - 20, hz + G.bearing_z[1] * MM + 1.4))
    return part


# --------------------------------------------------------------------------------------
# Links
# --------------------------------------------------------------------------------------

def _link(robot: Robot, length_m: float, bearing: bool):
    """Hub on a roll servo, tube, and the cradle of the next pitch servo (axis along y)."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = O
    hub, plate_bottom = _hub(G, sb, bearing)
    s = np.array([0.0, o * G.pitch_case_top, -length_m])
    R = servo_frame_matrix(o * EY, EZ)
    corner_clear = -(G.pitch_web[1] * MM) - 2.0
    cradle = _servo_cradle(robot, s, R, top_open=-3.0, side_stop=-5.0, bottom_round=corner_clear, pivot=True)
    case_top_z = (-length_m + sb.length - sb.axis_from_end) * MM + a.wall * MM + 0.3
    r = a.link_section * MM / 2
    tube = _tube(plate_bottom, case_top_z, r)
    # lid over the cradle joining the tube
    lid = box(-14.9, 14.9, o * (G.pitch_case_top * MM - 0.0) , o * (G.pitch_case_top + sb.bottom - 0.003) * MM,
              case_top_z - 3.0, case_top_z)
    lid = lid.intersect(cyl(r + 3, case_top_z - 4, case_top_z + 1)).cut(cyl(r - 2.4, case_top_z - 4, case_top_z + 1))
    part = union_all([hub, tube, cradle, lid])
    part = part.cut(place_servo_cutter(sb, s, R, horn_r=0.1))
    return part


def upper_arm(robot: Robot):
    return _link(robot, robot.arm.upper_arm, bearing=True)


def forearm(robot: Robot):
    return _link(robot, robot.arm.forearm, bearing=True)


def _clevis(robot: Robot, drop_m: float, bearing: bool):
    """Pitch-joint child: two cheeks around the parent servo (horn side bolted to the horn,
    rear side on the pivot screw), a web below, and the next roll servo's cradle."""
    sb = robot.servo_body
    G = ArmGeometry(robot)
    o = O
    ho0, ho1 = (v * MM * o for v in G.pitch_cheek_out)
    hi0, hi1 = (v * MM * o for v in G.pitch_cheek_in)
    web0, web1 = (v * MM for v in G.pitch_web)
    cheek_r = 13.0
    horn_cheek = cyl_axis(cheek_r, ho0, ho1, "y").union(box(-cheek_r, cheek_r, ho0, ho1, web0, 0))
    horn_cheek = horn_cheek.cut(transform(horn_holes(sb, -1, 6), servo_frame_matrix(o * EY, EZ), (0, ho0, 0)))
    rear_cheek = cyl_axis(9.0, hi0, hi1, "y").union(box(-9.0, 9.0, hi0, hi1, web0, 0))
    rear_cheek = rear_cheek.cut(cyl_axis(2.2, hi0 - 1 * o, hi1 + 1 * o, "y"))
    y0, y1 = sorted((ho1, hi1))
    web = box(-15.0, 15.0, y0, y1, web0, web1)
    s = np.array([0.0, 0.0, -drop_m + G.roll_case_top])
    R = servo_frame_matrix(-EZ, -EX)
    cradle = _servo_cradle(robot, s, R, top_open=1.5)
    hz = -drop_m * MM
    skirt = box(-35.2 - 3, 12.7, -14.9, 14.9, hz + (G.bearing_z[1] * MM if bearing else 1.0), s[2] * MM)
    skirt = skirt.cut(place_servo_cutter(sb, s, R, horn_r=20.0 if bearing else 11.5))
    parts = [horn_cheek, rear_cheek, web, cradle, skirt]
    if bearing:
        parts.append(_bearing_ring(G, -drop_m + G.bearing_z[0], -drop_m + G.bearing_z[1]))
    part = union_all(parts)
    if bearing:
        part = part.cut(cyl(G.bearing[1] * MM / 2 + 0.05, hz + G.bearing_z[0] * MM - 1, hz + G.bearing_z[1] * MM))
        part = part.cut(cyl(G.bearing[1] * MM / 2 - 2.5, hz - 20, hz + G.bearing_z[1] * MM + 1.4))
    # cable hole through the web
    part = part.cut(box(-5, 5, -5, 5, web0 - 1, web1 + 1))
    return part


def forearm_clevis(robot: Robot):
    return _clevis(robot, robot.arm.elbow_to_roll, bearing=True)


def wrist_clevis(robot: Robot):
    return _clevis(robot, robot.arm.wrist_to_roll, bearing=False)


# --------------------------------------------------------------------------------------
# Gripper
# --------------------------------------------------------------------------------------

def hand(robot: Robot):
    """Hub on the wrist-roll horn, cradle of the gripper servo (axis along y), fixed jaw."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = O
    hub, plate_bottom = _hub(G, sb, bearing=False)
    piv = G.piv
    s = piv + np.array([0.0, o * G.grip_case_top, 0.0])
    R = servo_frame_matrix(o * EY, EZ)
    cradle = _servo_cradle(robot, s, R, top_open=-2.5)
    # frame from the hub to the cradle
    ys = sorted((o * (G.grip_case_top + sb.bottom) * MM - 2.8, 0.0))
    frame = box(-22.0, 9.0, ys[0], ys[1] if ys[1] > ys[0] else 0.0, plate_bottom - 4.0, plate_bottom)
    jt = a.jaw_thickness * MM
    tip = (piv[2] - a.finger_length) * MM
    side_y = sorted((o * (G.grip_case_top + sb.bottom) * MM - 2.8 * o * -1, o * (jt / 2 + 0.5)))
    bridge_bottom = (piv[2] - 0.013) * MM - 10.0
    side = box(5.0, 5.0 + jt, side_y[0], side_y[1], bridge_bottom, plate_bottom)
    bar = box(0.5, 0.5 + jt, -jt / 2, jt / 2, tip, (piv[2] - 0.013) * MM)
    part = union_all([hub, cradle, frame, side, bar])
    part = part.cut(place_servo_cutter(sb, s, R, horn_r=12.5))
    # horn sweep of the moving jaw
    part = part.cut(cyl_axis(13.0, -jt / 2 - 0.6, jt / 2 + 0.6, "y", (piv[0] * MM, 0, piv[2] * MM)))
    return part


def jaw(robot: Robot):
    """Moving jaw on the gripper servo horn (jaw frame: origin on the pivot axis)."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = O
    jt = a.jaw_thickness * MM
    y0, y1 = sorted((o * G.grip_horn_y * MM, -o * G.grip_horn_y * MM))
    hub = cyl_axis(12.0, y0, y1, "y")
    hub = hub.cut(transform(horn_holes(sb, -1, jt + 2), servo_frame_matrix(o * EY, EZ), (0, o * G.grip_horn_y * MM, 0)))
    x0 = -jt / 2 - G.piv[0] * MM + 0.0
    finger = box(x0 - jt / 2 + 0.5 - 0.5, x0 + jt / 2 - 0.5, y0, y1, -a.finger_length * MM, -6.0)
    part = hub.union(finger)
    return part


ARM_PARTS = {
    "gear42": gear42,
    "pinion": pinion,
    "shoulder_block": shoulder_block,
    "upper_arm_top": upper_arm_top,
    "upper_arm": upper_arm,
    "forearm_clevis": forearm_clevis,
    "forearm": forearm,
    "wrist_clevis": wrist_clevis,
    "hand": hand,
    "jaw": jaw,
}
