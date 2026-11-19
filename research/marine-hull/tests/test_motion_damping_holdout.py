"""Milestone 7zg: separate heave and pitch viscous damping, and the pinned motion-fit hold-out results."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_motion_damping_holdout.txt")
U = 0.2 * math.sqrt(st.G * 2.0)


class SplitDampingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, n_stations=12, n_panels=10)

    def test_default_pitch_fraction_equals_heave(self):
        self.h.set_viscous(0.03)
        a = (self.h.bv33, self.h.bv55)
        self.h.set_viscous(0.03, 0.03)
        self.assertEqual(a, (self.h.bv33, self.h.bv55))

    def test_pitch_fraction_only_moves_pitch_damping(self):
        self.h.set_viscous(0.03, 0.0)
        self.assertGreater(self.h.bv33, 0.0)
        self.assertEqual(self.h.bv55, 0.0)
        self.h.set_viscous(0.0, 0.03)
        self.assertEqual(self.h.bv33, 0.0)
        self.assertGreater(self.h.bv55, 0.0)

    def test_damping_is_linear_in_the_fraction(self):
        import run_motion_damping_holdout as md
        crit = md.critical(self.h)
        self.h.set_viscous(0.02, 0.05)
        b = (self.h.bv33, self.h.bv55)
        md.with_damping(self.h, crit, 0.02, 0.05)
        self.assertAlmostEqual(b[0] / self.h.bv33, 1.0, places=12)
        self.assertAlmostEqual(b[1] / self.h.bv55, 1.0, places=12)

    def test_pitch_damping_lowers_pitch_at_resonance(self):
        w = math.sqrt(2 * math.pi / (1.3 * 2.0) * st.G)
        self.h.set_viscous(0.0, 0.0)
        p0 = abs(self.h.response(w, U)[1])
        self.h.set_viscous(0.0, 0.10)
        self.assertLess(abs(self.h.response(w, U)[1]), p0)


class ResultsTests(unittest.TestCase):
    def test_pinned_results(self):
        txt = open(RESULTS).read()
        self.assertIn("best: zeta3 0.0375, zeta5 0.0000, SSE 0.4958", txt)
        self.assertIn("row fit plain 0.0375 0.0000 2.844 -4.18 -14.79 True", txt)
        self.assertIn("row fit A0 0.0000 0.0000 2.860 -4.20 -14.86 True", txt)
        self.assertIn("G3 plain hold-out area ratio 1.134 in 0.95-1.12: False", txt)
        self.assertIn("G6 200 W scope holds at both fits: True", txt)


if __name__ == "__main__":
    unittest.main()
