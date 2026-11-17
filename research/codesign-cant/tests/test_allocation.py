import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_cant import aero, allocation as A  # noqa: E402


def random_designs(n, seed=0):
    rng = np.random.default_rng(seed)
    for _ in range(n):
        Th = rng.uniform(1, 10)
        yield rng.uniform(0, np.deg2rad(60)), rng.uniform(0.08, 0.3), rng.uniform(0.002, 0.03), Th, rng.uniform(1.3, 8) * Th


@pytest.mark.parametrize("mode", ["hover", "free"])
def test_closed_form_matches_linear_programme(mode):
    for a, L, k, Th, Tm in random_designs(60):
        roll, yaw, lat = A.closed_form(a, L, k, Th, Tm, mode)
        lr, F = A.lp_max_torque(a, L, k, Th, Tm, 0, mode)
        lp, _ = A.lp_max_torque(a, L, k, Th, Tm, 1, mode)
        ly, Fy = A.lp_max_torque(a, L, k, Th, Tm, 2, mode)
        assert lr == pytest.approx(roll, rel=1e-9)
        assert lp == pytest.approx(roll, rel=1e-9)          # X layout: pitch = roll
        assert ly == pytest.approx(yaw, rel=1e-9)
        assert np.hypot(*Fy) == pytest.approx(0, abs=1e-9)  # yaw from cant needs no side force


def test_lateral_force_of_pure_roll():
    a, L, k, Th, Tm = np.deg2rad(30), 0.2, 0.01, 5.0, 10.0
    tau, F = A.lp_max_torque(a, L, k, Th, Tm, 0)
    assert np.hypot(*F) / tau == pytest.approx(A.closed_form(a, L, k, Th, Tm)[2], rel=1e-9)
    # the -poshold formula tan(a)/(L/sqrt2) is about sqrt2 too large
    assert A.prior_model(a, L, k, Th, Tm)[2] / A.closed_form(a, L, k, Th, Tm)[2] == pytest.approx(np.sqrt(2) * (L * np.cos(a) - k * np.sin(a)) / (L * np.cos(a)), rel=1e-9)


def test_wrong_tilt_sense_subtracts():
    a, L, k, Th, Tm = np.deg2rad(20), 0.15, 0.01, 4.0, 8.0
    good, _ = A.lp_max_torque(a, L, k, Th, Tm, 2, sense=1)
    bad, _ = A.lp_max_torque(a, L, k, Th, Tm, 2, sense=-1)
    assert good == pytest.approx(4 * 4.0 * (L * np.sin(a) + k * np.cos(a)))
    assert bad == pytest.approx(4 * 4.0 * abs(L * np.sin(a) - k * np.cos(a)))


def test_no_cant_reaction_torque_only():
    # alpha = 0: yaw = 4 min(Th, Tmax-Th) kappa; the earlier formula gives half of that at TWR 2
    roll, yaw, lat = A.closed_form(0.0, 0.2, 0.01, 5.0, 10.0)
    assert yaw == pytest.approx(4 * 5 * 0.01)
    assert lat == 0
    assert A.prior_model(0.0, 0.2, 0.01, 5.0, 10.0)[1] == pytest.approx(yaw / 2)
    assert A.prior_model(0.0, 0.2, 0.01, 5.0, 10.0)[0] == pytest.approx(roll)


def test_prior_roll_exceeds_attainable_above_twr2():
    Th = 5.0
    for twr in (3.0, 4.0, 6.0):
        prior = A.prior_model(0.0, 0.2, 0.01, Th, twr * Th)[0]
        free = A.closed_form(0.0, 0.2, 0.01, Th, twr * Th, "free")[0]
        assert prior > free * 1.0001      # needs negative thrust on the low side


def test_hover_power_ratio():
    assert A.hover_power_ratio(0.0) == 1.0
    assert A.hover_power_ratio(np.deg2rad(10)) == pytest.approx(1.0231, abs=2e-4)


def test_prior_actuator_reproduces_parent_size():
    # actuator="prior" must give the parent's numbers; "hover" changes only the two torque limits
    p = aero.size(0.15, 0.12, np.deg2rad(20), kappa_per_d=0.081)
    h = aero.size(0.15, 0.12, np.deg2rad(20), kappa_per_d=0.081, actuator="hover")
    r = 0.15 / np.sqrt(2)
    assert p["tau_yaw"] == pytest.approx(2 * (2 - 1) * (p["mass"] * aero.G / (4 * np.cos(np.deg2rad(20)))) * (0.081 * 0.12 * np.cos(np.deg2rad(20)) + r * np.sin(np.deg2rad(20))))
    assert h["mass"] == pytest.approx(p["mass"]) and h["cost"] == pytest.approx(p["cost"])
    assert h["tau_yaw"] > 2 * p["tau_yaw"]


# ---- milestone 2: attitude-priority mixer on the shared thrust polytope ----

def _thrusts(tau, a, L, k, Th, Tm, mode):
    kr, ky = A.arms(a, L, k)
    out, s_rp, s_y = A.mix_priority(tau[None], kr, ky, Th, Tm, mode)
    dT = A.thrust_change(out, kr, ky)[0]
    if mode == "free":                       # centre the spread inside [0, Tmax]
        dT = dT - (dT.max() + dT.min()) / 2 + Tm / 2 - Th
    return out[0], s_rp[0], s_y[0], Th + dT


def test_thrust_change_reproduces_layout_rows():
    for a, L, k, Th, Tm in random_designs(40, seed=3):
        kr, ky = A.arms(a, L, k)
        tau = np.random.default_rng(1).normal(size=3)
        dT = A.thrust_change(tau, kr, ky)
        B = A.layout(a, L, k)
        assert B[3:] @ dT == pytest.approx(tau, abs=1e-9)
        assert B[2] @ dT == pytest.approx(0, abs=1e-9)


@pytest.mark.parametrize("mode", ["hover", "free"])
def test_mixer_respects_thrust_bounds_and_is_maximal(mode):
    rng = np.random.default_rng(7)
    for a, L, k, Th, Tm in random_designs(80, seed=5):
        roll, yaw, _ = A.closed_form(a, L, k, Th, Tm, mode)
        tau = rng.uniform(-1, 1, 3) * np.array([roll, roll, yaw]) * rng.uniform(0.2, 1.5)
        out, s_rp, s_y, T = _thrusts(tau, a, L, k, Th, Tm, mode)
        B = A.layout(a, L, k)
        assert T.min() >= -1e-9 and T.max() <= Tm + 1e-9
        assert B[3:] @ T == pytest.approx(out, abs=1e-9)
        if mode == "hover":
            assert B[2] @ T == pytest.approx(4 * Th * np.cos(a), rel=1e-9)
        # maximal: 0.1% more of the scaled-down part leaves the polytope
        if s_rp < 1:
            bigger = tau.copy(); bigger[2] = 0; bigger[:2] *= s_rp + 1e-3
            assert not _feasible(bigger, a, L, k, Th, Tm, mode)
        if s_y < 1:
            bigger = out.copy(); bigger[2] = tau[2] * min(s_y + 1e-3, 1.0)
            assert not _feasible(bigger, a, L, k, Th, Tm, mode)


def _feasible(tau, a, L, k, Th, Tm, mode):
    kr, ky = A.arms(a, L, k)
    dT = A.thrust_change(tau, kr, ky)
    if mode == "free":
        return dT.max() - dT.min() <= Tm + 1e-12
    return (Th + dT).min() >= -1e-12 and (Th + dT).max() <= Tm + 1e-12


def test_pure_axis_requests_at_the_closed_form_limit_pass_unchanged():
    for a, L, k, Th, Tm in random_designs(40, seed=9):
        for mode in ("hover", "free"):
            roll, yaw, _ = A.closed_form(a, L, k, Th, Tm, mode)
            for tau in (np.array([roll, 0, 0]), np.array([0, -roll, 0]), np.array([0, 0, yaw])):
                out = _thrusts(tau * (1 - 1e-12), a, L, k, Th, Tm, mode)[0]
                assert out == pytest.approx(tau, rel=1e-9, abs=1e-12)


def test_box_mixer_is_the_milestone_1_simulator():
    x, g = np.full((3, 3), 0.5), np.full((3, 6), 0.5)
    for act in ("prior", "hover"):
        J0, _ = aero.score(x, g, 2, 0, actuator=act)
        J1, _ = aero.score(x, g, 2, 0, actuator=act, mixer="box", lam=0.0)
        assert np.array_equal(J0, J1)
