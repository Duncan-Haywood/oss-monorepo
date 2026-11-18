"""Milestone 34: elastic windup under the press (free and stuck nose, the stick test, the scatter)."""
import math

import numpy as np

from buildbot_sheathing import windup as WU
from buildbot_sheathing.tool_lean import AxisError, ToolError


def _rows(seed, n=6):
    rng = np.random.default_rng(seed)
    return rng.normal(size=(3, n)), rng.normal(size=(3, n))


def test_free_windup_is_minus_tau_over_k():
    assert np.allclose(WU.free_windup([2.0, -1.0], 1e4), [-2e-4, 1e-4])
    assert np.allclose(WU.free_windup([2.0, -1.0], [1e4, 2e4]), [-2e-4, 5e-5])


def test_stuck_nose_does_not_translate_and_only_rotates():
    jp, jr = _rows(0)
    A, B = WU.nose_rows(jp, jr, 0.3)
    dtau = np.random.default_rng(1).normal(size=6)
    dq, lam = WU.stuck_windup(dtau, 1e4, A)
    assert np.allclose(A[1:3] @ dq, 0, atol=1e-15) and len(lam) == 2
    # the depth point moves by the tool's rotation times the depth, and only that
    o = WU.offsets(A, B, dq)
    assert abs(o["y"][0]) < 1e-15 and abs(o["y"][1]) > 0


def test_reaction_is_independent_of_a_common_stiffness_and_the_energy_is_minimal():
    jp, jr = _rows(2)
    A, _ = WU.nose_rows(jp, jr, 0.3)
    dtau = np.random.default_rng(3).normal(size=6)
    dq1, l1 = WU.stuck_windup(dtau, 3e3, A)
    dq2, l2 = WU.stuck_windup(dtau, 1e5, A)
    assert np.allclose(l1, l2)
    assert np.allclose(dq1 * 3e3, dq2 * 1e5)
    # dq minimises 1/2 k |dq|^2 + dtau . dq subject to A dq = 0: a random feasible step does not lower it
    k = 1e4
    dq, _ = WU.stuck_windup(dtau, k, A)
    N = np.linalg.svd(A[1:3])[2][2:].T
    f = lambda q: 0.5 * k * q @ q + dtau @ q  # noqa: E731
    for s in np.random.default_rng(4).normal(size=(20, N.shape[1])):
        assert f(dq + 1e-5 * N @ s) >= f(dq) - 1e-15


def test_stick_test_and_scatter_variance():
    assert WU.sticks(np.array([3.0, 4.0]), 25.0, 0.2)        # 5 <= 0.2 * 25
    assert not WU.sticks(np.array([3.0, 4.0]), 20.0, 0.2)
    e = ToolError(AxisError(1e-3, 2e-3, 0.5), AxisError(1e-3, 1e-3, 1.0))
    w = WU.with_scatter(e, {"y": (0.0, 0.0), "z": (math.sqrt(12) * 1e-3, math.sqrt(12) * 1e-3)})
    assert w.y == e.y
    assert np.isclose(w.z.s_surf, math.sqrt(2) * 1e-3) and np.isclose(w.z.rho, 1.0)


def test_friction_limited_slides_the_unheld_fraction():
    jp, jr = _rows(5)
    A, _ = WU.nose_rows(jp, jr, 0.3)
    dtau = np.random.default_rng(6).normal(size=6)
    _, lam = WU.stuck_windup(dtau, 1e4, A)
    r = float(np.hypot(*lam))
    dq, s = WU.friction_limited(dtau, 1e4, A, 10 * r)
    assert s == 1.0 and np.allclose(A[1:3] @ dq, 0, atol=1e-15)
    dq, s = WU.friction_limited(dtau, 1e4, A, r / 4)
    assert np.isclose(s, 0.25)
    assert np.allclose(A[1:3] @ dq, 0.75 * A[1:3] @ WU.free_windup(dtau, 1e4))
