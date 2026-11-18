"""Milestone 30: backlash at the tool point."""
import math

import numpy as np

from buildbot_sheathing import backlash as B
from buildbot_sheathing import tool_lean as T


def _jac():
    rng = np.random.default_rng(4)
    return rng.normal(0, 0.3, (3, 7)), rng.normal(0, 1.0, (3, 7))


def test_general_offset_reduces_to_milestone_29():
    jp, jr = _jac()
    a = B.from_rows(jp, jr, 1e-3, 0.3)
    b = T.from_jacobian(jp, jr, 1e-3, 0.3)
    for x, y in ((a.y, b.y), (a.z, b.z)):
        assert math.isclose(x.s_surf, y.s_surf, rel_tol=1e-12)
        assert math.isclose(x.s_depth, y.s_depth, rel_tol=1e-12)
        assert math.isclose(x.rho, y.rho, rel_tol=1e-9)


def test_lateral_offset_lever_rule():
    # a joint that only rolls the hand about the push axis x: a grip offset r up moves the nose sideways by r
    jp = np.zeros((3, 1))
    jr = np.array([[1.0], [0.0], [0.0]])
    e = B.from_rows(jp, jr, 1e-3, 0.3, r=(0.0, 0.15))
    assert math.isclose(e.y.s_surf, 0.15e-3, rel_tol=1e-12) and e.z.s_surf < 1e-15


def test_joint_sigmas_add_uniform_gap_on_loose_joints_only():
    s = B.joint_sigmas(0.001, 0.012, [True, False])
    assert math.isclose(s[0], math.sqrt(0.001 ** 2 + 0.012 ** 2 / 12), rel_tol=1e-12)
    assert math.isclose(s[1], 0.001, rel_tol=1e-12)


def test_held_needs_one_sign_and_a_margin():
    h = B.held([1.0, -1.0, 0.1, 2.0], [3.0, 1.0, 0.3, 0.05], 0.2)
    assert h.tolist() == [True, False, False, False]


def test_uniform_draws_match_gaussian_model():
    jp, jr = _jac()
    loose = np.array([True] * 4 + [False] * 3)
    q, gap = 2e-3, 8e-3
    e = B.from_rows(jp, jr, B.joint_sigmas(q, gap, loose), 0.3)
    for lo, hi in ((-1e-3, 1e-3), (-2e-3, 0.5e-3)):
        u = B.p_window_uniform(lo, hi, jp, jr, q, gap, loose, 0.3, n=200000)
        g = T.p_window_exact(lo, hi, e.y)
        assert abs(u - g) < 0.01
