import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_pack_hotel_tau as pt  # noqa: E402
import run_power_estimate_holdout as ph  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_speed_timing as sp  # noqa: E402
import run_year_pack as yp  # noqa: E402

POINT, YEAR = "P+50", 2022


class PackHotelTauTests(unittest.TestCase):
    def test_central_config_reproduces_6zo(self):
        _, a = pt.score((ph.C, ph.HOTEL, POINT, YEAR))
        _, b = ph.score((POINT, YEAR, ph.TRAIN))
        for g in (("L", 10), ("K", 20), ("K", 90)):
            self.assertAlmostEqual(a[g][0], b[g][0], places=6)
            self.assertAlmostEqual(a[g][1], b[g][1], places=6)

    def test_target_matches_6zm_at_central_config(self):
        hc = rc.climatology_wh(POINT, YEAR, years=pt.TRAIN)
        self.assertEqual(pt.target(hc, ph.C, ph.HOTEL), sp.target(hc))

    def test_target_scales_with_pack(self):
        hc = rc.climatology_wh(POINT, YEAR, years=pt.TRAIN)
        for cap in pt.PACKS:
            T = pt.target(hc, cap, 30.0)
            self.assertGreaterEqual(min(T), 0.5 * cap - 1e-9)
            self.assertLessEqual(max(T), cap + 1e-9)

    def test_foresight_grid_default_unchanged(self):
        sun = rc.year_sun(POINT, YEAR)
        table = yp.prop_table()
        a = sp.foresight_acct(sun, table, end_min=0.5 * ph.C)
        b = sp.foresight_acct(sun, table, end_min=0.5 * ph.C, grid=ph.C / 100.0)
        self.assertAlmostEqual(a["km"], b["km"], places=6)
        self.assertAlmostEqual(a["dark"], b["dark"], places=6)

    def test_storage_days_and_selection(self):
        self.assertAlmostEqual(pt.storage_days(10000.0, 30.0), 10000.0 / 720.0)
        tot = {g: (100.0, 50.0) for g in pt.GRID}
        tot[pt.BASE] = (100.0, 10.0)
        tot[("K", 45)] = (108.0, 9.0)
        tot[("K", 60)] = (112.0, 10.5)
        self.assertEqual(pt.select(tot, pt.KGRID), ("K", 45))


if __name__ == "__main__":
    unittest.main()
