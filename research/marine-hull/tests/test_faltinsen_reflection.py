"""Milestone 7zh: Faltinsen et al. (1980) waterline reflection term, and the pinned hold-out results."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import reflection as rf  # noqa: E402
from marine_hull import waves as wv  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_faltinsen_reflection.txt")


class ReflectionTests(unittest.TestCase):
    def test_parabolic_waterline_closed_form(self):
        l, b = 4.0, 0.4
        s1 = 2.0 * b / l
        exact = l * l / (2.0 * b) * (0.5 * s1 * s1 - 0.5 * math.log(1.0 + s1 * s1))
        self.assertAlmostEqual(rf.waterline_integral(rf.wigley_slope(l, b), l) / exact, 1.0, places=6)

    def test_blunt_bow_tends_to_beam(self):
        # a waterline that narrows very steeply over the last 1% of the half-length reflects like a wall: I -> B
        l, b = 2.0, 0.3
        slope = lambda x: -0.5 * b / (0.01 * l / 2) if x > 0.99 * l / 2 else 0.0
        self.assertAlmostEqual(rf.waterline_integral(slope, l, n=20000) / b, 1.0, places=2)

    def test_fine_bow_reflects_less_than_blunt(self):
        self.assertLess(rf.waterline_integral(rf.wigley_slope(4.0, 0.4), 4.0),
                        rf.waterline_integral(rf.modified_wigley_slope(4.0, 0.4), 4.0))

    def test_deep_draft_zero_speed_limit(self):
        # infinite draft, zero speed: 0.5 rho g I
        self.assertAlmostEqual(rf.rao(20.0, 0.0, 0.1, 50.0, rho=1000.0) / (0.5 * 1000.0 * 9.81 * 0.1), 1.0, places=6)

    def test_speed_factor_and_draft_factor(self):
        w, u = 5.0, 1.0
        a = rf.rao(w, u, 0.1, 0.2)
        b_ = rf.rao(w, u, 0.1, 0.2, speed=False)
        self.assertAlmostEqual(a / b_, 1.0 + 2.0 * w * u / 9.81, places=9)
        self.assertAlmostEqual(b_ / (0.5 * wv.RHO * 9.81 * 0.1), wv.reflection_ratio(w * w / 9.81 * 0.2), places=12)


class ResultsTests(unittest.TestCase):
    def test_pinned_results(self):
        txt = open(RESULTS).read()
        self.assertIn("I = 0.01551 m (I/B 0.0517", txt)
        self.assertIn("row kT,_speed 0.929 0.579 1.289", txt)
        self.assertIn("row strip+STAWAVE-2_refl 1.134 2.084 1.555", txt)
        self.assertIn("row Faltinsen_kT_speed 2.844 0.028 -3.39 -12.32 True", txt)
        self.assertIn("F6 200 W scope holds in every row: True", txt)


if __name__ == "__main__":
    unittest.main()
