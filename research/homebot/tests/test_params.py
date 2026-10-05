import math

import pytest

from homebot.hardware.robot import check_single_turn
from homebot.layout import ArmGeometry
from homebot.params import ARM_JOINTS, ARM_RANGES, DEFAULT, Gear
from homebot.servo import KGCM


def test_servo_datasheet_values():
    s = DEFAULT.servo
    assert s.stall_torque == pytest.approx(30 * KGCM)
    assert s.no_load_speed == pytest.approx(math.radians(60) / 0.222)
    # back-EMF damping from the torque-speed line matches the SO-101 MuJoCo prior (0.60)
    assert s.damping == pytest.approx(0.62, abs=0.01)
    assert s.armature == pytest.approx(0.028, rel=1e-6)


def test_geared_drive_scaling():
    g = Gear()
    assert g.ratio == 3.0
    assert g.centre_distance == pytest.approx(0.056)
    d = DEFAULT.arm_drive("shoulder_pitch")
    s = DEFAULT.servo
    assert d.max_effort == pytest.approx(s.stall_torque * 3 * g.efficiency * DEFAULT.shoulder_torque_fraction)
    assert d.max_speed == pytest.approx(s.no_load_speed / 3)
    assert d.armature == pytest.approx(s.armature * 9)
    assert d.damping == pytest.approx(s.damping * 9 * g.efficiency)


def test_packaging_constraints_hold():
    assert ArmGeometry(DEFAULT).check() == []


def test_position_joints_fit_in_one_servo_turn():
    for joint, rot in check_single_turn(DEFAULT).items():
        assert rot < 2 * math.pi * 0.99, joint


def test_arm_length_is_sum_of_segments():
    a = DEFAULT.arm
    assert a.length == pytest.approx(0.53, abs=0.005)
    assert set(ARM_RANGES) == set(ARM_JOINTS)


def test_geared_elbow():
    a = DEFAULT.arm
    assert a.elbow_gear.ratio == 2.0
    assert a.elbow_gear.centre_distance == pytest.approx(0.03375)
    d = DEFAULT.arm_drive("elbow")
    s = DEFAULT.servo
    assert d.max_effort == pytest.approx(s.stall_torque * 2 * a.elbow_gear.efficiency * DEFAULT.elbow_torque_fraction)
    assert d.max_speed == pytest.approx(s.no_load_speed / 2)


def test_gripper_drive_is_rack_and_pinion():
    g = DEFAULT.arm.gripper
    d = DEFAULT.arm_drive("gripper")
    assert d.ratio == pytest.approx(1 / g.pitch_radius)  # servo rad per metre of jaw travel
    # one servo pushes both racks: per-jaw clamp force is half the joint's force limit
    per_jaw = d.max_effort / 2
    assert 25 < per_jaw < 50  # N
    lo, hi = ARM_RANGES["gripper"]
    assert (lo, hi) == (0.0, g.stroke)
    assert hi * d.ratio < 2 * math.pi  # position mode, single turn
