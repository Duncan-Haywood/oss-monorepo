import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("leak_budget_test", os.path.join(HERE, "leak_budget.py"))
lb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lb)


def test_p0_is_the_three_sigma_tail():
    assert abs(lb.P0 - 0.0013499) < 1e-6
    assert lb.P0 in lb.P_GRID


def test_adj_leak_equal_offsets_is_the_pair_noise_leak():
    w = np.ones((3, 3))
    h = 13.333
    got = lb.adj_leak([1.0, 1.0, 1.0], (0, 1, 2), w, h)
    assert abs(got - lb.rc.p_leak(0.0, lb.SIGMA_PAIR, h)) < 1e-12


def test_adj_leak_weights_only_adjacent_cross_pairs():
    b = [0.0, 5.0, 0.0]
    w = np.array([[0, 1, 0], [1, 0, 3], [0, 3, 0]], float)
    h = 13.333
    p5 = 0.5 * (lb.rc.p_leak(5.0, lb.SIGMA_PAIR, h) + lb.rc.p_leak(-5.0, lb.SIGMA_PAIR, h))
    # pairs (0,1) and (1,2) adjacent, both |d| = 5; pair (0,2) two levels apart is ignored
    assert abs(lb.adj_leak(b, (0, 1, 2), w, h) - p5) < 1e-12
    # with nothing adjacent the zero-offset leak is returned
    assert abs(lb.adj_leak(b, (0, 0, 0), w, h) - lb.rc.p_leak(0.0, lb.SIGMA_PAIR, h)) < 1e-12


def test_budget_rule_takes_most_bands_within_budget():
    leak = {2: 0.0, 3: 0.001, 4: 0.02, 5: 0.08}
    assert lb.budget_rule(leak, 0.00135) == 3
    assert lb.budget_rule(leak, 0.05) == 4
    assert lb.budget_rule(leak, 1.0) == 5
    assert lb.budget_rule({3: 0.5, 4: 0.6}, 0.1) == 3


def test_calibrate_maximises_agreement_ties_to_smaller_budget():
    rows = [{"k_aware": 4, "leak_by_k": {"3": 0.0, "4": 0.02, "5": 0.08}},
            {"k_aware": 5, "leak_by_k": {"3": 0.0, "4": 0.001, "5": 0.04}}]
    p = lb.calibrate(rows)
    # both agree for 0.04 <= p < 0.08; the smallest such budget on the grid is 0.05
    assert lb.agree(rows, p) == 2 and p == 0.05
