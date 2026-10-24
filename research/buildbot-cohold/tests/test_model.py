import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path[:0] = [str(Path(__file__).resolve().parents[2] / "buildbot-payload" / "src"),
                str(Path(__file__).resolve().parents[1] / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_cohold import model as C  # noqa: E402


def test_static_sheet_splits_weight_evenly():
    r = C.simulate(20.0, lift=0.0, t_end=1.0)
    assert np.allclose(r["theta"], 0.0, atol=1e-9)
    assert np.allclose(r["FP"][:, 1], 20 * C.G / 2, atol=1e-6)
    assert np.allclose(r["FR"][:, 1], 20 * C.G / 2, atol=1e-6)


def test_released_rod_matches_physical_pendulum():
    # no robot force, rod released horizontal about the pin: omega^2 = 3 g / L at the bottom (energy balance)
    L = 2.44
    r = C.simulate(10.0, L=L, lift=0.0, K=0.0, B=0.0, ff=0.0, t_end=3.0, dt=1e-4)
    i = int(np.argmax(r["theta"] <= -math.pi / 2))
    assert i > 0
    # angular speed from the finite difference of theta around the crossing
    w = (r["theta"][i + 1] - r["theta"][i - 1]) / (2e-4)
    assert w * w == pytest.approx(3 * C.G / L, rel=0.01)


def test_tilt_is_lag_times_speed_over_length():
    L = 2.44
    r = C.simulate(22.0, L=L, T=2.0, K=5000.0, B=50.0, lag=0.5)
    v = float(np.abs(r["Rdot"][:, 1]).max())
    tilt = float(np.abs(r["theta"]).max())
    assert tilt == pytest.approx(v * 0.5 / L, rel=0.25)


def test_person_load_never_below_static_share_while_lifting():
    r = C.simulate(22.0)
    assert r["FP"][:, 1].max() >= 22 * C.G / 2


def test_v_safe_limit_of_heavy_robot():
    # an infinitely heavy robot leaves mu = human effective mass: F / sqrt(m_h k)
    f, k, mh = C.BODY["chest"]
    assert C.v_safe("chest", 1e12) == pytest.approx(f / math.sqrt(mh * k * 1000), rel=1e-6)
    assert C.v_safe("chest", 1e12) == pytest.approx(0.14, rel=1e-6)
    assert C.v_safe("face", 5.0) > C.v_safe("face", 50.0)  # heavier robot, lower safe speed


@pytest.mark.skipif(not fetch.available("g1"), reason="Menagerie models not available")
def test_zero_forward_load_matches_payload_torques():
    rob = P.load("g1")
    d0 = P.standing(rob)
    p = P.pose(rob, d0, (0.3, 0.6), 3.0)
    s = P.torques(rob, p.qpos, 3.0)
    ratio, _, _ = C.wrench_torques(P, rob, p.qpos, 0.0, 3.0 * C.G)
    assert ratio == pytest.approx(float(s.ratio.max()), rel=1e-9)


@pytest.mark.skipif(not fetch.available("g1"), reason="Menagerie models not available")
def test_reflected_mass_is_positive_and_below_arm_plus_torso():
    rob = P.load("g1")
    d0 = P.standing(rob)
    lam = C.reflected_mass(P, rob, d0.qpos, (0, 0, 1))
    assert 0 < lam < float(rob.model.body_subtreemass[1])
