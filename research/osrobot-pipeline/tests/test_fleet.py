import re
import unittest
from pathlib import Path
from osrobot_pipeline import fleet as F


class T(unittest.TestCase):
    def test_single_field_makespan_is_scout_then_treater(self):
        self.assertAlmostEqual(F.pipeline_makespan(1, 0.72, 1), F.scout_busy(0.72) + F.treater_busy(0.72))

    def test_many_fields_one_treater_is_treater_bound_when_treater_slower(self):
        n, ha = 10, 0.72
        self.assertGreater(F.treater_busy(ha), F.scout_busy(ha))
        self.assertAlmostEqual(F.pipeline_makespan(n, ha, 1), F.scout_busy(ha) + n * F.treater_busy(ha))

    def test_extra_treaters_never_slow_the_job(self):
        ms = [F.pipeline_makespan(12, 1.62, k) for k in range(1, 6)]
        self.assertTrue(all(a >= b - 1e-9 for a, b in zip(ms, ms[1:])))

    def test_makespan_floor_is_scout_serial_time(self):
        n, ha = 8, 0.72
        self.assertGreaterEqual(F.pipeline_makespan(n, ha, 50), n * F.scout_busy(ha) + F.treater_busy(ha) - 1e-9)

    def test_inline_makespan_hand_value(self):
        # 5 fields on 2 robots: 3 rounds on the busier one
        self.assertAlmostEqual(F.inline_makespan(5, 0.18, 2), 3 * F.inline_busy(0.18))

    def test_inline_cost_independent_of_fleet_size_when_it_divides_fields(self):
        a, _ = F.inline_cost(8, 0.72, 2)
        b, _ = F.inline_cost(8, 0.72, 4)
        self.assertAlmostEqual(a, b)

    def test_pipeline_cost_hand_value(self):
        usd, ms = F.pipeline_cost(1, 0.18, 1)
        cap = (2500 + 3500) * 0.3 * (ms / 60) / 500
        people = 20 * (8 + 3 + F.swaps(F.line(F.FLY, 0.18)) * 3) / 60
        energy = 0.15 * F.line(F.PAIR_WH, 0.18) / 1000
        self.assertAlmostEqual(usd, cap + people + energy)

    def test_swaps(self):
        self.assertEqual(F.swaps(20.0), 0)
        self.assertEqual(F.swaps(41.6), 2)

    def test_fitted_lines_match_pairprice_results(self):
        txt = (Path(__file__).resolve().parents[2] / "osrobot-pairprice/experiments/results.txt").read_text()
        for name, p in (("fly_min", F.FLY), ("ground_min", F.GROUND), ("inline_min", F.INLINE),
                        ("pair_wh", F.PAIR_WH), ("inline_wh", F.INLINE_WH)):
            m = re.search(rf"^{name}\s+(-?[\d.]+)\s+([\d.]+)", txt, re.M)
            self.assertEqual((float(m.group(1)), float(m.group(2))), p, name)


if __name__ == "__main__":
    unittest.main()
