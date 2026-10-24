"""Kinematic layout of the robot built from ``homebot.params``.

``build_tree(robot, variant)`` returns the body tree used by the MJCF writer and the CAD
assembly. Variants:

* ``"arm"``      one right arm on its shoulder carriage, clamped to a post at a table edge
                 (the first thing to build: 8 servos);
* ``"torso"``    both arms and the head on the carriage, on a fixed post at a table edge;
* ``"mobile"``   the full robot: kiwi omni base, mast, lift, head, two arms.

All numbers come from ``Robot``; the interfaces used here (servo frames, axis points,
bearing seats) are the same ones ``homebot.cad.parts`` cuts into the printed parts.
"""
from __future__ import annotations

import math

import numpy as np

from .params import ARM_JOINTS, ARM_RANGES, Robot
from .tree import Body, Joint, Mass, Placement, Shape

PLA = (0.93, 0.55, 0.18, 1.0)
PLA_DARK = (0.25, 0.27, 0.30, 1.0)
SERVO = (0.08, 0.08, 0.09, 1.0)
ALU = (0.70, 0.72, 0.75, 1.0)
RUBBER = (0.12, 0.12, 0.12, 1.0)

EX, EY, EZ = np.eye(3)


def servo_frame(z_out, x_len) -> np.ndarray:
    """Rotation of a servo frame (z = output axis, x = along the case away from the output)."""
    z = np.asarray(z_out, float)
    x = np.asarray(x_len, float)
    y = np.cross(z, x)
    return np.column_stack([x, y, z])


def servo_mass(robot: Robot, name: str, origin, R) -> Mass:
    """Servo case as a uniform box. ``origin`` = output axis at the case top face."""
    sb = robot.servo_body
    centre = np.asarray(origin) + R @ np.array([sb.length / 2 - sb.axis_from_end, 0.0, -sb.height / 2])
    return Mass(name, robot.servo.mass, tuple(centre), (sb.length, sb.width, sb.height), R)


def servo_shape(robot: Robot, origin, R, name=None) -> Shape:
    from .tree import mat2quat

    sb = robot.servo_body
    centre = np.asarray(origin) + R @ np.array([sb.length / 2 - sb.axis_from_end, 0.0, -sb.height / 2])
    return Shape("box", (sb.length / 2, sb.width / 2, sb.height / 2), tuple(centre), mat2quat(R),
                 rgba=SERVO, name=name)


# --------------------------------------------------------------------------------------
# Arm geometry: derived interface points shared with the CAD (all in the parent body frame
# at the zero pose; o = +1 for the left arm, -1 for the right arm, i.e. "outward" along y).
# --------------------------------------------------------------------------------------


class ArmGeometry:
    """Interface points derived from the parameters, shared by the layout and the CAD.

    Conventions: ``o`` = +1 for the left arm and -1 for the right arm (outward along y);
    y values below are for ``o = +1`` and get multiplied by ``o``. Frames are the body
    frames of ``build_tree`` (origin on the joint axis, axis-aligned at the zero pose).
    """

    def __init__(self, robot: Robot):
        sb, a, g = robot.servo_body, robot.arm, robot.arm.shoulder_gear
        self.robot = robot
        self.C = g.centre_distance
        self.gear_R = g.outer_radius(g.gear_teeth)
        self.pinion_R = g.outer_radius(g.pinion_teeth)
        self.gw = g.face_width
        self.clr = 0.0003
        # --- J1 (shoulder pitch), shoulder frame: origin on the J1 axis at the shoulder point.
        self.j1_gear_y = (-0.033, -0.033 + self.gw)  # gear face span along y (x o)
        ang = math.radians(60)  # pinion above-behind the gear, clear of the J2 gear's sweep
        self.j1_pinion_xz = (-self.C * math.cos(ang), self.C * math.sin(ang))
        self.j1_horn_y = self.j1_gear_y[0]  # pinion bolted to the horn on its inboard face
        self.carriage_face_y = self.j1_gear_y[0] - 0.0015  # carriage outer wall (x o)
        # --- J2 (shoulder roll): axis along x through P2; gear behind the shoulder block.
        self.p2 = np.array([0.0, a.roll_outboard, -a.pitch_to_roll])
        back = -(self.gear_R + 0.005)  # clear of the J1 gear disc (radius gear_R about x=0)
        self.j2_gear_x = (back - self.gw, back)
        self.j2_pinion = self.p2 + np.array([0.0, 0.0, self.C])  # straight above P2
        self.j2_horn_x = self.j2_gear_x[1]  # pinion bolted to the horn on its front face
        self.lobe_r = 0.011 + 0.004  # 608 bearing OD/2 + wall
        self.j2_front_cheek_x = (0.029, 0.029 + a.cheek)
        # --- Roll modules (J3, J5, J7): output down, horn face = child origin.
        #     Case top (z_s = 0) is horn_top above the horn face; idler boss at stack above it.
        self.roll_case_top = sb.horn_top
        self.roll_case_bottom = sb.stack  # highest point of the case above the horn face
        self.bearing = (0.030, 0.042, 0.007)  # 6806: bore, OD, width
        self.bearing_z = (-0.0053, -0.0053 + 0.007)  # below the raised cover
        # --- Pitch modules (J4, J6, gripper): axis along y, horn outward.
        stack_out = sb.horn_top + a.cheek  # horn face + cheek
        stack_in = -sb.bottom + self.clr + a.wall + 0.0005 + a.cheek  # boss, plate, washer, cheek
        self.pitch_case_top = (stack_in - stack_out) / 2  # y of the case top face (x o)
        self.pitch_cheek_out = (self.pitch_case_top + sb.horn_top, self.pitch_case_top + sb.horn_top + a.cheek)
        self.pitch_cheek_in = (self.pitch_case_top + sb.bottom - self.clr - a.wall - 0.0005 - a.cheek,
                               self.pitch_case_top + sb.bottom - self.clr - a.wall - 0.0005)
        corner = math.hypot(sb.axis_from_end, sb.width / 2)
        self.pitch_web = (-(corner + 0.0014 + 0.0035), -(corner + 0.0014))  # z span of the child web
        # --- J4 (elbow), geared 2:1: the forearm clevis turns on an M5 shaft in two 625
        #     bearings in a lobe at the bottom of the upper arm. Its outboard cheek carries the
        #     gear; the servo sits a centre distance up the upper arm, pinion on its horn.
        eg = a.elbow_gear
        self.eC = eg.centre_distance
        self.e_gear_R = eg.outer_radius(eg.gear_teeth)
        self.e_pinion_R = eg.outer_radius(eg.pinion_teeth)
        self.e_gw = eg.face_width
        self.e_bearing = (0.005, 0.016, 0.005)  # 625: bore, OD, width
        self.e_lobe_r = self.e_bearing[1] / 2 + 0.0035
        self.e_lobe_y = (-0.013, 0.013)
        gap = 0.0005
        self.e_cheek_in = (self.e_lobe_y[0] - gap - a.cheek, self.e_lobe_y[0] - gap)  # (x o)
        self.e_cheek_out = (self.e_lobe_y[1] + gap, self.e_lobe_y[1] + gap + a.cheek)
        self.e_horn_y = self.e_cheek_out[1]  # gear and pinion run from here outward
        self.e_case_top = self.e_horn_y - sb.horn_top
        self.e_web = (-(self.e_lobe_r + 0.0015 + 0.0035), -(self.e_lobe_r + 0.0015))  # clevis web z span
        # --- Gripper (hand frame: origin at the wrist-roll horn face, z down the arm)
        g = a.gripper
        self.g_hub = (-g.hub_plate, 0.0)
        self.g_plate = (-(g.hub_plate + g.neck + a.wall), -(g.hub_plate + g.neck))  # cradle top plate
        self.g_horn_z = -g.stack(sb, a.wall)  # gripper horn face = top of the pinion and racks
        self.g_case_top = self.g_horn_z + sb.horn_top
        self.g_rack_z = (self.g_horn_z - g.face_width, self.g_horn_z)
        self.g_carriage_z = (self.g_rack_z[0] - 0.001 - g.carriage[2], self.g_rack_z[0] - 0.001)
        self.g_rod_z = sum(self.g_carriage_z) / 2
        self.g_tip_z = -g.tip(sb, a.wall)
        self.g_tcp_z = self.g_tip_z + g.tcp_above_tip
        m, r = g.module, g.pitch_radius
        # rack of the +x jaw on the -y side of the pinion (pinion profile shift +0.3)
        self.g_rack_pitch = r + 0.3 * m
        self.g_rack_tip = self.g_rack_pitch - m
        self.g_rack_root = self.g_rack_pitch + 1.25 * m
        self.g_rack_back = self.g_rack_root + 0.0045
        self.g_rack_x = (-(g.stroke + 0.008), g.pad[0] + g.carriage[0])  # jaw frame, jaws closed
        self.g_wall_x = (g.stroke + g.pad[0] + g.carriage[0] + 0.001, g.stroke + g.pad[0] + g.carriage[0] + 0.005)
        self.g_beam_z = (self.g_horn_z + 0.0005, self.g_horn_z + 0.0045)

    def check(self) -> list[str]:
        """Packaging constraints the parameters must satisfy (empty list = ok)."""
        a, sb = self.robot.arm, self.robot.servo_body
        errs = []
        # J3 case must sit below the clevis web, which must clear the J2 lobe
        if a.roll_to_yaw < self.lobe_r + 0.0035 + 0.001 + self.roll_case_bottom:
            errs.append("roll_to_yaw too short for the J3 servo below the J2 lobe")
        need = -self.pitch_web[0] + 0.001 + self.roll_case_bottom
        if a.elbow_to_roll < need:
            errs.append(f"elbow_to_roll < {need:.4f}")
        if a.wrist_to_roll < need:
            errs.append(f"wrist_to_roll < {need:.4f}")
        # pitch-module case must fit inside the link above the axis (tube starts above it)
        tube = a.upper_arm - (sb.length - sb.axis_from_end) - 0.003 - 0.006
        if tube < 0.02:
            errs.append("upper_arm too short for a tube between the J3 hub and the elbow cradle")
        if a.forearm - (sb.length - sb.axis_from_end) - 0.003 - 0.006 < 0.02:
            errs.append("forearm too short")
        # geared elbow: tube above the elbow servo, cradle clear of the clevis cheeks
        if a.upper_arm - self.eC - (sb.length - sb.axis_from_end) - 0.003 - 0.006 < 0.02:
            errs.append("upper_arm too short for the elbow servo a centre distance above the elbow")
        if self.eC - sb.axis_from_end - a.wall - 0.0003 < 0.017 + 0.001:
            errs.append("elbow servo cradle hits the gear-carrying clevis cheek (r 17 mm)")
        if a.elbow_to_roll < -self.e_web[0] + 0.001 + self.roll_case_bottom:
            errs.append("elbow_to_roll too short for the J5 servo below the elbow clevis web")
        # gripper: pinion clears the horn screws, rods fit, stroke within one servo turn
        g = a.gripper
        if g.pitch_radius - 1.25 * g.module * (1 - 0.3 / 1.25) < sb.horn_bolt_circle / 2 + 0.00165 + 0.0003:
            errs.append("gripper pinion root too close to the horn screws")
        if 2 * self.g_wall_x[0] > g.rod_length or g.rod_length > 2 * self.g_wall_x[1]:
            errs.append("gripper rods do not end inside the end walls")
        if g.stroke / g.pitch_radius > 2 * math.pi * 0.95:
            errs.append("gripper stroke needs more than one servo turn")
        # J2 gear must stay outboard of the carriage face
        if a.roll_outboard - self.gear_R < self.carriage_face_y + 0.001:
            errs.append("J2 gear would hit the carriage")
        return errs


def _arm(robot: Robot, side: str, parent: Body, shoulder: np.ndarray, ids: dict) -> None:
    """Attach one arm to ``parent`` with the shoulder point ``shoulder`` (parent frame)."""
    r, a, sb = robot, robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    o = 1.0 if side == "l" else -1.0
    p = side + "_"
    Y = np.array([1.0, o, 1.0])  # multiply y by o

    def jaxis(right_axis):
        """Mirror rule: left axis = -M * right axis, M = diag(1,-1,1)."""
        v = np.asarray(right_axis, float)
        return tuple(v) if side == "r" else tuple(-np.array([v[0], -v[1], v[2]]))

    def J(name, right_axis):
        lo, hi = ARM_RANGES[name]
        return Joint(p + name, "hinge", jaxis(right_axis), (lo, hi), r.arm_drive(name), ids.get(p + name))

    mirror = side == "l"
    tube = a.link_section / 2

    # ---- J1 servo + pinion live in the parent (carriage) ------------------------------------
    px, pz = G.j1_pinion_xz
    s1 = shoulder + np.array([px, o * (G.j1_horn_y - sb.horn_top), pz])
    R1 = servo_frame(o * EY, EZ)
    parent.masses.append(servo_mass(r, p + "servo_shoulder_pitch", s1, R1))
    parent.shapes.append(servo_shape(r, s1, R1, p + "servo_j1"))
    parent.parts.append(Placement("pinion", tuple(shoulder + np.array([px, o * G.j1_horn_y, pz])),
                                  _rot_y_to(o * EY), mirror))

    # ---- shoulder block (J1 child) ------------------------------------------------------------
    sh = parent.add(Body(p + "shoulder", tuple(shoulder)))
    sh.joints.append(J("shoulder_pitch", (0, -1, 0)))
    sh.parts.append(Placement("shoulder_block", (0, 0, 0), np.eye(3), mirror))
    sh.parts.append(Placement("gear42", (0, o * G.j1_gear_y[0], 0), _rot_y_to(o * EY), mirror))
    gy = o * (G.j1_gear_y[0] + G.j1_gear_y[1]) / 2
    sh.shapes.append(Shape("cylinder", (G.gear_R, G.gw / 2), (0, gy, 0), _quat_axis(EY), rgba=PLA, name=p + "j1_gear"))
    p2 = G.p2 * Y
    sh.shapes.append(Shape("box", (0.036, 0.016, 0.022), (-0.010, p2[1], -0.022), rgba=PLA, name=p + "shoulder_body"))
    sh.shapes.append(Shape("cylinder", (G.lobe_r, 0.036), (-0.010, p2[1], p2[2]), _quat_axis(EX), rgba=PLA, name=p + "shoulder_lobe"))
    s2 = np.array([G.j2_horn_x + sb.horn_top, p2[1], G.j2_pinion[2]])
    R2 = servo_frame(-EX, EZ)
    sh.masses.append(servo_mass(r, p + "servo_shoulder_roll", s2, R2))
    sh.shapes.append(servo_shape(r, s2, R2, p + "servo_j2"))
    sh.masses.append(Mass(p + "j1_shaft", 0.030, (0, o * -0.03, 0)))
    sh.masses.append(Mass(p + "j2_bearings_shaft", 2 * r.bought.bearing_608 + 0.030, tuple(p2)))
    sh.parts.append(Placement("pinion", (G.j2_horn_x, p2[1], G.j2_pinion[2]), _rot_y_to(-EX), mirror))

    # ---- upper-arm top (J2 child): clevis with the J2 gear, cradle of the J3 servo -------------
    ut = sh.add(Body(p + "upper_arm_top", tuple(p2)))
    ut.joints.append(J("shoulder_roll", (-1, 0, 0)))
    ut.parts.append(Placement("upper_arm_top", (0, 0, 0), np.eye(3), mirror))
    ut.parts.append(Placement("gear42", (G.j2_gear_x[0], 0, 0), _rot_y_to(EX), mirror))
    gx = (G.j2_gear_x[0] + G.j2_gear_x[1]) / 2
    ut.shapes.append(Shape("cylinder", (G.gear_R, G.gw / 2), (gx, 0, 0), _quat_axis(EX), rgba=PLA, name=p + "j2_gear"))
    s3 = np.array([0.0, 0.0, -a.roll_to_yaw + G.roll_case_top])
    R3 = servo_frame(-EZ, -EX)  # output down, case running backward
    ut.masses.append(servo_mass(r, p + "servo_upper_arm_yaw", s3, R3))
    ut.shapes.append(servo_shape(r, s3, R3, p + "servo_j3"))
    ut.masses.append(Mass(p + "j3_bearing", r.bought.bearing_6806, (0, 0, -a.roll_to_yaw)))

    # ---- upper arm (J3 child): hub in the bearing, tube, elbow servo + pinion, elbow lobe -----
    ua = ut.add(Body(p + "upper_arm", (0, 0, -a.roll_to_yaw)))
    ua.joints.append(J("upper_arm_yaw", (0, 0, 1)))
    ua.parts.append(Placement("upper_arm", (0, 0, 0), np.eye(3), mirror))
    ez = -a.upper_arm + G.eC  # elbow servo axis, a gear centre distance above the elbow
    top_of_elbow_case = ez + (sb.length - sb.axis_from_end)
    ua.shapes.append(Shape("capsule", (tube,), fromto=(0, 0, -0.010, 0, 0, top_of_elbow_case), rgba=PLA, name=p + "upper_arm_tube"))
    s4 = np.array([0.0, o * G.e_case_top, ez])
    R4 = servo_frame(o * EY, EZ)  # output outward, case running up the arm
    ua.masses.append(servo_mass(r, p + "servo_elbow", s4, R4))
    ua.shapes.append(servo_shape(r, s4, R4, p + "servo_j4"))
    ua.parts.append(Placement("elbow_pinion", (0, o * G.e_horn_y, ez), _rot_y_to(o * EY), mirror))
    ly = (G.e_lobe_y[1] - G.e_lobe_y[0]) / 2
    ua.shapes.append(Shape("cylinder", (G.e_lobe_r, ly), (0, 0, -a.upper_arm), _quat_axis(EY), rgba=PLA, name=p + "elbow_lobe"))
    ua.masses.append(Mass(p + "j4_bearings_shaft", 2 * r.bought.bearing_625 + 0.008, (0, 0, -a.upper_arm)))

    # ---- forearm (J4 child): clevis around the lobe, gear on its outboard cheek, J5 cradle ------
    fa = ua.add(Body(p + "forearm", (0, 0, -a.upper_arm)))
    fa.joints.append(J("elbow", (0, -1, 0)))
    fa.parts.append(Placement("forearm_clevis", (0, 0, 0), np.eye(3), mirror))
    fa.parts.append(Placement("elbow_gear", (0, o * G.e_horn_y, 0), _rot_y_to(o * EY), mirror))
    gy = o * (G.e_horn_y + G.e_gw / 2)
    fa.shapes.append(Shape("cylinder", (G.e_gear_R, G.e_gw / 2), (0, gy, 0), _quat_axis(EY), rgba=PLA, name=p + "elbow_gear"))
    s5 = np.array([0.0, 0.0, -a.elbow_to_roll + G.roll_case_top])
    R5 = servo_frame(-EZ, -EX)
    fa.masses.append(servo_mass(r, p + "servo_forearm_roll", s5, R5))
    fa.shapes.append(servo_shape(r, s5, R5, p + "servo_j5"))
    fa.masses.append(Mass(p + "j5_bearing", r.bought.bearing_6806, (0, 0, -a.elbow_to_roll)))

    # ---- forearm (J5 child): hub, tube, wrist-pitch cradle -------------------------------------
    fl = fa.add(Body(p + "forearm_lower", (0, 0, -a.elbow_to_roll)))
    fl.joints.append(J("forearm_roll", (0, 0, 1)))
    fl.parts.append(Placement("forearm", (0, 0, 0), np.eye(3), mirror))
    top_of_wrist_case = -a.forearm + (sb.length - sb.axis_from_end)
    fl.shapes.append(Shape("capsule", (tube,), fromto=(0, 0, -0.010, 0, 0, top_of_wrist_case), rgba=PLA, name=p + "forearm_tube"))
    s6 = np.array([0.0, o * G.pitch_case_top, -a.forearm])
    R6 = servo_frame(o * EY, EZ)
    fl.masses.append(servo_mass(r, p + "servo_wrist_pitch", s6, R6))
    fl.shapes.append(servo_shape(r, s6, R6, p + "servo_j6"))

    # ---- wrist (J6 child): clevis, cradle of the wrist-roll servo -----------------------------
    wr = fl.add(Body(p + "wrist", (0, 0, -a.forearm)))
    wr.joints.append(J("wrist_pitch", (0, -1, 0)))
    wr.parts.append(Placement("wrist_clevis", (0, 0, 0), np.eye(3), mirror))
    s7 = np.array([0.0, 0.0, -a.wrist_to_roll + G.roll_case_top])
    R7 = servo_frame(-EZ, -EX)
    wr.masses.append(servo_mass(r, p + "servo_wrist_roll", s7, R7))
    wr.shapes.append(servo_shape(r, s7, R7, p + "servo_j7"))

    # ---- hand (J7 child): hub, gripper servo (output down), guide rods; two jaws on the rods ----
    g = a.gripper
    hd = wr.add(Body(p + "hand", (0, 0, -a.wrist_to_roll)))
    hd.joints.append(J("wrist_roll", (0, 0, 1)))
    hd.parts.append(Placement("hand", (0, 0, 0), np.eye(3), False))  # left-right symmetric
    s8 = np.array([0.0, 0.0, G.g_case_top])
    R8 = servo_frame(-EZ, -EX)  # output down, case running back
    hd.masses.append(servo_mass(r, p + "servo_gripper", s8, R8))
    hd.shapes.append(servo_shape(r, s8, R8, p + "servo_j8"))
    hd.parts.append(Placement("grip_pinion", (0, 0, G.g_horn_z), _rot_y_to(-EZ), False))
    hd.shapes.append(Shape("cylinder", (0.012, g.hub_plate / 2), (0, 0, -g.hub_plate / 2), rgba=PLA, name=p + "hand_hub"))
    wx0, wx1 = G.g_wall_x
    bz0, bz1 = G.g_beam_z
    wz0 = G.g_carriage_z[0] - 0.001
    for sx in (1.0, -1.0):  # end walls holding the rods, and the beams joining them to the cradle
        hd.shapes.append(Shape("box", ((wx1 - wx0) / 2, 0.014, (bz1 - wz0) / 2), (sx * (wx0 + wx1) / 2, 0, (bz1 + wz0) / 2),
                               rgba=PLA, name=p + f"hand_wall{'p' if sx > 0 else 'n'}"))
    hd.shapes.append(Shape("box", (wx1, 0.018, (bz1 - bz0) / 2), (0, 0, (bz0 + bz1) / 2), rgba=PLA, name=p + "hand_beam"))
    rr = g.rod_diameter / 2
    for k, yy in enumerate((-g.rod_spacing / 2, g.rod_spacing / 2)):
        hd.shapes.append(Shape("capsule", (rr,), fromto=(-g.rod_length / 2 + rr, yy, G.g_rod_z, g.rod_length / 2 - rr, yy, G.g_rod_z),
                               rgba=ALU, name=p + f"guide_rod{k}"))
    hd.masses.append(Mass(p + "guide_rods", 2 * r.bought.steel_rod_4mm * g.rod_length, (0, 0, G.g_rod_z),
                          (g.rod_length, g.rod_spacing, g.rod_diameter)))
    hd.sites.append((p + "tcp", (0.0, 0.0, G.g_tcp_z)))
    hd.cameras.append({"name": p + "wrist_cam", "pos": (0.032, 0.0, G.g_beam_z[1] + 0.006), "xyaxes": "0 -1 0 0.6 0 -0.8",
                       "fovy": "70"})

    # ---- jaws: the same printed part twice, the second turned 180 deg about the pinion axis ----
    cx, cy, cz = g.carriage
    pt, pw, ph = g.pad
    c0, c1 = G.g_carriage_z
    tip = G.g_tip_z
    drive = r.arm_drive("gripper")
    lo, hi = ARM_RANGES["gripper"]
    for name, sgn in (("jaw", 1.0), ("jaw2", -1.0)):
        jw = hd.add(Body(p + name, (0.0, 0.0, 0.0)))
        if sgn > 0:  # driven jaw (+x): the servo's joint, half the servo's passive dynamics
            jw.joints.append(Joint(p + "gripper", "slide", (1.0, 0.0, 0.0), (lo, hi), drive, ids.get(p + "gripper"),
                                   share=0.5))
        else:  # geared to the first through the pinion: q = q_gripper
            jw.joints.append(Joint(p + "gripper_follow", "slide", (-1.0, 0.0, 0.0), (lo, hi), drive, None,
                                   follow=p + "gripper", share=0.5))
        Rz = np.diag([sgn, sgn, 1.0])
        jw.parts.append(Placement("jaw", (0, 0, 0), Rz, False))
        jw.parts.append(Placement("pad", (0, 0, 0), Rz, False))

        def at(x, y, z):
            return (sgn * x, sgn * y, z)

        jw.shapes.append(Shape("box", (cx / 2, cy / 2, cz / 2), at(pt + cx / 2, 0, (c0 + c1) / 2), rgba=PLA_DARK,
                               name=p + name + "_carriage"))
        rx0, rx1 = G.g_rack_x
        rz0, rz1 = G.g_rack_z
        jw.shapes.append(Shape("box", ((rx1 - rx0) / 2, (G.g_rack_back - G.g_rack_tip) / 2, (rz1 - rz0) / 2),
                               at((rx0 + rx1) / 2, -(G.g_rack_back + G.g_rack_tip) / 2, (rz0 + rz1) / 2),
                               rgba=PLA_DARK, name=p + name + "_rack", collide=True))
        ft = g.finger_thickness
        jw.shapes.append(Shape("box", (ft / 2, pw / 2, (c0 - tip) / 2), at(pt + ft / 2, 0, (c0 + tip) / 2), rgba=PLA_DARK,
                               name=p + name + "_finger"))
        jw.shapes.append(Shape("box", (pt / 2, pw / 2, ph / 2), at(pt / 2, 0, tip + ph / 2), rgba=RUBBER,
                               name=p + name + "_pad", friction=(g.pad_friction, 0.005, 0.0001), condim=4))


def _rot_y_to(v) -> np.ndarray:
    """Rotation taking the part's +z to ``v`` (used for discs printed flat)."""
    v = np.asarray(v, float)
    v = v / np.linalg.norm(v)
    z = EZ
    if np.allclose(v, z):
        return np.eye(3)
    if np.allclose(v, -z):
        return np.diag([1.0, -1.0, -1.0])
    k = np.cross(z, v)
    s = np.linalg.norm(k)
    k /= s
    c = float(np.dot(z, v))
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * K + (1 - c) * K @ K


def _quat_axis(axis):
    from .tree import mat2quat

    return mat2quat(_rot_y_to(axis))


# --------------------------------------------------------------------------------------
# Carriage, head, lift, base
# --------------------------------------------------------------------------------------

SERVO_IDS = {}
_ids = [f"{s}_{j}" for s in ("l", "r") for j in ARM_JOINTS] + ["head_pan", "head_tilt", "lift", "wheel_0", "wheel_1", "wheel_2"]
for _i, _n in enumerate(_ids):
    SERVO_IDS[_n] = _i + 1  # bus ids 1..22


def _carriage(robot: Robot, parent: Body, pos, arms: tuple[str, ...], lift: bool) -> Body:
    """Carriage riding on the mast: J1 drives of both arms and the lift drive."""
    r, a, sb = robot, robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    c = parent.add(Body("carriage", tuple(pos)))
    if lift:
        c.joints.append(Joint("lift", "slide", (0, 0, 1), (0.0, r.lift.travel), r.lift_drive(), SERVO_IDS["lift"]))
    c.parts.append(Placement("carriage", (0, 0, 0), np.eye(3)))
    c.parts.append(Placement("carriage", (0, 0, 0), np.eye(3), mirror=True))
    c.parts.append(Placement("pulley", (LIFT_PULLEY_X, LIFT_HORN_Y, 0.0), _rot_y_to(EY)))
    half_w = a.shoulder_width / 2 + G.carriage_face_y
    cx = carriage_box(robot)
    c.shapes.append(Shape("box", ((cx[1] - cx[0]) / 2, half_w, (cx[3] - cx[2]) / 2),
                          ((cx[1] + cx[0]) / 2, 0, (cx[3] + cx[2]) / 2), rgba=PLA, name="carriage_body"))
    c.masses.append(Mass("v_wheels", 4 * r.bought.v_wheel_kit, (0, 0, sum(r.lift.v_wheel_z) / 2)))
    c.masses.append(Mass("j1_bearings", 4 * r.bought.bearing_608, (a.shoulder_forward, 0, 0)))
    # lift servo: axis along y behind the mast, GT2 pulley on the horn in the mast's mid-plane
    ls = np.array([LIFT_PULLEY_X, LIFT_HORN_Y - sb.horn_top, 0.0])  # output +y, case toward -y
    RL = servo_frame(EY, EZ)
    c.masses.append(servo_mass(r, "servo_lift", ls, RL))
    c.shapes.append(servo_shape(r, ls, RL, "servo_lift"))
    for side in arms:
        o = 1.0 if side == "l" else -1.0
        S = np.array([a.shoulder_forward, o * a.shoulder_width / 2, 0.0])
        _arm(r, side, c, S, SERVO_IDS)
    return c


def _head(robot: Robot, parent: Body, top) -> Body:
    """Mast cap with the pan servo, neck with the tilt servo, camera plate. ``top`` = mast top."""
    r, sb, h = robot, robot.servo_body, robot.head
    G = ArmGeometry(robot)
    top = np.asarray(top, float)
    parent.parts.append(Placement("mast_cap", tuple(top), np.eye(3)))
    ps = top + np.array([0.0, 0.0, h.cap_thickness - sb.bottom])  # pan servo case top (output up)
    RP = servo_frame(EZ, -EX)
    parent.masses.append(servo_mass(r, "servo_head_pan", ps, RP))
    parent.shapes.append(servo_shape(r, ps, RP, "servo_head_pan"))
    pan = parent.add(Body("head_pan", tuple(ps + np.array([0, 0, sb.horn_top]))))
    pan.joints.append(Joint("head_pan", "hinge", (0, 0, 1), h.pan_range, r.head_drive(), SERVO_IDS["head_pan"]))
    pan.parts.append(Placement("neck", (0, 0, 0), np.eye(3)))
    ts = np.array([0.0, -G.pitch_case_top, h.tilt_height])  # tilt servo: output +y, case on -y
    RT = servo_frame(EY, EZ)
    pan.masses.append(servo_mass(r, "servo_head_tilt", ts, RT))
    pan.shapes.append(servo_shape(r, ts, RT, "servo_head_tilt"))
    tilt = pan.add(Body("head", (0.0, 0.0, h.tilt_height)))
    tilt.joints.append(Joint("head_tilt", "hinge", (0, 1, 0), h.tilt_range, r.head_drive(), SERVO_IDS["head_tilt"]))
    tilt.parts.append(Placement("head", (0, 0, 0), np.eye(3)))
    tilt.masses.append(Mass("head_camera", r.bought.camera, (h.camera_forward, 0, 0.0), (0.03, 0.09, 0.03)))
    tilt.shapes.append(Shape("box", (0.012, 0.045, 0.015), (h.camera_forward, 0, 0), rgba=PLA_DARK, name="head_cam_body"))
    tilt.cameras.append({"name": "head_cam", "pos": (h.camera_forward + 0.013, 0, 0), "xyaxes": "0 -1 0 0 0 1",
                         "fovy": f"{h.camera_fovy:g}"})
    return tilt


LIFT_PULLEY_X = -0.040  # GT2 pulley axis behind the mast centre
LIFT_HORN_Y = -0.005  # lift servo horn face; the pulley spans y in [-0.005, +0.005]


def carriage_box(robot: Robot) -> tuple[float, float, float, float]:
    """(x_min, x_max, z_min, z_max) of the carriage housing in the carriage frame."""
    a, sb = robot.arm, robot.servo_body
    G = ArmGeometry(robot)
    px, pz = G.j1_pinion_xz
    z_top = pz + (sb.length - sb.axis_from_end) + a.wall + 0.002  # above the J1 servo cases
    x_max = a.shoulder_forward + 0.011 + 0.004  # around the J1 bearings
    x_min = LIFT_PULLEY_X - 0.013 - 0.004
    return (x_min, x_max, robot.lift.v_wheel_z[0] - 0.012, z_top)


def _post(robot: Robot, world: Body, shoulder_height: float, length: float) -> Body:
    """A 2020 post on a printed foot at a table edge (desk variants)."""
    post = world.add(Body("post", (0.0, 0.0, 0.0)))
    post.parts.append(Placement("post_foot", (0, 0, 0), np.eye(3)))
    post.shapes.append(Shape("box", (0.010, 0.010, length / 2), (0, 0, length / 2), rgba=ALU, name="post"))
    post.masses.append(Mass("post_extrusion", robot.bought.extrusion_2020 * length, (0, 0, length / 2), (0.02, 0.02, length)))
    return post


def _base(robot: Robot, world: Body, base_mode: str) -> Body:
    r, b = robot, robot.base
    base = world.add(Body("base", (0.0, 0.0, 0.0)))
    if base_mode == "planar":
        base.joints += [
            Joint("base_x", "slide", (1, 0, 0)),
            Joint("base_y", "slide", (0, 1, 0)),
            Joint("base_yaw", "hinge", (0, 0, 1)),
        ]
    elif base_mode == "free":
        base.joints.append(Joint("base_free", "free"))
    base.parts.append(Placement("hub", (0, 0, b.frame_z), np.eye(3)))
    for k in range(6):
        base.parts.append(Placement("deck", (0, 0, b.deck_height - b.deck_thickness), _rot_z(math.pi * k / 3)))
    # collision disc stops inside the wheels (the printed deck has notches where they poke through)
    deck_r = b.wheel_distance - b.wheel_width / 2 - 0.004
    base.shapes.append(Shape("cylinder", (deck_r, b.deck_thickness / 2), (0, 0, b.deck_height - b.deck_thickness / 2),
                             rgba=PLA_DARK, name="deck"))
    for i, phi in enumerate(b.wheel_angles):
        d = np.array([math.cos(phi), math.sin(phi), 0.0])
        spoke = b.spoke_end - 0.025
        mid = d * (0.025 + spoke / 2) + np.array([0, 0, b.frame_z])
        base.masses.append(Mass(f"spoke_{i}", r.bought.extrusion_2020 * spoke, tuple(mid)))
        base.shapes.append(Shape("box", (spoke / 2, 0.010, 0.010), tuple(mid), _quat_axis_x(d), rgba=ALU, name=f"spoke_{i}", collide=False))
        so = d * wheel_servo_radius(robot) + np.array([0, 0, b.wheel_radius])
        Rw = servo_frame(d, EZ)
        base.masses.append(servo_mass(r, f"servo_wheel_{i}", so, Rw))
        base.shapes.append(servo_shape(r, so, Rw, f"servo_wheel_{i}"))
        base.parts.append(Placement("wheel_mount", (0, 0, 0), _rot_z(phi)))
        hub_pos = d * (wheel_servo_radius(robot) + r.servo_body.horn_top) + np.array([0, 0, b.wheel_radius])
        base.parts.append(Placement("wheel_hub", tuple(hub_pos), _rot_y_to(d)))
        if base_mode != "free":  # visual wheels (the free base has real roller wheels)
            c = d * b.wheel_distance + np.array([0, 0, b.wheel_radius])
            base.shapes.append(Shape("cylinder", (b.wheel_radius, b.wheel_width / 2), tuple(c), _quat_axis(d),
                                     rgba=RUBBER, collide=False, name=f"wheel_{i}_visual"))
            base.masses.append(Mass(f"wheel_{i}", r.bought.omni_wheel, tuple(c), (0.06, 0.06, 0.06)))
    base.masses.append(Mass("battery", r.bought.battery, b.battery_pos, (0.14, 0.05, 0.045)))
    base.shapes.append(Shape("box", (0.07, 0.025, 0.0225), b.battery_pos, rgba=(0.2, 0.3, 0.6, 1), name="battery"))
    base.masses.append(Mass("electronics", r.bought.computer + r.bought.electronics, b.electronics_pos, (0.10, 0.08, 0.04)))
    base.shapes.append(Shape("box", (0.05, 0.04, 0.02), b.electronics_pos, rgba=(0.1, 0.45, 0.2, 1), name="electronics"))
    L = r.lift.mast_length
    base.masses.append(Mass("mast", r.bought.extrusion_2020 * L, (0, 0, b.mast_bottom + L / 2), (0.02, 0.02, L)))
    base.shapes.append(Shape("box", (0.010, 0.010, L / 2), (0, 0, b.mast_bottom + L / 2), rgba=ALU, name="mast"))
    base.sites.append(("base_centre", (0.0, 0.0, 0.0)))
    return base


def wheel_servo_radius(robot: Robot) -> float:
    """Radius of the wheel servo's case top (output pointing outward)."""
    b, sb = robot.base, robot.servo_body
    return b.wheel_distance - b.wheel_width / 2 - 0.004 - sb.horn_top


def _wheels(robot: Robot, base: Body, n_rollers: int = 10) -> None:
    """Omni wheels with passive rollers (the high-fidelity base)."""
    r, b = robot, robot.base
    for i, phi in enumerate(b.wheel_angles):
        d = np.array([math.cos(phi), math.sin(phi), 0.0])
        c = d * b.wheel_distance + np.array([0, 0, b.wheel_radius])
        w = base.add(Body(f"wheel_{i}", tuple(c)))
        w.joints.append(Joint(f"wheel_{i}", "hinge", tuple(d), None, r.wheel_drive(), SERVO_IDS[f"wheel_{i}"]))
        w.masses.append(Mass(f"wheel_{i}_hub", r.bought.omni_wheel * 0.6, (0, 0, 0), (0.03, 0.03, 0.03)))
        w.shapes.append(Shape("cylinder", (b.wheel_radius * 0.7, b.wheel_width / 2), (0, 0, 0), _quat_axis(d),
                              rgba=(0.3, 0.3, 0.3, 1), collide=False, name=f"wheel_{i}_disc"))
        t1 = np.cross(d, EZ)
        rr = 0.011  # roller radius
        for k in range(2 * n_rollers):
            row = k % 2
            ang = 2 * math.pi * k / (2 * n_rollers)
            radial = math.cos(ang) * EZ + math.sin(ang) * t1  # in the wheel plane
            tang = np.cross(d, radial)
            pos = radial * (b.wheel_radius - rr) + d * (row - 0.5) * 0.012
            ro = w.add(Body(f"wheel_{i}_roller_{k}", tuple(pos)))
            ro.joints.append(Joint(f"wheel_{i}_roller_{k}", "hinge", tuple(tang)))
            half = (b.wheel_radius) * math.tan(math.pi / (2 * n_rollers)) * 1.05
            ro.shapes.append(Shape("ellipsoid", (rr, rr, half), (0, 0, 0), _quat_axis(tang), rgba=RUBBER,
                                   name=f"wheel_{i}_roller_{k}", friction=(1.0, 0.005, 0.0001)))
            ro.masses.append(Mass(f"roller_{i}_{k}", r.bought.omni_wheel * 0.4 / (2 * n_rollers), (0, 0, 0), (0.01, 0.01, 0.01)))


def _rot_z(phi: float) -> np.ndarray:
    c, s = math.cos(phi), math.sin(phi)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def _quat_axis_x(d):
    from .tree import mat2quat

    x = np.asarray(d, float)
    z = EZ
    y = np.cross(z, x)
    return mat2quat(np.column_stack([x, y, z]))


def build_tree(robot: Robot, variant: str = "mobile", base_mode: str = "planar") -> Body:
    """Body tree of the requested variant (see module docstring)."""
    world = Body("world")
    table_shoulder = 0.75 + 0.35  # shoulder 0.35 m above a 0.75 m table
    if variant == "arm":
        post = _post(robot, world, table_shoulder, table_shoulder + 0.10)
        _carriage(robot, post, (0.0, 0.0, table_shoulder), ("r",), lift=False)
    elif variant == "torso":
        length = table_shoulder + 0.15
        post = _post(robot, world, table_shoulder, length)
        _carriage(robot, post, (0.0, 0.0, table_shoulder), ("l", "r"), lift=False)
        _head(robot, post, (0.0, 0.0, length))
    elif variant == "mobile":
        base = _base(robot, world, base_mode)
        if base_mode == "free":
            _wheels(robot, base)
        b = robot.base
        _carriage(robot, base, (0.0, 0.0, robot.lift.shoulder_height_min), ("l", "r"), lift=True)
        _head(robot, base, (0.0, 0.0, b.mast_bottom + robot.lift.mast_length))
    else:
        raise ValueError(f"unknown variant {variant!r}")
    return world
