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
import run_reserve_curve as rc  # noqa: E402


class CrossSourceTests(unittest.TestCase):
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

    def test_cross_keeps_nasa_climatology_and_swaps_the_sun(self):
        nasa_clim = cs._ORIG_CLIM(self.p, 2010)
        nasa_sun = sum(fy._sun(self.p, 2010)[0])
        cs.use_cross((self.p,))
        self.assertEqual(fy._clim(self.p, 2010), nasa_clim)
        want = er.era5_series(json.load(open(er.ERA5_FILE))[self.p])
        got = sum(fy._sun(self.p, 2010)[0])
        self.assertAlmostEqual(got, sum(want[d.strftime("%Y%m%d")] for d in rc.dates(2010)))
        self.assertNotAlmostEqual(got, nasa_sun, places=3)

    def test_era5_world_climatology_differs_from_frozen_nasa(self):
        nasa_clim = cs._ORIG_CLIM(self.p, 2010)
        er.use_era5((self.p,))
        self.assertNotAlmostEqual(sum(fy._clim(self.p, 2010)), sum(nasa_clim), places=1)

    def test_unfrozen_points_fall_through(self):
        cs.freeze_clim((self.p,))
        other = "North-Sea"
        self.assertEqual(fy._clim(other, 2010), cs._ORIG_CLIM(other, 2010))


if __name__ == "__main__":
    unittest.main()
