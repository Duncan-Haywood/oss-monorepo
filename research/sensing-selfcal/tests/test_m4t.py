"""Milestone 4t: rule W withholds exactly when the old f or the scaled new f is more than 5% from the
fleet prior, and the fleet prior is milestone 4k's 527.1 px."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4t", os.path.join(HERE, "..", "experiments", "m4t_withhold", "analyse.py"))
m4t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4t)


def test_fleet_prior_is_milestone_4k_s():
    assert abs(m4t.F_P - 527.1) < 0.05 and m4t.WIN == 0.05


def test_rule_w_edges_and_scale():
    fp = m4t.F_P
    fo = np.array([fp, fp * 1.049, fp * 1.051, fp, fp, fp * 0.94])
    fn = np.array([fp, fp, fp, fp * 1.049, fp * 0.949, fp])
    assert m4t.withheld(fo, fn, 1.0).tolist() == [False, False, True, False, True, True]
    # the robot sees s * f_new: a 4% change on a new solve 2% high is withheld, on one 2% low it is not
    assert m4t.withheld(np.array([fp, fp]), np.array([fp * 1.02, fp * 0.98]), 1.04).tolist() == [True, False]
