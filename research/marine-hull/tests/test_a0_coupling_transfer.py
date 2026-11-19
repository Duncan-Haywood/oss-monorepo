"""Milestone 7zf: the no-added-mass-coupling rule (A35 = A53 = 0) and its pinned transfer results."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_a0_coupling_transfer.txt")
U = 0.2 * math.sqrt(st.G * 2.0)


class RuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, n_stations=12, n_panels=10)
        cls.h0 = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, n_stations=12, n_panels=10, table=cls.h.table,
                                        no_added_mass_coupling=True)

    def test_flag_equals_the_7ze_override(self):
        h = self.h
        cf = lambda we: (lambda c: (0.0, c[1], 0.0, c[3]))(h.cross_coupling(we, U))
        for lam in (0.8, 1.1, 1.6):
            w = math.sqrt(2 * math.pi / (lam * 2.0) * st.G)
            a = h.response(w, U, coupling=cf)
            b = self.h0.response(w, U)
            self.assertAlmostEqual(abs(a[0] - b[0]), 0.0, places=12)
            self.assertAlmostEqual(abs(a[1] - b[1]), 0.0, places=12)
            self.assertAlmostEqual(a[2] / b[2], 1.0, places=10)

    def test_rule_is_inert_at_zero_speed(self):
        w = math.sqrt(2 * math.pi / 2.2 * st.G)
        a, b = self.h.response(w, 0.0), self.h0.response(w, 0.0)
        self.assertAlmostEqual(abs(a[0] - b[0]), 0.0, places=6)

    def test_rule_lowers_heave_at_resonance(self):
        w = math.sqrt(2 * math.pi / (1.1 * 2.0) * st.G)
        self.assertLess(abs(self.h0.response(w, U)[0]), abs(self.h.response(w, U)[0]))


class ResultsTests(unittest.TestCase):
    def test_pinned_results(self):
        txt = open(RESULTS).read()
        self.assertIn("fitted zeta (mean): 0.0180", txt)
        self.assertIn("row fit plain 0.0250 1.000 2.409 1.74 0.725 -3.69 -13.30 True", txt)
        self.assertIn("row fit A0 0.0180 1.000 2.463 1.78 0.725 -3.75 -13.50 True", txt)
        self.assertIn("H5 A0 heave rms at fitted zeta 0.179 (<= 0.140): False", txt)
        self.assertIn("H6 200 W scope holds in every row: True", txt)


if __name__ == "__main__":
    unittest.main()
