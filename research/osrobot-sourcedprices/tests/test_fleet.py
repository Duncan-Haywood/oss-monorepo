import unittest
from osrobot_sourcedprices import fleet as F


class T(unittest.TestCase):
    def setUp(self):
        self.old = F.configure()

    def tearDown(self):
        F.configure(*self.old)

    def test_defaults_reproduce_deadlineloss_cost(self):
        # osrobot-deadlineloss: 1 scout + 1 treater, 0.72 ha, 16 fields, no lateness = 13.92 USD/ha
        f, l, _ = F.pipeline_total(16, 0.72, 1, 1, 1e9, 2000, 2, 8)
        self.assertEqual(l, 0.0)
        self.assertAlmostEqual(f / (16 * 0.72), 13.92, places=2)

    def test_configure_changes_capital_only(self):
        f0, _, ms0 = F.pipeline_total(16, 0.72, 1, 1, 1e9, 0, 2, 8)
        F.configure(scout=F.CAP_SCOUT + 1000.0)
        f1, _, ms1 = F.pipeline_total(16, 0.72, 1, 1, 1e9, 0, 2, 8)
        self.assertEqual(ms0, ms1)
        self.assertAlmostEqual(f1 - f0, 1000.0 * F.ANNUAL * (ms0 / 60.0) / F.HOURS_YEAR)

    def test_shorter_endurance_means_more_swaps(self):
        a = F.scout_busy(1.62)
        F.configure(endurance=10.0)
        self.assertGreater(F.scout_busy(1.62), a)

    def test_hand_loss_one_stage(self):
        self.assertAlmostEqual(F.late_loss_usd(16 * 60, 0, 1.5, 1000, 2, 8), 0.02 * 1000 * 1.5)

    def test_zero_revenue_picks_cheapest_fleet(self):
        p = F.best_pipeline(16, 0.72, 4, 16, 0.0, 0.0, 2, 8)
        self.assertEqual((p[4], p[5]), (1, 1))

    def test_configure_returns_old(self):
        self.assertEqual(F.configure(inline=1.0), self.old)


if __name__ == "__main__":
    unittest.main()
