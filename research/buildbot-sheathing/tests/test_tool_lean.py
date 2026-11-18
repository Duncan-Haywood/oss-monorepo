"""Milestone 29: the nailer's length and the nail's lean."""
import math

import numpy as np

from buildbot_sheathing import tack as K
from buildbot_sheathing import tool_lean as T

MM = 1e-3


def test_depth_check_is_sheathing_plus_ten_diameters():
    assert math.isclose(T.DEPTH_CHECK, (7 / 16 + 10 * 0.131) * 0.0254, rel_tol=1e-12)


def test_jacobian_lever_rule_and_hand_point_limit():
    # one joint that only rotates the hand about z by 1 rad: the nose moves L, the depth point L + D
    jp = np.zeros((3, 2))
    jr = np.zeros((3, 2))
    jr[2, 0] = 1.0
    jp[1, 1] = 1.0                       # a second joint that only translates along y
    e = T.from_jacobian(jp, jr, 1e-3, 0.3)
    assert math.isclose(e.y.s_surf, 1e-3 * math.hypot(1.0, 0.3), rel_tol=1e-12)
    assert math.isclose(e.y.s_depth, 1e-3 * math.hypot(1.0, 0.3 + T.DEPTH_CHECK), rel_tol=1e-12)
    # with L = 0 and depth 0 the model is the hand point (buildbot-fasten)
    e0 = T.from_jacobian(jp, jr, 1e-3, 0.0, depth=0.0)
    assert math.isclose(e0.y.s_surf, 1e-3, rel_tol=1e-12) and math.isclose(e0.y.rho, 1.0, rel_tol=1e-12)


def test_correlated_draw_matches_bivariate_normal():
    e = T.ToolError(T.AxisError(1.0 * MM, 1.4 * MM, 0.6), T.AxisError(1 * MM, 1 * MM, 1.0))
    for lo, hi in ((-1 * MM, 1 * MM), (-2 * MM, 0.5 * MM)):
        assert abs(T.p_window(lo, hi, e) - T.p_window_exact(lo, hi, e.y)) < 0.004


def test_lean_moves_only_the_depth_point():
    e = T.point_model(0.0, s_lean=math.radians(1.0))
    s, d = e.draw(np.random.default_rng(1), 200000)
    assert np.all(s == 0)
    assert math.isclose(float(np.std(d)), T.DEPTH_CHECK * math.radians(1.0), rel_tol=0.01)


def test_point_model_through_new_path_matches_old_path():
    kw = dict(trials=40000, policy="three", s_read=0.5 * MM, s_edge=0.5 * MM, s_x=0.5 * MM)
    old = K.simulate(seed=3, s_robot=0.9 * MM, **kw)["clean"]
    new = K.simulate(seed=3, tool=T.point_model(0.9 * MM), **kw)["clean"]
    se = math.sqrt(old * (1 - old) / 40000)
    assert abs(old - new) < 4 * math.sqrt(2) * se


def test_lean_only_costs_clean_sheets():
    kw = dict(trials=20000, seed=5, policy="three")
    a = K.simulate(tool=T.point_model(0.9 * MM), **kw)["clean"]
    b = K.simulate(tool=T.point_model(0.9 * MM, math.radians(2.0)), **kw)["clean"]
    assert b < a - 0.05
