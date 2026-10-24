"""Joint sign conventions and left/right mirror symmetry of the twin."""
import mujoco
import numpy as np
import pytest

from homebot.mjcf import build_xml
from homebot.params import ARM_JOINTS, ARM_RANGES, DEFAULT


@pytest.fixture(scope="module")
def torso():
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, "torso"))
    return m, mujoco.MjData(m)


def tcp(m, d, q, side="r"):
    mujoco.mj_resetData(m, d)
    for k, v in q.items():
        d.joint(f"{side}_{k}").qpos[0] = v
    mujoco.mj_kinematics(m, d)
    return d.site(f"{side}_tcp").xpos.copy()


def test_mirror_symmetry(torso):
    m, d = torso
    rng = np.random.default_rng(0)
    M = np.diag([1.0, -1.0, 1.0])
    for _ in range(20):
        q = {j: rng.uniform(*ARM_RANGES[j]) for j in ARM_JOINTS[:-1]}
        assert np.allclose(tcp(m, d, q, "l"), M @ tcp(m, d, q, "r"), atol=1e-9)


def test_positive_directions(torso):
    m, d = torso
    p0 = tcp(m, d, {})
    assert tcp(m, d, {"shoulder_pitch": 0.5})[0] > p0[0]  # raises forward
    assert tcp(m, d, {"shoulder_roll": 0.5})[1] < p0[1]  # right arm abducts to -y
    assert tcp(m, d, {"shoulder_roll": 0.5}, "l")[1] > tcp(m, d, {}, "l")[1]
    assert tcp(m, d, {"elbow": 0.5})[0] > p0[0]  # forearm flexes forward


def test_straight_arm_length(torso):
    m, d = torso
    mujoco.mj_resetData(m, d)
    mujoco.mj_kinematics(m, d)
    sh = d.body("r_shoulder").xpos
    assert np.linalg.norm(d.site("r_tcp").xpos - sh) == pytest.approx(
        np.hypot(DEFAULT.arm.length, DEFAULT.arm.roll_outboard), abs=1e-6)
