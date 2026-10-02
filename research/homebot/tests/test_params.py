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
