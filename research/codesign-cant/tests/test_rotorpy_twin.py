"""Milestone 5: the canted-rotor RotorPy wrench. Skipped where RotorPy is not installed (pip install rotorpy==3.0.0)."""
import os
import sys

import numpy as np
import pytest

pytest.importorskip("rotorpy")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from rotorpy.vehicles.multirotor import Multirotor  # noqa: E402
from codesign_cant import aero, allocation, rotorpy_twin as RT  # noqa: E402


def _design(alpha_deg, L=0.15, D=0.15):
    sz = aero.size(np.array([L]), np.array([D]), np.array([np.deg2rad(alpha_deg)]), 0.0, 0.081, None, "hover")
    prm = RT.design_params(sz, 0, 0.081 * D)
    q = {k: v for k, v in prm.items() if k not in ("alpha", "L", "kappa")}
    return sz, prm, q


@pytest.mark.parametrize("aero_on", [False, True])
def test_uncanted_wrench_equals_rotorpy(aero_on):
    sz, prm, q = _design(0.0)
    B = allocation.layout(0.0, prm["L"], prm["kappa"])
    mine = RT.CantedMultirotor(q, B[:3].T.copy(), aero=aero_on)
    ref = Multirotor(q, aero=aero_on)
    rng = np.random.default_rng(3)
    for _ in range(20):
        w, ws, va = rng.normal(size=3), rng.uniform(500, 3000, 4), rng.normal(scale=4, size=3)
        F1, M1 = mine.compute_body_wrench(w, ws, va)
        F2, M2 = ref.compute_body_wrench(w, ws, va)
        assert np.allclose(F1, F2, atol=1e-12) and np.allclose(M1, M2, atol=1e-12)


@pytest.mark.parametrize("alpha_deg", [0.0, 20.0, 35.0, 60.0])
def test_hover_thrust_balances_weight_with_no_torque_or_side_force(alpha_deg):
    sz, prm, q = _design(alpha_deg)
    B = allocation.layout(prm["alpha"], prm["L"], prm["kappa"])
    veh = RT.CantedMultirotor(q, B[:3].T.copy(), aero=False)
    w_h = np.sqrt(sz["T_hover"][0] / prm["k_eta"])
    F, M = veh.compute_body_wrench(np.zeros(3), np.full(4, w_h), np.zeros(3))
    assert np.isclose(F[2], prm["mass"] * aero.G, rtol=1e-9)
    assert np.allclose(F[:2], 0, atol=1e-9) and np.allclose(M, 0, atol=1e-9)


@pytest.mark.parametrize("alpha_deg", [10.0, 35.0])
def test_thrust_change_delivers_the_mixed_torque(alpha_deg):
    sz, prm, q = _design(alpha_deg)
    B = allocation.layout(prm["alpha"], prm["L"], prm["kappa"])
    veh = RT.CantedMultirotor(q, B[:3].T.copy(), aero=False)
    tau = np.array([0.05, -0.03, 0.02])
    kr, ky = allocation.arms(prm["alpha"], prm["L"], prm["kappa"])
    T = sz["T_hover"][0] + allocation.thrust_change(tau[None], kr, ky)[0]
    F, M = veh.compute_body_wrench(np.zeros(3), np.sqrt(T / prm["k_eta"]), np.zeros(3))
    assert np.allclose(M, tau, atol=1e-10)
    assert np.isclose(F[2], prm["mass"] * aero.G, rtol=1e-9)


def test_frame_drag_torque_at_centre_of_pressure():
    sz, prm, q = _design(0.0)
    B = allocation.layout(0.0, prm["L"], prm["kappa"])
    h = 0.1
    a = RT.CantedMultirotor(q, B[:3].T.copy(), h_cp=h, aero=True)
    b = RT.CantedMultirotor(q, B[:3].T.copy(), h_cp=0.0, aero=True)
    va = np.array([3.0, -2.0, 0.0])
    (Fa, Ma), (Fb, Mb) = a.compute_body_wrench(np.zeros(3), np.full(4, 1500.0), va), b.compute_body_wrench(np.zeros(3), np.full(4, 1500.0), va)
    Dv = -np.linalg.norm(va) * (a.drag_matrix @ va)
    assert np.allclose(Fa, Fb) and np.allclose(Ma - Mb, np.cross([0, 0, h], Dv))
