import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_cross_source as cs  # noqa: E402
import run_era5_rules as er  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_level_season as L  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_subset_years as su  # noqa: E402


class LevelSeasonTests(unittest.TestCase):
    def setUp(self):
        self.p = "P+60"
        fy.load()
        self.saved = rc._SERIES.get(self.p)

    def tearDown(self):
        rc._SERIES.pop(self.p, None)
        if self.saved is not None:
            rc._SERIES[self.p] = self.saved
        fy._clim = cs._ORIG_CLIM
        er.clear_caches()

    def test_lc_matches_the_earlier_learned_ratios(self):
        c = L.corrections(self.p, "E", L.REAL)
        for g in L.LAGS:
            self.assertEqual(c[f"LC_{g}"], ly.learned(self.p, su.years_of("E", (g,)), L.REAL)[0])

    def test_level_and_shape_split(self):
        c = L.corrections(self.p, "L", L.REAL)
        r, lev = L.raw(self.p, su.years_of("L", (1,)), L.REAL)
        self.assertEqual(set(c["LM_1"]), {L.clamp(lev, L.NARROW)})
        for x, y in zip(c["LS_1"], r):
            self.assertAlmostEqual(x, L.clamp(y / lev, L.NARROW))
        for x in c["LW_1"]:
            self.assertTrue(L.WIDE[0] <= x <= L.WIDE[1])

    def test_reverse_plans_on_era5_and_sails_on_nasa(self):
        nasa_sun = sum(fy._sun(self.p, 2010)[0])
        er.use_era5((self.p,))
        era5_clim = fy._clim(self.p, 2010)
        er.clear_caches()
        L.use_reverse((self.p,))
        self.assertEqual(fy._clim(self.p, 2010), era5_clim)
        self.assertAlmostEqual(sum(fy._sun(self.p, 2010)[0]), nasa_sun)
        era5 = er.era5_series(json.load(open(er.ERA5_FILE))[self.p])
        self.assertNotAlmostEqual(sum(fy._sun(self.p, 2010)[0]),
                                  sum(era5[d.strftime("%Y%m%d")] for d in rc.dates(2010)), places=3)


if __name__ == "__main__":
    unittest.main()
