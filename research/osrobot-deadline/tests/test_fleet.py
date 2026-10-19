import unittest
from pathlib import Path
from osrobot_deadline import fleet as F


class T(unittest.TestCase):
    def test_one_scout_matches_serial_floor(self):
        n, ha = 8, 0.72
        self.assertAlmostEqual(F.floor_minutes(n, ha, 1), n * F.scout_busy(ha) + F.treater_busy(ha))

    def test_more_scouts_never_slow_the_floor(self):
        f = [F.floor_minutes(16, 0.72, s) for s in (1, 2, 3, 4)]
        self.assertTrue(all(a >= b - 1e-9 for a, b in zip(f, f[1:])))

    def test_single_field_is_scout_then_treater(self):
        self.assertAlmostEqual(F.pipeline_makespan(1, 0.18, 3, 3), F.scout_busy(0.18) + F.treater_busy(0.18))

    def test_inline_hand_value(self):
        self.assertAlmostEqual(F.inline_makespan(5, 0.18, 2), 3 * F.inline_busy(0.18))

    def test_infeasible_deadline_returns_none(self):
        self.assertIsNone(F.cheapest_pipeline(16, 0.72, 60.0, 4))
        self.assertIsNone(F.cheapest_inline(16, 1.62, 60.0))

    def test_result_meets_deadline_and_is_cheapest(self):
        d = 12 * 60
        usd, ms, s, k = F.cheapest_pipeline(16, 0.72, d, 4)
        self.assertLessEqual(ms, d + 1e-9)
        for s2 in range(1, 5):
            for k2 in range(1, 17):
                u2, m2 = F.pipeline_cost(16, 0.72, s2, k2)
                if m2 <= d + 1e-9:
                    self.assertGreaterEqual(u2, usd - 1e-6)

    def test_loose_deadline_reduces_to_pipeline_project(self):
        # one scout, one treater, 16 fields at 0.72 ha: osrobot-pipeline reports 13.92 USD/ha
        usd, _, s, k = F.cheapest_pipeline(16, 0.72, 1e6, 1)
        self.assertEqual((s, k), (1, 1))
        self.assertAlmostEqual(usd / (16 * 0.72), 13.92, places=2)

    def test_results_file_matches_code(self):
        txt = (Path(__file__).resolve().parents[1] / "experiments" / "results.txt").read_text()
        self.assertIn("# Sweep 1", txt)
        usd, *_ = F.cheapest_inline(16, 0.72, 4 * 60)
        self.assertIn(f"{usd / (16 * 0.72):.2f}", txt)


if __name__ == "__main__":
    unittest.main()
