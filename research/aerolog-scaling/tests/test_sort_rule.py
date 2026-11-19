import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("sort_rule_test", os.path.join(HERE, "sort_rule.py"))
sr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sr)


def test_sort_bands_keeps_grouping_and_occupied_slots():
    lab = (0, 0, 2, 2, 4)
    b = np.array([3.0, 5.0, -1.0, 0.0, 1.0])
    out = sr.sort_bands(lab, b)
    # band means: slot0 4.0, slot2 -0.5, slot4 1.0 -> ascending onto slots 0, 2, 4
    assert out == (4, 4, 0, 0, 2)
    assert sorted(set(out)) == [0, 2, 4]
    assert sr.sort_bands(lab, b, descending=True) == (0, 0, 4, 4, 2)


def test_sigma_adj_uses_only_weighted_adjacent_pairs():
    b = np.array([0.0, 3.0, 10.0])
    lab = np.array([0, 1, 3])
    w = np.ones((3, 3)) - np.eye(3)
    # only (0,1) is one level apart: diff 3
    assert abs(sr.sigma_adj(b, lab, w, sigma_pair=4.0) - 5.0) < 1e-12
    w[0, 1] = w[1, 0] = 0.0
    assert sr.sigma_adj(b, lab, w, sigma_pair=4.0) == 4.0


def test_closed_form_picks_most_bands_that_clear_three_sigma():
    # spacings: k=3 24 m, k=4 17.14 m, k=5 13.33 m; Z = 7.62
    assert sr.closed_form({3: 1.0, 4: 1.0, 5: 1.0}) == 5          # 13.33 - 7.62 = 5.71 >= 3
    assert sr.closed_form({3: 1.0, 4: 2.0, 5: 2.0}) == 4          # 9.52 >= 6, 5.71 < 6
    assert sr.closed_form({3: 9.0, 4: 9.0, 5: 9.0}) == 3          # none clears: fewest bands


def test_h_of_k_on_grid():
    assert abs(sr.h_of_k(5) - 120.0 / 9) < 1e-6
    assert abs(sr.h_of_k(3) - 24.0) < 1e-6
