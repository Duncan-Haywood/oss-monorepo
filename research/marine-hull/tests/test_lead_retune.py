import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_lead_retune as lr  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_power_estimate_holdout as ph  # noqa: E402
import run_reserve_curve as rc  # noqa: E402

POINT, YEAR = "P+50", 2022


class LeadRetuneTests(unittest.TestCase):
    def test_lead45_column_reproduces_6zp(self):
        key = (5000.0, 50.0, POINT, YEAR)
        _, a = lr.score(key)
        _, b = pt.score(key)
        for tau in lr.TAUS:
            self.assertAlmostEqual(a[("K", tau, 45)][0], b[("K", tau)][0], places=6)
            self.assertAlmostEqual(a[("K", tau, 45)][1], b[("K", tau)][1], places=6)
        self.assertAlmostEqual(a[lr.BASE][0], b[pt.BASE][0], places=6)
        self.assertAlmostEqual(a[lr.BASE][1], b[pt.BASE][1], places=6)

    def test_targets_lead45_matches_6zp_target(self):
        hc = rc.climatology_wh(POINT, YEAR, years=lr.TRAIN)
        for cap, hotel in ((2500.0, 10.0), (ph.C, ph.HOTEL)):
            self.assertEqual(lr.targets(hc, cap, hotel)[45], pt.target(hc, cap, hotel))

    def test_longer_lead_never_lowers_target(self):
        hc = rc.climatology_wh(POINT, YEAR, years=lr.TRAIN)
        Ts = lr.targets(hc, 20000.0, 30.0)
        for a, b in zip(lr.LEADS, lr.LEADS[1:]):
            self.assertTrue(all(x <= y + 1e-9 for x, y in zip(Ts[a], Ts[b])))
            self.assertLessEqual(max(Ts[b]), 20000.0 + 1e-9)

    def test_selection_rule(self):
        tot = {g: (100.0, 50.0) for g in lr.GRID}
        tot[lr.BASE] = (100.0, 10.0)
        tot[("K", 20, 60)] = (108.0, 9.0)
        tot[("K", 10, 90)] = (115.0, 10.5)
        self.assertEqual(lr.select(tot), ("K", 20, 60))
        self.assertEqual(lr.select({g: (1.0, 20.0 + i) for i, g in enumerate(lr.GRID)} | {lr.BASE: (1.0, 5.0)}),
                         lr.GRID[0])


if __name__ == "__main__":
    unittest.main()
