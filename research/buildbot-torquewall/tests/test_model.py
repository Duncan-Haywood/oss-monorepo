import numpy as np
import pytest
import mujoco

from buildbot_torquewall import model as M
from buildbot_payload import model as P
from buildbot_carryphase import model as C


@pytest.mark.parametrize("name,group", [("waist_pitch_joint", "waist"), ("torso", "waist"), ("left_elbow", "arms"),
                                        ("right_wrist_yaw_joint", "arms"), ("left_ankle", "ankles"),
                                        ("left_ankle_pitch_joint", "ankles"), ("left_knee_joint", "legs"),
                                        ("right_hip_yaw", "legs")])
def test_joint_group(name, group):
    assert M.joint_group(name) == group


@pytest.fixture(scope="module")
def g1():
    return P.load("g1")


def test_scaling_touches_only_group(g1):
    m = g1.model
    base = M._BASE(m)
    lim = M.scaled_limits(m, "waist", 2.0)
    for j in range(m.njnt):
        d = m.jnt_dofadr[j]
        if not np.isfinite(base[d]):
            continue
        g = M.joint_group(mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j))
        assert lim[d] == pytest.approx(base[d] * (2.0 if g == "waist" else 1.0))


def test_all_scales_everything_and_context_restores(g1):
    m = g1.model
    base = M._BASE(m)
    with M.limits("all", 3.0):
        assert np.allclose(P.torque_limits(m)[np.isfinite(base)], 3 * base[np.isfinite(base)])
    assert np.allclose(P.torque_limits(m)[np.isfinite(base)], base[np.isfinite(base)])


def test_factor_one_equals_carryphase(g1):
    su = C.Setup(g1, P.standing(g1))
    a, _ = C.score(su, 0.2, 1.0, 3.0, hand=(0.3, 0.6))
    b, _ = M.score(su, 0.2, 1.0, 3.0, "waist", 1.0, hand=(0.3, 0.6))
    assert a.ratio == pytest.approx(b.ratio) and a.ok == b.ok


def test_stronger_waist_lowers_waist_ratio(g1):
    su = C.Setup(g1, P.standing(g1))
    a, _ = M.score(su, 0.2, 1.0, 4.0, "waist", 1.0, hand=(0.3, 0.6))
    b, _ = M.score(su, 0.2, 1.0, 4.0, "waist", 2.0, hand=(0.3, 0.6))
    assert a.worst.startswith("waist") and b.ratio < a.ratio
