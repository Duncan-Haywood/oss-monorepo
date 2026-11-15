"""Tests for milestone 6zzm (experiments/run_lag3_era5.py): NASA POWER against ERA5 for the lag-3 learning year."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_lag3_era5 as le  # noqa: E402


class Lag3Era5Test(unittest.TestCase):
    def test_pearson(self):
        self.assertAlmostEqual(le.pearson([1, 2, 3], [2, 4, 6]), 1.0)
        self.assertAlmostEqual(le.pearson([1, 2, 3], [3, 2, 1]), -1.0)

    def test_lag_error_is_zero_for_a_flat_record(self):
        an = {yr: [0.1] * 12 for yr in le.YEARS}
        for hn in le.HALVES:
            for g in le.LAGS:
                self.assertEqual(le.lag_error(an, hn, g), [0.0] * 12)

    def test_lag3_years(self):
        an = {yr: [float(yr)] * 12 for yr in le.YEARS}
        self.assertAlmostEqual(le.lag_error(an, "L", 3)[0], 2007 - 2012)
        self.assertAlmostEqual(le.lag_error(an, "E", 3)[0], 2012 - 2007)

    def test_profiles_from_both_sources(self):
        P = le.load()
        for S in ("NASA", "ERA5"):
            for p in le.HI:
                an, w, tot = P[S][p]
                self.assertEqual(sorted(an), list(le.YEARS))
                self.assertAlmostEqual(sum(w), 1.0)
                self.assertGreater(tot, 0)
                # anomalies of the 2015-2024 base would average zero; 2005-2014 ones stay modest
                self.assertTrue(all(-0.9 < a < 2.0 for yr in le.YEARS for a in an[yr]))


if __name__ == "__main__":
    unittest.main()
