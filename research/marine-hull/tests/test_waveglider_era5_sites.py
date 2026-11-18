"""Milestone 6x: ERA5 plan at the 2024 buoys, the corridor sites and an open-ocean grid."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
import run_waveglider_era5_sites as x  # noqa: E402


class WaveGliderEra5SitesTests(unittest.TestCase):
    def test_quantile_mean_matches_exact_mean_for_uniform_values(self):
        hours = [("t", 0.1 + 0.001 * i, 1.0) for i in range(400)]
        q = x.quantiles([hs / tm for _, hs, tm in hours])
        self.assertEqual(len(q), 20)
        self.assertAlmostEqual(x.km_quant(1.0, 1.0, q), x.km_exact(1.0, 1.0, hours), places=9)

    def test_spearman_handles_ties_and_order(self):
        self.assertAlmostEqual(x.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(x.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertEqual(x.ranks([5, 1, 5, 2]), [3.5, 1.0, 3.5, 2.0])

    def test_implied_ratio_is_one_when_site_matches_vehicle_calibration(self):
        self.assertAlmostEqual(x.implied_ratio(0.96, 1.285, 0.533, 0.96, 1.285), 1.0)
        # a period 7% shorter than on the vehicle side raises the plan by 1.07^a
        r = x.implied_ratio(0.96, 1.285 / 1.07, 0.533, 0.96, 1.285)
        self.assertAlmostEqual(r, 1.07 ** 0.533, places=12)

    def test_committed_data(self):
        cwd = os.getcwd()
        os.chdir(os.path.join(HERE, '..'))
        try:
            s = x.sites()
            g = x.grid()
        finally:
            os.chdir(cwd)
        self.assertEqual(len(s), 32)
        self.assertTrue(all(len(z["h"]) >= 500 for z in s.values()))
        self.assertEqual(sum(c["month"] == 1 for c in g), 371)
        self.assertEqual(sum(c["month"] == 7 for c in g), 364)
        self.assertTrue(all(c["q"] == sorted(c["q"]) and c["q"][0] > 0 and math.isfinite(c["q"][-1]) for c in g))


if __name__ == '__main__':
    unittest.main()
