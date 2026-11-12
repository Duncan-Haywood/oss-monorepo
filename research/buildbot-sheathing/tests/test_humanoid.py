"""Milestone 3, second part (a humanoid at the ledger): closed forms, MuJoCo slide, stiffness."""
import math

import numpy as np
import pytest

from buildbot_sheathing import humanoid as Hm
from buildbot_sheathing import ledger as L


def test_slide_force_and_tip_height_closed_form():
    assert Hm.slide_force(0.4, 0.4, 50.0) == pytest.approx(0.4 * L.MASS * L.G + 20.0)
    assert Hm.tip_height(0.4) == pytest.approx(L.W / 0.8)
    # with the press at the push height the general form reduces to W / (2 mu_l)
    h = Hm.tip_height(0.5)
    assert Hm.tip_height(0.5, 0.4, 80.0, h_press=h) == pytest.approx(h)
    # a press higher than the push raises the threshold (wall friction resists the tip)
    assert Hm.tip_height(0.5, 0.4, 80.0, h_press=2.0) > h


def test_limit_stiffness_is_part_one_boundary():
    th0 = math.radians(1.0)
    k = Hm.limit_stiffness(th0)
    assert L.held_residual(th0, 0.99 * k, 0.4, 50.0) == 0.0
    assert L.held_residual(th0, 1.01 * k, 0.4, 50.0) > 0.0


mujoco = pytest.importorskip("mujoco")


def test_slide_tips_above_threshold_not_below():
    mu = 0.6
    hs = Hm.tip_height(mu)
    low = Hm.slide_sim(0.8 * hs, mu_l=mu)
    high = Hm.slide_sim(1.2 * hs, mu_l=mu)
    assert math.degrees(low["peak_tilt"]) < 0.1 and low["slid"] > 0.05
    assert math.degrees(high["peak_tilt"]) > 1.0
    # while sliding seated, the push equals the closed-form slide force within 2%
    assert low["push_mean"] == pytest.approx(Hm.slide_force(mu, 0.4, 50.0), rel=0.02)


def _models():
    from buildbot_payload import fetch
    return fetch.available("g1") and fetch.available("h1")


needs_models = pytest.mark.skipif(not _models(), reason="Menagerie models unavailable (offline)")


@needs_models
def test_stiffness_linear_in_gains_and_free_translation_is_lower():
    rob, d0 = Hm.robot("g1")
    ok, _, q, _ = Hm.hold(rob, d0, (0.35, 1.0), [-50.0, 0.0, 0.0])
    assert ok
    piv = np.array([0.35, -L.W / 2, 0.0])
    k1 = Hm.rotational_stiffness(rob, q, Hm.gains(rob), piv, "point")
    k2 = Hm.rotational_stiffness(rob, q, Hm.gains(rob, scale=2.0), piv, "point")
    assert k2 == pytest.approx(2 * k1, rel=1e-6)
    assert Hm.rotational_stiffness(rob, q, Hm.gains(rob), piv, "point", free_translation=True) < k1
    # releasing the wrists can only soften a rigid grasp
    kr = Hm.rotational_stiffness(rob, q, Hm.gains(rob), piv, "rigid")
    kw = Hm.rotational_stiffness(rob, q, Hm.gains(rob, released=("wrist",)), piv, "rigid")
    assert kw <= kr


@needs_models
def test_g1_cannot_carry_the_sheet_but_can_press_it():
    from buildbot_payload import model as P
    rob, d0 = Hm.robot("g1")
    kg, _ = P.max_payload(rob, d0, (0.35, 1.0))
    assert kg < L.MASS / 2
    fn, _ = Hm.max_press(rob, d0, (0.35, 1.0))
    assert fn >= 50.0
