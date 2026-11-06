import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import paired_multiplicity as pm


def test_pval_at_interval_edge_is_005():
    assert abs(pm.pval(1.96, 0.0, 3.92) - 0.05) < 1e-3


def test_holm_hand_count():
    # sorted p: .01 (<.05/4=.0125 yes), .02 (<.05/3=.0167 no) -> stop
    assert pm.holm([0.02, 0.01, 0.04, 0.5]) == [False, True, False, False]


def test_bh_hand_count():
    # thresholds .0125,.025,.0375,.05: .01 ok, .02 ok, .04 no(.0375), .5 no -> first two
    assert pm.bh([0.02, 0.01, 0.04, 0.5]) == [True, True, False, False]
