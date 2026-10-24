"""Every number that defines the robot, in one place (SI units: m, kg, s, rad).

The printed parts (``homebot.cad``), the MuJoCo model (``homebot.mjcf``) and the
engineering checks (``homebot.analysis``) all read these values, so a change here moves
the CAD and the twin together. Values marked *estimate* are not from a datasheet; the
README says how to measure them on a built robot.

Robot frame: x forward, y left, z up, origin on the floor under the base centre.
Arm zero pose: arms hanging straight down beside the torso, grippers pointing down.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from .servo import KGCM, Drive, ServoSpec

# --------------------------------------------------------------------------------------
# Servos. Datasheet values: see hardware/BOM.md for sources. kp/kv/rotor_inertia/friction
# are estimates (to be identified with homebot.sysid on a real servo).
# --------------------------------------------------------------------------------------

STS3215_12V = ServoSpec(
    name="Feetech STS3215 12 V (C018/C047, 1/345)",
    supply_v=12.0,
    stall_torque=30.0 * KGCM,  # datasheet: 30 kg*cm at 12 V
    no_load_speed=math.radians(60) / 0.222,  # datasheet: 0.222 s/60 deg (45 rpm) at 12 V
    stall_current=2.7,  # datasheet
    mass=0.055,  # datasheet, 55 +/- 1 g
    gear_ratio=345.0,
    ticks_per_rev=4096,  # 12-bit magnetic encoder
    price_usd=15.0,  # ~$14-16 from robotics resellers in 10-packs (hardware/BOM.md)
    # Priors from the SO-101 MuJoCo model (TheRobotStudio/SO-ARM100,
    # Simulation/SO101/joints_properties.xml: kp 17.8, armature 0.028, frictionloss 0.052),
    # adapted from Open Duck Mini, whose STS3215 parameters were identified with Rhoban's BAM
    # (Duclusaud et al., ICRA 2025) on the 7.4 V servo. The 12 V servo has a different
    # winding (datasheets: 11 vs 8 kg*cm/A), so treat these as priors and identify the
    # servos you buy (homebot.sysid, experiments/hardware.py sysid-log).
    kp=17.8,
    kv=0.5,  # estimate (wheel-mode speed loop)
    rotor_inertia=0.028 / 345.0 ** 2,
    friction=0.052,
)


@dataclass(frozen=True)
class ServoBody:
    """Envelope of the STS3215 case in the servo frame, from the datasheet drawing and the
    SO-ARM100 servo mesh (sts3215_03a_v1.stl, measured, not copied).

    Servo frame: origin on the output axis at the case top face of the output end, z out of
    the output spline, x along the case away from the output end, y across the case.
    """

    length: float = 0.0454
    width: float = 0.0248
    height: float = 0.0288  # case height at the output end
    axis_from_end: float = 0.0102  # output axis -> near end of the case
    top_raise: float = 0.0026  # rear part of the top cover stands proud of the output end
    top_raise_from: float = 0.011  # ... starting this far behind the axis
    bottom_bump: float = 0.0041  # rear idler boss / bottom cover below the output-end bottom
    horn_diameter: float = 0.020
    horn_top: float = 0.0043  # horn mounting face above the case top
    horn_screw_top: float = 0.0055  # centre screw head
    horn_bolt_circle: float = 0.014  # 4 x M3 on a 14 mm circle
    horn_bolt: float = 0.003
    case_holes: tuple[tuple[float, float], ...] = ((0.0083, 0.01025), (0.0083, -0.01025),
                                                   (0.0328, 0.01025), (0.0328, -0.01025))  # bottom face, M2
    case_bolt: float = 0.002

    @property
    def bottom(self) -> float:
        """Lowest point of the case (the idler boss), negative z."""
        return -(self.height + self.bottom_bump)

    @property
    def stack(self) -> float:
        """Idler boss to horn face along the axis."""
        return self.horn_top - self.bottom


# --------------------------------------------------------------------------------------
# Materials and bought parts
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Print:
    """Printing assumptions used for the mass estimate of every printed part."""

    density: float = 1240.0  # kg/m^3, PLA
    wall: float = 0.0012  # 3 perimeters of a 0.4 mm nozzle (also top/bottom skins)
    infill: float = 0.25
    bed: tuple[float, float, float] = (0.220, 0.220, 0.250)  # smallest common bed (Ender-3 class)
    clearance: float = 0.0003  # radial clearance for printed fits


@dataclass(frozen=True)
class Bought:
    """Masses of bought parts (kg) or linear densities (kg/m)."""

    extrusion_2020: float = 0.50  # kg/m, 2020 aluminium profile
    bearing_608: float = 0.012
    bearing_6806: float = 0.011
    bearing_625: float = 0.005
    steel_rod_4mm: float = 0.0985  # kg/m, 4 mm steel rod (gripper guides)
    omni_wheel: float = 0.060  # 100 mm plastic omni wheel (estimate; see BOM)
    battery: float = 0.40  # 3S 5000 mAh LiPo (12.6 V full; a 4S pack would trip the 14 V servo limit)
    computer: float = 0.10  # Raspberry Pi 5 + case
    camera: float = 0.06  # USB webcam with the clip removed
    electronics: float = 0.15  # bus adapters, buck converter, switch, wiring
    v_wheel_kit: float = 0.012  # one POM V-wheel with bearings, eccentric spacer and bolt


# --------------------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Gear:
    """Printed spur gear stage between a servo and a joint."""

    module: float = 0.002
    pinion_teeth: int = 14
    gear_teeth: int = 42
    face_width: float = 0.014
    efficiency: float = 0.92  # estimate for a printed spur pair, lubricated
    friction: float = 0.05  # N*m at the joint, two 608 bearings and the mesh (estimate)

    @property
    def ratio(self) -> float:
        return self.gear_teeth / self.pinion_teeth

    @property
    def centre_distance(self) -> float:
        return self.module * (self.pinion_teeth + self.gear_teeth) / 2

    def outer_radius(self, teeth: int) -> float:
        return self.module * (teeth + 2) / 2


@dataclass(frozen=True)
class Gripper:
    """Parallel gripper (v2). A pinion on the gripper servo drives two racks in opposite
    directions; each rack belongs to a jaw carriage that slides on two steel guide rods, and
    each jaw carries a printed TPU pad. Both jaws are the same printed part.

    Hand frame: origin at the wrist-roll horn face, z along the arm (down at the zero pose);
    the jaws close along x. The gripper servo stands on the hand axis, output down, its case
    running back (-x), under a hub plate with a gap for reaching the wrist-horn screws."""

    module: float = 0.00125
    pinion_teeth: int = 18
    face_width: float = 0.008
    stroke: float = 0.032  # per jaw: the jaws open 0-64 mm
    hub_plate: float = 0.004
    neck: float = 0.007  # gap under the hub plate: hex-key access to the wrist-horn screws
    rod_diameter: float = 0.004  # 2 x 4 mm steel rod, 100 mm
    rod_length: float = 0.100
    rod_spacing: float = 0.018  # y distance between the two rods
    carriage: tuple[float, float, float] = (0.012, 0.028, 0.010)  # x, y, z size of a jaw carriage
    finger_length: float = 0.036  # carriage bottom -> fingertip
    finger_thickness: float = 0.007
    pad: tuple[float, float, float] = (0.002, 0.022, 0.032)  # TPU pad: thickness, width (y), height (z)
    pad_friction: float = 0.9  # TPU 95A on dry PLA/cardboard (estimate; randomised in the pick task)
    tcp_above_tip: float = 0.016  # tool centre point: between the pads, mid-height
    efficiency: float = 0.8  # rack and pinion plus rod bushings (estimate)
    friction: float = 1.5  # N, rod bushings (estimate)
    torque_fraction: float = 0.35  # torque-limit register: ~37 N per jaw at stall, 17 mm/s per jaw

    @property
    def pitch_radius(self) -> float:
        return self.module * self.pinion_teeth / 2

    def stack(self, sb: "ServoBody", wall: float) -> float:
        """Wrist-roll horn face -> gripper-servo horn face (top of the pinion)."""
        return self.hub_plate + self.neck + wall + 0.0003 + sb.stack

    def tip(self, sb: "ServoBody", wall: float) -> float:
        """Wrist-roll horn face -> fingertips."""
        return (self.stack(sb, wall) + self.face_width + 0.001 + self.carriage[2] + self.finger_length)


@dataclass(frozen=True)
class Arm:
    """One 7-DOF arm (shoulder pitch, shoulder roll, upper-arm yaw, elbow, forearm roll,
    wrist pitch, wrist roll) plus a parallel gripper. Lengths are between joint axes
    along the hanging arm; the module offsets (``*_to_*``) are the minimum the servo stack
    allows (see ``homebot.layout.ArmGeometry``), the two link lengths are free choices.

    v2 (this version) gears the elbow 2:1 and replaces v1's single pivoting jaw with the
    parallel gripper; v1's values are in the git history and the README."""

    shoulder_width: float = 0.34  # distance between the two shoulder points (on the J1 axes)
    shoulder_forward: float = 0.055  # shoulder-pitch axis ahead of the mast centre
    pitch_to_roll: float = 0.060  # shoulder pitch axis -> shoulder roll axis (down)
    roll_outboard: float = 0.012  # shoulder roll axis offset outward from the shoulder point
    roll_to_yaw: float = 0.058  # shoulder roll axis -> upper-arm yaw horn face (down)
    upper_arm: float = 0.105  # upper-arm yaw horn face -> elbow axis (free)
    elbow_to_roll: float = 0.060  # elbow axis -> forearm roll horn face
    forearm: float = 0.095  # forearm roll horn face -> wrist pitch axis (free)
    wrist_to_roll: float = 0.060  # wrist pitch axis -> wrist roll horn face
    link_section: float = 0.034  # outer diameter of the printed arm tubes
    wall: float = 0.0025  # printed wall around servos
    cheek: float = 0.004  # clevis cheek thickness
    shoulder_gear: Gear = field(default_factory=Gear)
    # 2:1 elbow stage, module 1.5: the servo sits a centre distance up the upper arm
    elbow_gear: Gear = field(default_factory=lambda: Gear(module=0.0015, pinion_teeth=15, gear_teeth=30,
                                                          face_width=0.012, friction=0.03))
    geared_joints: tuple[str, ...] = ("shoulder_pitch", "shoulder_roll", "elbow")
    roll_bearing_joints: tuple[str, ...] = ("upper_arm_yaw", "forearm_roll")  # 6806 bearing at the joint
    gripper: Gripper = field(default_factory=Gripper)
    payload: float = 0.20  # rated payload (kg) at the tool centre point

    @property
    def hand(self) -> float:
        """Wrist-roll horn face -> tool centre point."""
        return Gripper.tip(self.gripper, ServoBody(), self.wall) - self.gripper.tcp_above_tip

    @property
    def length(self) -> float:
        """Shoulder-pitch axis to tool centre point when straight."""
        return (self.pitch_to_roll + self.roll_to_yaw + self.upper_arm + self.elbow_to_roll
                + self.forearm + self.wrist_to_roll + self.hand)

    def gear(self, joint: str) -> Gear:
        return self.elbow_gear if joint == "elbow" else self.shoulder_gear


# Joint order of one arm; the same order is used by the sim, the driver and the policies.
ARM_JOINTS = (
    "shoulder_pitch", "shoulder_roll", "upper_arm_yaw", "elbow",
    "forearm_roll", "wrist_pitch", "wrist_roll", "gripper",
)

# Joint ranges (rad) for the right arm; the left arm uses the same ranges (axes are
# mirrored so that positive angles mean the same anatomical motion on both sides).
ARM_RANGES = {
    # Geared joints must stay inside one servo turn (position mode is single-turn, 4096
    # counts), so their range is at most 2*pi/3 at the 3:1 gear (see tests/test_params.py).
    # Every range is also checked against the printed parts by homebot.cad.interference.
    "shoulder_pitch": (-0.25, 1.80),  # + raises the arm forward (hanging -> 13 deg above level)
    "shoulder_roll": (-0.15, 1.6),  # + abducts away from the body
    "upper_arm_yaw": (-1.6, 1.6),
    "elbow": (-0.1, 2.0),  # + flexes the forearm forward/up (v1 claimed 2.3; its parts stopped at 1.7)
    "forearm_roll": (-2.6, 2.6),
    "wrist_pitch": (-1.6, 1.6),
    "wrist_roll": (-2.8, 2.8),
    "gripper": (0.0, 0.032),  # metres per jaw: 0 = pads touching, 0.032 = 64 mm open
}


@dataclass(frozen=True)
class Head:
    """Pan/tilt camera head on a cap at the top of the mast (fixed height, sees both arms)."""

    pan_range: tuple[float, float] = (-2.6, 2.6)
    tilt_range: tuple[float, float] = (-0.6, 1.3)  # + looks down
    cap_thickness: float = 0.004  # mast cap plate under the pan servo
    tilt_height: float = 0.045  # pan horn face -> tilt axis
    camera_forward: float = 0.032  # tilt axis -> camera optical centre
    camera_fovy: float = 60.0  # deg, vertical FOV of a typical 1080p USB webcam (estimate)


@dataclass(frozen=True)
class Lift:
    """Carriage on a vertical 2020 V-slot mast, driven by a servo pulley on a fixed GT2 belt."""

    mast_length: float = 1.00
    travel: float = 0.50
    shoulder_height_min: float = 0.45  # shoulder-pitch axis height above the floor at lift=0
    pulley_teeth: int = 36  # printed GT2 pulley on the servo horn (2 mm pitch; 36T leaves room for the horn screws)
    v_wheel_offset: float = 0.0158  # mini V-wheel centre from the profile centre
    v_wheel_z: tuple[float, float] = (-0.020, 0.070)  # wheel rows relative to the shoulder axis

    @property
    def pulley_radius(self) -> float:
        return self.pulley_teeth * 0.002 / (2 * math.pi)


@dataclass(frozen=True)
class Base:
    """Three-omni-wheel (kiwi) base on a Y frame of 2020 extrusion with a printed hub."""

    wheel_radius: float = 0.050  # 100 mm omni wheels
    wheel_width: float = 0.025
    wheel_distance: float = 0.200  # base centre -> wheel contact point
    wheel_angles: tuple[float, float, float] = (0.0, 2 * math.pi / 3, 4 * math.pi / 3)  # wheel 0 forward
    frame_z: float = 0.072  # centre line of the 2020 spokes
    spoke_end: float = 0.142  # spokes run from the hub to this radius
    deck_radius: float = 0.205
    deck_height: float = 0.089  # top of the deck above the floor (deck rests on the spokes)
    deck_thickness: float = 0.006
    mast_bottom: float = 0.062  # the mast stands in the hub
    battery_pos: tuple[float, float, float] = (-0.095, 0.0, 0.114)
    electronics_pos: tuple[float, float, float] = (0.075, 0.0, 0.110)
    max_speed: float = 0.20  # m/s commanded limit (no-load wheel rim speed is 0.236 m/s)
    max_yaw_rate: float = 1.0  # rad/s commanded limit
    max_accel: float = 0.5  # m/s^2 ramp on commanded velocity (keeps the ZMP inside the wheel triangle)
    max_yaw_accel: float = 2.0  # rad/s^2


@dataclass(frozen=True)
class Robot:
    servo: ServoSpec = STS3215_12V
    servo_body: ServoBody = field(default_factory=ServoBody)
    printing: Print = field(default_factory=Print)
    bought: Bought = field(default_factory=Bought)
    arm: Arm = field(default_factory=Arm)
    head: Head = field(default_factory=Head)
    lift: Lift = field(default_factory=Lift)
    base: Base = field(default_factory=Base)
    shoulder_torque_fraction: float = 0.75  # torque-limit register on geared servos (protects PLA teeth)
    elbow_torque_fraction: float = 0.75  # as the shoulders; Lewis root stress ~38 MPa at stall (shoulder ~20)

    # ----------------------------------------------------------------------------------
    def arm_drive(self, joint: str) -> Drive:
        a = self.arm
        if joint == "gripper":
            g = a.gripper  # servo radians per metre of jaw travel (the lift's convention)
            return Drive(self.servo, ratio=1.0 / g.pitch_radius, efficiency=g.efficiency,
                         extra_friction=g.friction, torque_fraction=g.torque_fraction)
        if joint in a.geared_joints:
            g = a.gear(joint)
            frac = self.elbow_torque_fraction if joint == "elbow" else self.shoulder_torque_fraction
            return Drive(self.servo, ratio=g.ratio, efficiency=g.efficiency,
                         extra_friction=g.friction, torque_fraction=frac)
        if joint in a.roll_bearing_joints:
            return Drive(self.servo, extra_friction=0.01)
        return Drive(self.servo)

    def lift_drive(self) -> Drive:
        return Drive(self.servo, ratio=1.0 / self.lift.pulley_radius, efficiency=0.9, extra_friction=4.0)

    def head_drive(self) -> Drive:
        return Drive(self.servo)

    def wheel_drive(self) -> Drive:
        return Drive(self.servo, mode="velocity")

    def with_servo(self, **kw) -> "Robot":
        return replace(self, servo=replace(self.servo, **kw))


DEFAULT = Robot()
