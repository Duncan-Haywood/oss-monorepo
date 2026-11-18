import os
import statistics as st
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_amp_shrink_season as am  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_lat_prior_season as lp  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402


class LatPriorSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_bands_partition_the_30_points(self):
        n = {b: sum(lp.band(p) == b for p in bt.PTS) for b in lp.BANDS}
        self.assertEqual(n, {"low": 11, "mid": 10, "high": 9})
        self.assertEqual(lp.band("Florida-Straits"), "mid")
        self.assertEqual(lp.band("Gulf-of-Maine"), "mid")
        self.assertEqual(lp.band("North-Sea"), "high")
        self.assertEqual(lp.band("P-20"), "low")

    def test_band_prior_is_mean_of_band_excess(self):
        yrs = ly.learn_years("E", 1)
        for b in lp.BANDS:
            pts = [p for p in bt.PTS if lp.band(p) == b]
            ref = max(0.0, st.fmean(lp.excess(p, yrs, ls.REAL) for p in pts))
            self.assertAlmostEqual(lp.band_tau2(yrs, ls.REAL, b), ref, places=15)

    def test_line_prior_is_least_squares(self):
        yrs = ly.learn_years("L", 2)
        c0, c1 = lp.lat_line(yrs, ls.REAL)
        res = [lp.excess(p, yrs, ls.REAL) - (c0 + c1 * lp.abslat(p)) for p in bt.PTS]
        self.assertAlmostEqual(sum(res), 0.0, places=12)
        self.assertAlmostEqual(sum(r * lp.abslat(p) for r, p in zip(res, bt.PTS)), 0.0, places=10)

    def test_lap_matches_6zze(self):
        for p in ("A+60", "P-30", "A+0"):
            for hn in ("E", "L"):
                yrs = ly.learn_years(hn, 1)
                self.assertEqual(lp.corrections(p, yrs, ls.REAL)["LAP"], am.corrections(p, yrs, ls.REAL)["LAP"])

    def test_at90_and_lap_rows_reproduce_6zze(self):
        key = (5000.0, "P-30", 2006, 1.0, 0.0, 0)
        out = lp.score(key)[1]
        ref = am.score(key)[1]
        for g in ("AT_90", "LAP_1", "LAP_5", lp.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
