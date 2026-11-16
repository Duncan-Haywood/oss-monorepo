import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_era5_rules as er  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_reserve_curve as rc  # noqa: E402


class Era5RulesTests(unittest.TestCase):
    def test_era5_series_converts_mj_to_kwh_and_dates(self):
        s = er.era5_series({"start": "2005-01-01", "values": [3.6, 7.2, 0.0]})
        self.assertEqual(s, {"20050101": 1.0, "20050102": 2.0, "20050103": 0.0})

    def test_era5_file_covers_the_nine_points_and_twenty_years(self):
        data = json.load(open(er.ERA5_FILE))
        for p in ("P-60", "P-30", "P+50", "P+60", "A-50", "A+50", "A+60", "North-Sea", "Gulf-of-Alaska"):
            s = er.era5_series(data[p])
            self.assertIn("20050101", s)
            self.assertIn("20241231", s)
            self.assertEqual(len(s), 7305)

    def test_swap_reaches_a_series_already_cached(self):
        p = "P+60"
        fy.load()
        nasa = sum(fy._sun(p, 2010)[0])  # fills the cache with NASA first, as high_amp_points() does
        saved = rc._SERIES.get(p)
        try:
            er.use_era5((p,))
            era5 = sum(fy._sun(p, 2010)[0])
            want = er.era5_series(json.load(open(er.ERA5_FILE))[p])
            self.assertAlmostEqual(era5, sum(want[d.strftime("%Y%m%d")] for d in rc.dates(2010)))
            self.assertNotAlmostEqual(era5, nasa, places=3)
        finally:
            rc._SERIES.pop(p, None)
            if saved is not None:
                rc._SERIES[p] = saved
            er.clear_caches()

    def test_fallback_rules(self):
        B = er.BASE
        cells = {"k": {B: (1, 0, None), "AT_90": (10, 0, None)}}
        sides = {"k": {}}
        for g in er.LAGS:
            cells["k"][f"DG_{g}"] = (20 + g, 0, None)
            cells["k"][f"LC_{g}"] = (30 + g, 0, None)
            sides["k"][g] = "short" if g == 1 else "ok"
        er.fallback(cells, sides)
        self.assertEqual(cells["k"]["OA_1"], (21, 0, None))
        self.assertEqual(cells["k"]["OL_1"], (31, 0, None))
        self.assertEqual(cells["k"]["OA_2"], (10, 0, None))
        self.assertEqual(cells["k"]["OL_2"], (10, 0, None))

    def test_spearman(self):
        self.assertAlmostEqual(er.spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 1.0)
        self.assertAlmostEqual(er.spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1.0)
        self.assertEqual(er.ranks([7, 1, 7]), [2.5, 1.0, 2.5])


if __name__ == "__main__":
    unittest.main()
