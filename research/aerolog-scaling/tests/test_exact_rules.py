import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("exact_rules_test", os.path.join(HERE, "exact_rules.py"))
er = importlib.util.module_from_spec(spec)
spec.loader.exec_module(er)


def test_h_exact_is_on_the_new_grid_and_has_k_bands():
    for k in range(2, 13):
        h = er.h_exact(k)
        assert h in er.NEW
        assert er.eg.kcap(h, 16) == k
        if k != 9:
            assert abs(h - er.H / (2 * k - 1)) < 1e-5


def test_six_band_spacing_is_reachable_for_the_closed_form():
    assert er.eg.kcap(er.h_exact(6), 16) == 6


class _Toy:
    """A PairProblem stand-in: F = number of operators not in band 0, plus a pair table of zeros."""

    def __init__(self, m, k):
        self.m, self.k = m, k

    def _pair_table(self):
        return np.zeros((self.m, self.m, self.k, self.k))

    def score(self, lab):
        return float(sum(1 for x in lab if x != 0))

    def descend(self, lab):
        return tuple(0 for _ in lab)


def test_rules_at_reports_every_rule_and_random_curve_is_nested():
    m, k = 5, 3
    out, ls = er.rules_at(_Toy(m, k), (2, 1, 0, 2, 1), np.arange(m, dtype=float), np.ones(m), k, m,
                          np.random.default_rng(0))
    for r_ in er.RULES:
        assert r_ in out
    assert out["sdesc"] == 0.0 and out["gdesc"] == 0.0
    curve = [out["rand_%d" % R] for R in er.RS]
    assert curve == sorted(curve, reverse=True)
    assert sorted(set(ls)) == [0, 1, 2]


def test_old_grid_reference_values_cover_the_predicted_rules():
    for cell in er.OLD_GRID.values():
        for r_ in ("sort", "sdesc", "goff", "blind", "rand_10"):
            assert r_ in cell


def test_closed_form_takes_most_bands_that_pass_three_sigma():
    sig = {4: 2.0, 5: 1.8, 6: 1.2}
    # 6 bands: 10.91 - 7.62 = 3.29 < 3.6; 5 bands: 13.33 - 7.62 = 5.71 > 5.4
    assert er.closed_form(sig, 16) == 5
    assert er.closed_form({4: 9.0, 5: 9.0}, 16) == 4
    assert er.closed_form({5: 1.8, 6: 1.09}, 16) == 6
