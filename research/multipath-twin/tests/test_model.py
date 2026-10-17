import math
import random
import unittest

from multipath_twin.model import (lobe_gain, detect_fraction, mean_gain, shift_disagreement, u_shift, r_crit, real_detect, u_of,
                                  indep_disagreement, brier_freespace, brier_ensemble, brier_band, meangain_detect, cfs,
                                  freespace_detect)

LAM, HR, HT, RFS = 0.03, 30.0, 100.0, 10000.0


def grid_fraction(c, n=100000):
    return sum(lobe_gain(math.pi * (i + 0.5) / n) >= c for i in range(n)) / n


class T(unittest.TestCase):
    def test_mean_gain_is_six(self):
        self.assertAlmostEqual(mean_gain(), 6.0, places=6)

    def test_peak_and_null(self):
        self.assertAlmostEqual(lobe_gain(math.pi / 2), 16.0)
        self.assertAlmostEqual(lobe_gain(0.0), 0.0)

    def test_detect_fraction_matches_grid(self):
        for c in (0.01, 0.5, 1.0, 3.0, 6.0, 12.0, 15.9):
            self.assertAlmostEqual(detect_fraction(c), grid_fraction(c), places=3)

    def test_edge_fraction_two_thirds(self):
        self.assertAlmostEqual(detect_fraction(1.0), 2 / 3, places=12)

    def test_detect_fraction_limits(self):
        self.assertEqual(detect_fraction(16.0), 0.0)
        self.assertEqual(detect_fraction(0.0), 1.0)

    def test_shift_disagreement_matches_grid(self):
        n = 40000
        for c in (1.0, 6.0, 12.0):
            for d in (0.05, 0.3, 0.8, 1.4):
                g = sum((lobe_gain(math.pi * (i + 0.5) / n) >= c) != (lobe_gain(math.pi * (i + 0.5) / n + d) >= c) for i in range(n)) / n
                self.assertAlmostEqual(shift_disagreement(c, d), g, places=3)

    def test_small_shift_linear(self):
        # 2 delta / pi while delta <= min(L, pi - L)
        self.assertAlmostEqual(shift_disagreement(1.0, 0.1), 2 * 0.1 / math.pi, places=12)

    def test_large_shift_reaches_independent_value_only_at_most_as_shift_grows(self):
        c = 1.0
        f = detect_fraction(c)
        self.assertLessEqual(max(shift_disagreement(c, d / 100) for d in range(0, 158)), 2 * min(f, 1 - f) + 1e-12)

    def test_r_crit_is_quarter_lobe(self):
        r = r_crit(HR, 0.5, LAM)
        self.assertAlmostEqual(u_shift(r, HR, 0.5, LAM), math.pi / 4, places=12)

    def test_u_shift_is_derivative_of_u(self):
        r = 7000.0
        self.assertAlmostEqual(u_of(r, HR, HT + 0.2, LAM) - u_of(r, HR, HT, LAM), u_shift(r, HR, 0.2, LAM), places=9)

    def test_freespace_detects_only_inside_but_real_misses_inside(self):
        miss = sum(freespace_detect(r, RFS) and not real_detect(r, HR, HT, LAM, RFS) for r in range(2000, 10001, 5))
        self.assertGreater(miss, 0)

    def test_real_detects_beyond_freespace_range(self):
        hit = sum(real_detect(r, HR, HT, LAM, RFS) for r in range(10100, 20000, 5))
        self.assertGreater(hit, 0)

    def test_nothing_beyond_twice_range(self):
        self.assertFalse(any(real_detect(r, HR, HT, LAM, RFS) for r in range(20001, 30000, 7)))

    def test_brier_ordering_at_edge(self):
        c = 1.0
        self.assertLess(brier_ensemble(c), brier_freespace(c))
        self.assertLess(brier_freespace(c), indep_disagreement(detect_fraction(c)))
        self.assertAlmostEqual(indep_disagreement(2 / 3), 4 / 9)

    def test_meangain_twin_range(self):
        self.assertTrue(meangain_detect(RFS * 6 ** 0.25, RFS))
        self.assertFalse(meangain_detect(RFS * 6 ** 0.25 * 1.001, RFS))
        self.assertAlmostEqual(cfs(RFS * 2, RFS), 16.0)

    def test_brier_band_exact_twin_is_zero(self):
        rs = [9000 + i for i in range(0, 2000, 7)]
        self.assertEqual(brier_band(rs, HR, HT, HT, 0.0, LAM, RFS), 0.0)


if __name__ == "__main__":
    unittest.main()
