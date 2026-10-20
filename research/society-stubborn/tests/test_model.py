import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_stubborn import critical_share, low_fixed_point, partner_l_prob, simulate  # noqa: E402


class MeanField(unittest.TestCase):
    def test_zero_stubborn_matches_robotnorms(self):
        # values published in society-robotnorms results.txt (eps=0.02)
        self.assertAlmostEqual(critical_share(0.0, 5, 0.02), 0.1580, places=3)
        self.assertAlmostEqual(critical_share(0.0, 9, 0.02), 0.2165, places=3)

    def test_stubborn_never_lowers_threshold(self):
        for m in (5, 9, 17):
            cs = [critical_share(s, m, 0.02) for s in (0.0, 0.1, 0.2, 0.3, 0.4)]
            self.assertTrue(all(b > a for a, b in zip(cs, cs[1:])))

    def test_partner_prob_limits(self):
        self.assertAlmostEqual(partner_l_prob(0.0, 0.0, 1.0, 0.0), 0.0)
        self.assertAlmostEqual(partner_l_prob(1.0, 0.0, 0.0, 0.0), 1.0)
        self.assertAlmostEqual(partner_l_prob(0.5, 1.0, 0.7, 0.3), 1.0)

    def test_no_robots_stays_on_status_quo(self):
        self.assertLess(low_fixed_point(0.0, 0.5, 9, 0.02), 0.01)

    def test_unreachable_is_nan(self):
        self.assertTrue(math.isnan(critical_share(1.0, 9, 0.02, hi=0.4)))


class Simulation(unittest.TestCase):
    def test_deterministic(self):
        a = simulate(60, 0.2, 0.2, 5, 0.02, 40, seed=3)
        self.assertEqual(a, simulate(60, 0.2, 0.2, 5, 0.02, 40, seed=3))

    def test_large_robot_share_tips_adaptive_people(self):
        r = simulate(100, 0.5, 0.2, 5, 0.02, 200, seed=1)
        self.assertGreater(r["final_share_l"], 0.9)

    def test_small_robot_share_does_not_tip(self):
        r = simulate(100, 0.04, 0.3, 5, 0.02, 200, seed=1)
        self.assertLess(r["final_share_l"], 0.2)

    def test_conflict_rate_in_unit_interval(self):
        r = simulate(60, 0.2, 0.3, 9, 0.02, 60, seed=2)
        self.assertTrue(0 <= r["human_conflict_rate"] <= 1)


if __name__ == "__main__":
    unittest.main()
