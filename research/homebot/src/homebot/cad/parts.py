"""Printed parts, each built in the frame of the body it belongs to (see ``homebot.layout``).

Every function returns a CadQuery solid in millimetres for the *right* arm (o = -1); the
left arm uses mirror images (``build.py`` exports both). Interfaces come from
``ArmGeometry`` so the parts and the MuJoCo model move together when a parameter changes.

Hardware assumed per joint: M3 screws into the aluminium horn (4 per horn), M2 x 6 screws
into the servo case, 608ZZ bearings + M8 bolt on the geared shoulder joints, two 625ZZ
bearings + M5 bolt on the geared elbow, a 6806ZZ bearing on the upper-arm and forearm roll
joints, an M4 shoulder screw (or M4 bolt with a printed bushing) as the passive pivot of the
wrist-pitch clevis, and two 4 mm x 100 mm steel rods guiding the gripper jaws.
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
    if pivot:  # washer face for the clevis cheek: 0.4 mm proud of the plate (the cheek sits 0.5 mm off)
        walls = walls.union(cyl(5.0, zb - w - 0.4, zb))
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


def _horn_pinion(sb, module, teeth, width, cb_depth=3.0):
    """Pinion bolted to a servo horn (4 x M3 from the outer face, heads counterbored)."""
    part = spur_gear(module, teeth, width, shift=0.3)
    part = part.cut(horn_holes(sb, -1, width + 1, centre_clear=8.0))
    r = sb.horn_bolt_circle * MM / 2
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(3.0, width - cb_depth, width + 1, r * math.cos(ang), r * math.sin(ang)))
    return part


def elbow_gear(robot: Robot):
    """30T m1.5 elbow gear, bolted to the outboard cheek of the forearm clevis (M5 shaft)."""
    g = robot.arm.elbow_gear
    w = g.face_width * MM
    part = spur_gear(g.module * MM, g.gear_teeth, w, shift=-0.3, bore=5.3)
    for k in range(6):
        ang = math.pi / 6 + k * math.pi / 3
        part = part.cut(cyl(2.6, -1, w + 1, 16.5 * math.cos(ang), 16.5 * math.sin(ang)))
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        part = part.cut(cyl(1.65, -1, w + 1, 11.0 * math.cos(ang), 11.0 * math.sin(ang)))
    return part


def elbow_pinion(robot: Robot):
    g = robot.arm.elbow_gear
    return _horn_pinion(robot.servo_body, g.module * MM, g.pinion_teeth, g.face_width * MM)


def grip_pinion(robot: Robot):
    g = robot.arm.gripper
    return _horn_pinion(robot.servo_body, g.module * MM, g.pinion_teeth, g.face_width * MM, cb_depth=3.5)


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
    """J3 child: hub in the 6806 bearing, tube, the elbow servo a gear centre distance above the
    elbow (horn outward, pinion on the horn), and the elbow lobe with two 625 bearings for the
    M5 shaft, held from behind so the forearm clevis can fold forward around it."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = O
    hub, plate_bottom = _hub(G, sb, True)
    ez = -a.upper_arm + G.eC
    s = np.array([0.0, o * G.e_case_top, ez])
    R = servo_frame_matrix(o * EY, EZ)
    cradle = _servo_cradle(robot, s, R, top_open=-3.0)
    case_top_z = (ez + sb.length - sb.axis_from_end) * MM + a.wall * MM + 0.3
    r = a.link_section * MM / 2
    tube = _tube(plate_bottom, case_top_z, r)
    yc0, yc1 = sorted((o * G.e_case_top * MM, o * (G.e_case_top + sb.bottom - 0.003) * MM))
    lid = box(-14.9, 14.9, yc0, yc1, case_top_z - 3.0, case_top_z)
    lid = lid.intersect(cyl(r + 3, case_top_z - 4, case_top_z + 1)).cut(cyl(r - 2.4, case_top_z - 4, case_top_z + 1))
    # lobe and its support (behind the axis, up to the near end of the cradle, which it stops)
    lz = -a.upper_arm * MM
    ly0, ly1 = (v * MM for v in G.e_lobe_y)
    lr = G.e_lobe_r * MM
    lobe = cyl_axis(lr, ly0, ly1, "y", (0, 0, lz))
    near_end = (ez - sb.axis_from_end) * MM - 0.3
    support = box(-15.2, -1.5, ly0, ly1, lz, near_end)
    part = union_all([hub, tube, cradle, lid, lobe, support])
    part = part.cut(place_servo_cutter(sb, s, R, horn_r=12.5))
    bw, bo = G.e_bearing[2] * MM, G.e_bearing[1] * MM / 2 + 0.05
    part = part.cut(cyl_axis(bo, ly0 - 1, ly0 + bw, "y", (0, 0, lz))).cut(cyl_axis(bo, ly1 - bw, ly1 + 1, "y", (0, 0, lz)))
    part = part.cut(cyl_axis(3.5, ly0 - 1, ly1 + 1, "y", (0, 0, lz)))  # M5 shaft clearance between the bearings
    return part


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
    """J4 child: two cheeks around the elbow lobe on the M5 shaft (the outboard one carries the
    elbow gear), a web trimmed to a 21 mm radius so it folds past the upper arm, and the cradle
    and bearing housing of the forearm-roll servo."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = O
    ci0, ci1 = sorted(v * MM * o for v in G.e_cheek_in)
    co0, co1 = sorted(v * MM * o for v in G.e_cheek_out)
    web0, web1 = (v * MM for v in G.e_web)
    s = np.array([0.0, 0.0, -a.elbow_to_roll + G.roll_case_top])
    R = servo_frame_matrix(-EZ, -EX)
    cradle_top = (s[2] - sb.bottom + 0.0003 + a.wall) * MM  # top of the J5 cradle plate
    inner = cyl_axis(13.0, ci0, ci1, "y").union(box(-12.7, 12.7, ci0, ci1, cradle_top - 1, 0))
    outer = cyl_axis(17.0, co0, co1, "y").union(box(-12.7, 12.7, co0, co1, cradle_top - 1, 0))
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        outer = outer.cut(cyl_axis(1.25, co0 - 1, co1 + 1, "y", (11.0 * math.cos(ang), 0, 11.0 * math.sin(ang))))  # M3 thread-forming
    y0, y1 = min(ci0, co0), max(ci1, co1)
    web = box(-12.7, 12.7, y0, y1, cradle_top - 1, web1).intersect(cyl_axis(21.0, y0 - 1, y1 + 1, "y"))
    cradle = _servo_cradle(robot, s, R, top_open=1.5)
    hz = -a.elbow_to_roll * MM
    skirt = box(-35.2 - 3, 12.7, -14.9, 14.9, hz + G.bearing_z[1] * MM, s[2] * MM)
    skirt = skirt.cut(place_servo_cutter(sb, s, R, horn_r=20.0))
    ring = _bearing_ring(G, -a.elbow_to_roll + G.bearing_z[0], -a.elbow_to_roll + G.bearing_z[1])
    part = union_all([inner, outer, web, cradle, skirt, ring])
    part = part.cut(cyl(G.bearing[1] * MM / 2 + 0.05, hz + G.bearing_z[0] * MM - 1, hz + G.bearing_z[1] * MM))
    part = part.cut(cyl(G.bearing[1] * MM / 2 - 2.5, hz - 20, hz + G.bearing_z[1] * MM + 1.4))
    part = part.cut(cyl_axis(2.7, y0 - 1, y1 + 1, "y"))  # M5 shaft
    part = part.cut(cyl_axis(G.e_lobe_r * MM + 1.0, ci1 if o > 0 else ci0, co0 if o > 0 else co1, "y"))  # lobe clearance
    part = part.cut(box(-5, 5, -5, 5, cradle_top - 2, web1 + 1))  # cable hole
    del web0
    return part


def wrist_clevis(robot: Robot):
    return _clevis(robot, robot.arm.wrist_to_roll, bearing=False)


# --------------------------------------------------------------------------------------
# Gripper
# --------------------------------------------------------------------------------------

def hand(robot: Robot):
    """Hand of the parallel gripper (hand frame: origin at the wrist-roll horn face, z down the
    arm). Hub plate on the wrist-roll horn; a 7 mm neck open front and back so a hex key reaches
    the horn screws and the near servo screws; the cradle of the gripper servo (output down,
    case running back); two rails and two end walls holding the 4 mm guide rods (through holes
    on +x, blind on -x)."""
    sb, g = robot.servo_body, robot.arm.gripper
    G = ArmGeometry(robot)
    hz0 = G.g_hub[0] * MM
    hub = box(-14, 14, -10, 10, hz0, 0).union(cyl(12.0, hz0, 0)).cut(horn_holes(sb, hz0 - 1, 1))
    pz = G.g_plate[1] * MM
    neck = box(-14, -11, -10, 10, pz, hz0).union(box(11, 14, -10, 10, pz, hz0))
    s = np.array([0.0, 0.0, G.g_case_top])
    R = servo_frame_matrix(-EZ, -EX)
    cradle = _servo_cradle(robot, s, R, top_open=-2.0)
    wx0, wx1 = (v * MM for v in G.g_wall_x)
    bz0 = G.g_beam_z[0] * MM
    side_bottom = (G.g_case_top + 0.002) * MM  # where the cradle side walls stop
    rails = [box(-wx1, wx1, sy * 13.0, sy * 18.0, bz0, side_bottom + 0.5) for sy in (1, -1)]
    wz0 = (G.g_carriage_z[0] - 0.001) * MM
    walls = [box(sx * wx0, sx * wx1, -18, 18, wz0, side_bottom + 0.5) for sx in (1, -1)]
    part = union_all([hub, neck, cradle] + rails + walls)
    part = part.cut(place_servo_cutter(sb, s, R, horn_r=11.5))
    rz = G.g_rod_z * MM
    rr = g.rod_diameter * MM / 2 + 0.05  # press fit in the walls
    for yy in (-g.rod_spacing * MM / 2, g.rod_spacing * MM / 2):
        part = part.cut(cyl_axis(rr, wx0 - 1, wx1 + 1, "x", (0, yy, rz)))  # through, +x wall
        part = part.cut(cyl_axis(rr, -wx0 + 1, -(g.rod_length * MM / 2 + 0.3), "x", (0, yy, rz)))  # blind, -x wall
    return part


def _rack_profile(G: ArmGeometry, g, x0, x1, backlash=0.15):
    """Outline (x, y in mm) of the rack of the +x jaw: teeth pointing +y toward the pinion, a
    tooth centred on x = 0 (the pinion has a gap at -90 deg)."""
    m = g.module * MM
    p = math.pi * m
    tan = math.tan(math.radians(20))
    half_pitch_t = (p / 2 - backlash) / 2
    yp, yt, yr = -G.g_rack_pitch * MM, -G.g_rack_tip * MM, -G.g_rack_root * MM
    h_root = half_pitch_t + (yp - yr) * tan
    h_tip = half_pitch_t - (yt - yp) * tan
    pts = [(x0, -G.g_rack_back * MM), (x1, -G.g_rack_back * MM), (x1, yr)]
    k = math.floor((x1 - h_root) / p)
    while k * p - h_root > x0:
        c = k * p
        pts += [(c + h_root, yr), (c + h_tip, yt), (c - h_tip, yt), (c - h_root, yr)]
        k -= 1
    pts.append((x0, yr))
    return pts


def jaw(robot: Robot):
    """One jaw: carriage on the two rods, rack under the pinion's -y side, finger with pegs for
    the TPU pad. The second jaw is the same part turned 180 deg about the pinion axis."""
    g = robot.arm.gripper
    G = ArmGeometry(robot)
    pt, pw, ph = (v * MM for v in g.pad)
    cx, cy, cz = (v * MM for v in g.carriage)
    c0, c1 = (v * MM for v in G.g_carriage_z)
    rz0, rz1 = (v * MM for v in G.g_rack_z)
    tip = G.g_tip_z * MM
    carriage = box(pt, pt + cx, -cy / 2, cy / 2, c0, c1)
    rx0, rx1 = (v * MM for v in G.g_rack_x)
    prof = _rack_profile(G, g, rx0, rx1)
    rack = cq.Workplane("XY").polyline(prof).close().extrude(rz1 - rz0).translate((0, 0, rz0))
    riser = box(pt, pt + cx, -G.g_rack_back * MM, -cy / 2 + 1.0, c1 - 1.0, rz0 + 1.0)
    ft = g.finger_thickness * MM
    finger = box(pt, pt + ft, -pw / 2, pw / 2, tip, c0 + 0.5)
    part = union_all([carriage, rack, riser, finger])
    rr = g.rod_diameter * MM / 2 + 0.2  # sliding fit (ream or run in with the rod)
    for yy in (-g.rod_spacing * MM / 2, g.rod_spacing * MM / 2):
        part = part.cut(cyl_axis(rr, pt - 1, pt + cx + 1, "x", (0, yy, G.g_rod_z * MM)))
    for zz in (tip + ph / 3, tip + 2 * ph / 3):  # pad pegs
        part = part.cut(cyl_axis(1.65, pt - 1, pt + 3.5, "x", (0, 0, zz)))
    return part


def pad(robot: Robot):
    """TPU (95A) pad on the inner face of a jaw, with two pegs into the finger."""
    g = robot.arm.gripper
    G = ArmGeometry(robot)
    pt, pw, ph = (v * MM for v in g.pad)
    tip = G.g_tip_z * MM
    part = box(0, pt, -pw / 2, pw / 2, tip, tip + ph)
    for zz in (tip + ph / 3, tip + 2 * ph / 3):
        part = part.union(cyl_axis(1.5, pt - 0.5, pt + 3.0, "x", (0, 0, zz)))
    # shallow grooves across the face (grip on wet or dusty objects)
    for k in range(1, 6):
        z = tip + k * ph / 6
        part = part.cut(box(-0.1, 0.5, -pw / 2 - 1, pw / 2 + 1, z - 0.4, z + 0.4))
    return part


ARM_PARTS = {
    "gear42": gear42,
    "pinion": pinion,
    "elbow_gear": elbow_gear,
    "elbow_pinion": elbow_pinion,
    "grip_pinion": grip_pinion,
    "shoulder_block": shoulder_block,
    "upper_arm_top": upper_arm_top,
    "upper_arm": upper_arm,
    "forearm_clevis": forearm_clevis,
    "forearm": forearm,
    "wrist_clevis": wrist_clevis,
    "hand": hand,
    "jaw": jaw,
    "pad": pad,
}
