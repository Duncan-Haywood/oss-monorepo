import mujoco
import numpy as np
import pytest

from homebot.mjcf import build_xml, load_mass_properties
from homebot.params import DEFAULT

VARIANTS = [("arm", "planar"), ("torso", "planar"), ("mobile", "planar"), ("mobile", "free")]


@pytest.fixture(scope="module", params=VARIANTS, ids=lambda v: f"{v[0]}-{v[1]}")
def model(request):
    variant, base = request.param
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, variant, base))
    return variant, base, m


def test_compiles_with_expected_actuators(model):
    variant, base, m = model
    expected = {"arm": 8, "torso": 18, "mobile": 22}[variant]
    assert m.nu == expected
    assert m.nkey == 1


def test_home_pose_has_no_contacts(model):
    variant, base, m = model
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    mujoco.mj_forward(m, d)
    assert d.ncon == 0


def test_home_pose_is_held(model):
    variant, base, m = model
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    q0 = d.qpos.copy()
    for _ in range(1000):
        mujoco.mj_step(m, d)
    arm = [m.joint(i).qposadr[0] for i in range(m.njnt) if m.joint(i).name[:2] in ("l_", "r_")]
    assert np.max(np.abs(d.qpos[arm] - q0[arm])) < 0.05


def test_total_mass_plausible(model):
    variant, base, m = model
    total = m.body_subtreemass[0]
    lo, hi = {"arm": (1.3, 2.6), "torso": (3.0, 5.0), "mobile": (4.5, 7.0)}[variant]
    assert lo < total < hi


def test_mass_properties_present():
    props = load_mass_properties()
    for part in ("gear42", "pinion", "shoulder_block", "upper_arm_top", "upper_arm", "forearm_clevis",
                 "forearm", "wrist_clevis", "hand", "jaw", "carriage", "hub", "deck"):
        assert part in props
        assert props[part]["mass"] > 0
        assert props[part]["fits_bed"]
