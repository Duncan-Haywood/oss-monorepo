import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_power_estimate_holdout as ph  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_speed_timing as sp  # noqa: E402

POINT, YEAR = "P+50", 2024


class PowerEstimateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sun = rc.year_sun(POINT, YEAR)
        cls.hc = rc.climatology_wh(POINT, YEAR)
        cls.T = sp.target(cls.hc)

    def test_matches_6zn_run_rule(self):
        for est, tau in (("L", 10), ("L30", 10), ("K", 10), ("K", 30), ("K", 60)):
            a = ph.run_est(self.sun, self.T, self.hc, est, tau)
            b = sp.run_rule(self.sun, self.T, est, hc=self.hc, tau=tau)
            self.assertAlmostEqual(a["km"], b["km"], places=6)
            self.assertEqual(a["down"], b["down"])
            self.assertAlmostEqual(a["dark"], b["dark"], places=6)

    def test_anomaly_scale_is_clipped_and_neutral_on_day_one(self):
        hc = [1000.0] * 40
        self.assertAlmostEqual(ph.power_estimate("KA", [0.0] * 40, hc, 0), 1000.0 / 24)
        self.assertAlmostEqual(ph.power_estimate("KA", [0.0] * 40, hc, 35), 500.0 / 24)
        self.assertAlmostEqual(ph.power_estimate("KA", [5000.0] * 40, hc, 35), 1500.0 / 24)
        self.assertAlmostEqual(ph.power_estimate("KA", [1100.0] * 40, hc, 35), 1100.0 / 24)

    def test_anomaly_equals_climatology_when_weather_is_climatology(self):
        h = [e for e in self.hc]
        for d in (1, 30, 200):
            self.assertAlmostEqual(ph.power_estimate("KA", h, self.hc, d), ph.power_estimate("K", h, self.hc, d))

    def test_selection_rule(self):
        tot = {g: (100.0, 50.0) for g in ph.GRID}
        tot[ph.BASE] = (100.0, 10.0)
        tot[("K", 30)] = (110.0, 10.0)
        tot[("K", 60)] = (120.0, 10.5)
        self.assertEqual(ph.select(tot), ("K", 30))
        tot = {g: (100.0, 50.0 + i) for i, g in enumerate(ph.GRID)}
        tot[ph.BASE] = (100.0, 1.0)
        tot[("KA", 90)] = (90.0, 2.0)
        self.assertEqual(ph.select(tot), ph.BASE)

    def test_strict_history_climatology_uses_only_the_pool(self):
        a = rc.climatology_wh(POINT, 2022, years=ph.TRAIN)
        b = rc.climatology_wh(POINT, 2023, years=ph.TRAIN)
        self.assertEqual(a[:59], b[:59])  # same five years for any test year (2022, 2023 not leap)
        self.assertNotEqual(a, rc.climatology_wh(POINT, 2022))


if __name__ == "__main__":
    unittest.main()
