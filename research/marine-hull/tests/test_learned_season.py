import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_mean_seasonal_bias as ms  # noqa: E402


class LearnedSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_uncorrected_rules_reproduce_6zz(self):
        key = (5000.0, "A+40", 2008, 0.97, 0.03, 91)
        _, out = ls.score(key)
        _, ref = ms.score(key)
        for g in ("AT_90", "OR", "PS", ls.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)

    def test_interp_hits_month_midpoints_and_wraps(self):
        cm = tuple(1.0 + 0.01 * m for m in range(12))
        for m in range(12):
            self.assertAlmostEqual(ls.interp(cm, (m + 0.5) * 365.25 / 12), cm[m])
        self.assertAlmostEqual(ls.interp(cm, 0.0), 0.5 * (cm[11] + cm[0]))

    def test_learned_uses_other_half_and_tracks_the_bias(self):
        flat, mean_flat, _ = ls.learned("A+40", "E", ls.REAL)
        low, mean_low, _ = ls.learned("A+40", "E", (0.97, 0.0, 0))
        for a, b in zip(flat, low):
            self.assertAlmostEqual(b, min(ls.CLAMP[1], a / 0.97), places=9)
        self.assertAlmostEqual(mean_low, mean_flat / 0.97, places=9)
        self.assertEqual(ls.other("E"), "L")
        self.assertEqual(ls.other("L"), "E")

    def test_clamp_holds(self):
        for p in ("A+60", "P-60", "A+0"):
            for hn in ls.HALVES:
                cm, _, _ = ls.learned(p, hn, (1.03, 0.03, 0))
                self.assertTrue(all(ls.CLAMP[0] <= x <= ls.CLAMP[1] for x in cm))


if __name__ == "__main__":
    unittest.main()
