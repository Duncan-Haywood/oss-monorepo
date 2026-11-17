"""Milestone 4u: rule U withholds on the old pool's 13-view f, the out-of-sample anchor is the third
pool's (or the other two's mean), and rule W is milestone 4t's withheld() at the fleet prior."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4u", os.path.join(HERE, "..", "experiments", "m4u_owncal", "analyse.py"))
m4u = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4u)

F13 = dict(A=520.0, B=530.0, C=540.0)


def test_anchors():
    assert m4u.own_anchor(F13, "B") == 530.0
    assert m4u.oos_anchor(F13, "A", "B") == 540.0 and m4u.oos_anchor(F13, "C", "A") == 530.0
    assert m4u.oos_anchor(F13, "A", "A") == 535.0


def test_rule_u_edges_and_scale():
    a = 530.0
    fo = np.array([a, a * 1.049, a * 1.051, a, a])
    fn = np.array([a, a, a, a * 1.049, a * 0.949])
    assert m4u.withheld(fo, fn, 1.0, a).tolist() == [False, False, True, False, True]
    # a 4% change on a new solve 1.5% high is withheld, on one 1.5% low it is not; symmetric about the anchor
    assert m4u.withheld(np.array([a, a]), np.array([a * 1.015, a * 0.985]), 1.04, a).tolist() == [True, False]
    assert m4u.withheld(np.array([a, a]), np.array([a * 0.985, a * 1.015]), 0.96, a).tolist() == [True, False]


def test_rule_w_matches_milestone_4t():
    rng = np.random.default_rng(0)
    fo, fn = m4u.F_P * (1 + 0.04 * rng.standard_normal(500)), m4u.F_P * (1 + 0.04 * rng.standard_normal(500))
    for s in (0.96, 1.0, 1.02):
        assert (m4u.withheld(fo, fn, s, m4u.F_P) == m4u.m4t.withheld(fo, fn, s)).all()
