import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_mean_seasonal_bias as ms  # noqa: E402


class MeanSeasonalBiasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_scale_averages_to_s0_and_peaks_at_phase(self):
        for s0 in ms.MEANS:
            for f in ms.PHASES:
                self.assertAlmostEqual(ms.scale(f, s0, ms.AMP, f), s0 * (1 + ms.AMP))
                mean = sum(ms.scale(d, s0, ms.AMP, f) for d in range(365)) / 365
                self.assertAlmostEqual(mean, s0, delta=1e-3)

    def test_flat_shape_reproduces_6zx_at_s0(self):
        for s0 in (0.97, 1.03):
            key = (5000.0, "A+40", 2008)
            _, flat = ms.score(key + (s0, 0.0, 0))
            _, ref, _ = fy.score(key + (s0,))
            for g in ms.RULES + (ms.BASE,):
                self.assertAlmostEqual(flat[g][0], ref[g][0], places=9)
                self.assertAlmostEqual(flat[g][1], ref[g][1], places=9)

    def test_harmonic_recovers_a_known_cosine(self):
        for amp, peak_month in ((0.02, 0), (0.05, 6)):
            rm = [1.1 * (1 + amp * math.cos(2 * math.pi * (i - peak_month) / 12)) for i in range(12)]
            a, pk = ms.harmonic(rm)
            self.assertAlmostEqual(a, amp, places=6)
            expect = ((peak_month + 0.5) / 12 * 365.25) % 365.25
            self.assertAlmostEqual(pk, expect, delta=0.5)

    def test_measured_covers_every_point_with_sane_ratios(self):
        M = ms.measured()
        self.assertEqual(len(M), 30)
        for a, pk, mr, mx in M.values():
            self.assertGreaterEqual(a, 0.0)
            self.assertTrue(0 <= pk < 365.25)
            self.assertTrue(0.9 < mr < 1.1)
            self.assertGreaterEqual(mx, a * 0.5)


if __name__ == "__main__":
    unittest.main()
