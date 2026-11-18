"""Milestone 38: the squeeze's direction, its generalised force and the controller's choice of squeeze."""
import numpy as np

from buildbot_sheathing import squeeze as SQZ

TF = 0.2


def test_direction_is_the_unit_vector_from_right_to_left():
    u = SQZ.direction([0.4, 0.18, 1.0], [0.4, -0.18, 1.0])
    assert np.allclose(u, [0.0, 1.0, 0.0])


def test_a_collinear_force_pair_has_no_net_force_or_moment_on_a_free_body():
    # a rigid body's base columns of a point Jacobian are [I, -skew(p)]: the pair along p_l - p_r cancels
    def jac(p):
        p = np.asarray(p, float)
        sk = np.array([[0, -p[2], p[1]], [p[2], 0, -p[0]], [-p[1], p[0], 0]])
        return np.hstack([np.eye(3), -sk])
    pl, pr = [0.4, 0.2, 1.1], [0.35, -0.2, 0.9]
    g = SQZ.generalised(jac(pl), jac(pr), SQZ.direction(pl, pr))
    assert np.allclose(g, 0.0, atol=1e-12)


def test_best_squeeze_moves_joints_away_from_the_threshold_within_limits():
    lo = np.array([0.21, -0.19, 5.0])
    hi = np.array([0.22, -0.18, 5.0])
    a = np.array([0.01, -0.02, 0.0])                # per newton: |tau| of both joints rises with s > 0
    s, mg = SQZ.best_squeeze(lo, hi, a, [0, 1], TF, 20.0, np.full(3, 25.0))
    assert s == 20.0 and np.isclose(mg, 0.21)        # both pushed well above tau_f; joint 2 is not chosen
    s0, mg0 = SQZ.best_squeeze(lo, hi, a, [0, 1], TF, 0.0, np.full(3, 25.0))
    assert s0 == 0.0 and np.isclose(mg0, 0.01)       # S = 0: the margin as planned
    lim = np.array([0.3, 25.0, 25.0])                # a tight limit on joint 0 keeps it at 0.3 N m or less
    s1, mg1 = SQZ.best_squeeze(lo, hi, a, [0, 1], TF, 20.0, lim)
    assert max(abs(lo[0] + a[0] * s1), abs(hi[0] + a[0] * s1)) <= 0.3 + 1e-12
    assert 0.01 < mg1 < 0.21


def test_ties_go_to_the_smallest_squeeze():
    lo = hi = np.array([1.0, 1.0])
    s, mg = SQZ.best_squeeze(lo, hi, np.zeros(2), [0, 1], TF, 10.0, np.full(2, 25.0))
    assert s == 0.0 and np.isclose(mg, 0.8)
