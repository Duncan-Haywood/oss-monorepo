import math

import mujoco
import numpy as np
import pytest

from homebot.hardware.feetech import FeetechBus, MockSerial
from homebot.hardware.robot import Calibration, JointCal, RealHomebot, base_twist, kiwi_wheel_speeds
from homebot.layout import SERVO_IDS
from homebot.mjcf import build_xml
from homebot.params import DEFAULT


def test_joint_tick_round_trip():
    c = JointCal(servo_id=1, zero=2048, sign=-1, ratio=3.0)
    for q in (-0.25, 0.0, 0.7, 1.8):
        assert c.to_q(c.to_ticks(q)) == pytest.approx(q, abs=2 * math.pi / 4096 / 3)
    assert c.to_ticks(0.1) < 2048  # sign flips direction


def test_kiwi_inverse_is_inverse():
    for tw in ((0.1, 0, 0), (0, 0.1, 0), (0, 0, 0.5), (0.12, -0.05, 0.3)):
        assert np.allclose(base_twist(DEFAULT, kiwi_wheel_speeds(DEFAULT, *tw)), tw)


def test_kiwi_matches_roller_twin():
    """Wheel speeds from the kiwi model drive the roller-wheel twin at the commanded twist."""
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, "mobile", "free", timestep=0.001))
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    wid = [m.actuator(f"wheel_{i}").id for i in range(3)]
    w = kiwi_wheel_speeds(DEFAULT, 0.1, 0.0, 0.0)
    for k in range(2500):
        d.ctrl[wid] = w * min(1.0, k / 500)
        mujoco.mj_step(m, d)
    assert d.qvel[0] == pytest.approx(0.1, abs=0.01)
    assert abs(d.qvel[1]) < 0.01


def test_real_robot_on_mock_bus():
    ids = [SERVO_IDS["r_elbow"], SERVO_IDS["r_shoulder_pitch"]]
    bus = FeetechBus(serial=MockSerial(ids=ids))
    cal = Calibration({"r_elbow": JointCal(ids[0], 1000, 1, 2.0), "r_shoulder_pitch": JointCal(ids[1], 2048, -1, 3.0)})
    robot = RealHomebot(bus, cal)
    robot.enable(True)
    # the geared joints get the twin's torque-limit fraction (75 %) written to RAM
    assert bus.read(ids[0], "torque_limit") == 750 and bus.read(ids[1], "torque_limit") == 750
    robot.command_joints({"r_elbow": 1.0, "r_shoulder_pitch": 0.5})
    q = robot.read_joints()
    assert q["r_elbow"] == pytest.approx(1.0, abs=2e-3)
    assert q["r_shoulder_pitch"] == pytest.approx(0.5, abs=1e-3)
    robot.command_joints({"r_elbow": 9.0})  # clipped to the joint range
    assert robot.read_joints()["r_elbow"] <= 2.0 + 1e-3


def test_gripper_ticks_are_jaw_metres():
    from homebot.hardware.robot import joint_ratio
    from homebot.params import DEFAULT

    r = joint_ratio(DEFAULT, "r_gripper")
    c = JointCal(SERVO_IDS["r_gripper"], 1024, 1, r)
    assert c.to_ticks(0.032) - c.to_ticks(0.0) == pytest.approx(0.032 * r * 4096 / (2 * 3.141592653589793), abs=1)
    assert c.to_q(c.to_ticks(0.0123)) == pytest.approx(0.0123, abs=1e-4)


def test_calibrate_cli_on_mock_bus(tmp_path, monkeypatch):
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
    import hardware

    monkeypatch.setattr("builtins.input", lambda *_: "")
    out = tmp_path / "cal.json"
    hardware.main(["--mock", "calibrate", "--stage", "arm", "--out", str(out)])
    cal = Calibration.load(out)
    assert set(cal.joints) == set(hardware.STAGE_JOINTS["arm"])
    assert cal.joints["r_shoulder_pitch"].ratio == 3.0
