"""The MJCF servo (clamped P loop + back-EMF damping) reproduces the motor's torque-speed line."""
import math

import mujoco
import pytest

from homebot.params import DEFAULT
from homebot.servo import Drive, mjcf_actuator, mjcf_joint_attrs


def _single_joint(drive: Drive, inertia=1e-3, load=0.0):
    tag, act = mjcf_actuator(drive, "a", "j", (-100.0, 100.0))
    ja = mjcf_joint_attrs(drive)
    ja["frictionloss"] = "0"
    attrs = " ".join(f'{k}="{v}"' for k, v in ja.items())
    aattrs = " ".join(f'{k}="{v}"' for k, v in act.items())
    xml = f"""<mujoco><option timestep="0.0005" gravity="0 0 0"/><worldbody><body>
    <joint name="j" type="hinge" axis="0 0 1" {attrs}/>
    <inertial pos="0 0 0" mass="1" diaginertia="{inertia} {inertia} {inertia}"/>
    </body></worldbody><actuator><{tag} {aattrs}/></actuator></mujoco>"""
    m = mujoco.MjModel.from_xml_string(xml)
    return m, mujoco.MjData(m)


def test_no_load_speed_emerges():
    d0 = Drive(DEFAULT.servo)
    m, d = _single_joint(d0)
    d.ctrl[0] = 100.0  # far target: loop saturated
    for _ in range(8000):
        mujoco.mj_step(m, d)
    assert d.qvel[0] == pytest.approx(d0.max_speed, rel=0.01)


def test_saturated_torque_follows_line():
    d0 = Drive(DEFAULT.servo)
    m, d = _single_joint(d0, inertia=0.05)
    d.ctrl[0] = 100.0
    for _ in range(400):
        mujoco.mj_step(m, d)
    mujoco.mj_forward(m, d)  # forces at the current velocity
    w = d.qvel[0]
    net = d.qfrc_actuator[0] + d.qfrc_passive[0]
    assert net == pytest.approx(d0.max_effort - d0.damping * w, rel=1e-3)
    assert d0.torque_speed_limit(w) == pytest.approx(net, rel=1e-3)


def test_small_error_is_linear():
    d0 = Drive(DEFAULT.servo)
    m, d = _single_joint(d0)
    d.ctrl[0] = math.radians(1.0)
    mujoco.mj_forward(m, d)
    assert d.actuator_force[0] == pytest.approx(d0.kp * math.radians(1.0), rel=1e-6)


def test_velocity_mode_tracks_at_no_load():
    d0 = Drive(DEFAULT.servo, mode="velocity")
    m, d = _single_joint(d0)
    d.ctrl[0] = 2.0
    for _ in range(8000):
        mujoco.mj_step(m, d)
    assert d.qvel[0] == pytest.approx(2.0, rel=0.01)
