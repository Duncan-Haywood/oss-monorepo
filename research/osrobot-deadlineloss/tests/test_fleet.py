import unittest
from osrobot_deadlineloss import fleet as F


class T(unittest.TestCase):
    def test_on_time_has_no_loss(self):
        self.assertEqual(F.late_loss_usd(100, 200, 1.0, 1000, 2, 8), 0.0)

    def test_hand_loss_one_stage(self):
        # 16 working hours late = 2 days = one stage of 2 days -> 2% of 1000 USD/ha on 1.5 ha
        self.assertAlmostEqual(F.late_loss_usd(16 * 60, 0, 1.5, 1000, 2, 8), 0.02 * 1000 * 1.5)

    def test_loss_capped_at_revenue(self):
        self.assertAlmostEqual(F.late_loss_usd(1e9, 0, 2.0, 500, 1, 8), 1000.0)

    def test_inline_finishes_hand_value(self):
        f = F.inline_finishes(4, 0.18, 2)
        self.assertAlmostEqual(f[-1], 2 * F.inline_busy(0.18))
        self.assertEqual(len(f), 4)

    def test_single_field_pipeline(self):
        self.assertAlmostEqual(F.pipeline_finishes(1, 0.18, 3, 3)[0], F.scout_busy(0.18) + F.treater_busy(0.18))

    def test_loose_window_equals_hard_deadline_project_cost(self):
        # no lateness: fleet cost 1 scout + 1 treater, 0.72 ha, 16 fields = 13.92 USD/ha (osrobot-deadline, osrobot-pipeline)
        f, l, _ = F.pipeline_total(16, 0.72, 1, 1, 1e9, 2000, 2, 8)
        self.assertEqual(l, 0.0)
        self.assertAlmostEqual(f / (16 * 0.72), 13.92, places=2)

    def test_zero_revenue_picks_cheapest_fleet(self):
        p = F.best_pipeline(16, 0.72, 4, 16, 0.0, 0.0, 2, 8)
        self.assertEqual((p[4], p[5]), (1, 1))


if __name__ == "__main__":
    unittest.main()
