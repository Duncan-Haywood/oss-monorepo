import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_blocs import critical_share, critical_sl, low_fixed_point, partner_l_prob, simulate  # noqa: E402


class MeanField(unittest.TestCase):
    def test_no_left_bloc_matches_society_stubborn(self):
        # values published in society-stubborn results.txt (eps=0.02, M=9)
        self.assertAlmostEqual(critical_share(0.0, 0.0, 9, 0.02), 0.2165, places=3)
        self.assertAlmostEqual(critical_share(0.0, 0.4, 9, 0.02), 0.2830, places=3)

    def test_left_bloc_never_raises_threshold(self):
        cs = [critical_share(sl, 0.0, 9, 0.02) for sl in (0.0, 0.05, 0.1, 0.15)]
        self.assertTrue(all(b < a for a, b in zip(cs, cs[1:])))

    def test_right_bloc_never_lowers_threshold(self):
        cs = [critical_share(0.1, sr, 9, 0.02) for sr in (0.0, 0.1, 0.2, 0.3)]
        self.assertTrue(all(b > a for a, b in zip(cs, cs[1:])))

    def test_partner_prob_limits(self):
        self.assertAlmostEqual(partner_l_prob(0.0, 0.0, 1.0, 0.0, 0.0), 1.0)
        self.assertAlmostEqual(partner_l_prob(0.0, 0.0, 0.0, 1.0, 0.0), 0.0)
        self.assertAlmostEqual(partner_l_prob(0.3, 1.0, 0.2, 0.5, 0.3), 1.0)

    def test_self_tipping_gives_zero_threshold(self):
        s = critical_sl(0.0, 9, 0.02)
        self.assertEqual(critical_share(s + 0.01, 0.0, 9, 0.02), 0.0)
        self.assertGreater(critical_share(s - 0.01, 0.0, 9, 0.02), 0.0)

    def test_unreachable_is_nan_for_left_bloc(self):
        self.assertTrue(math.isnan(critical_sl(0.95, 9, 0.02)))

    def test_no_robots_no_left_bloc_stays_on_status_quo(self):
        self.assertLess(low_fixed_point(0.0, 0.0, 0.5, 9, 0.02), 0.01)


class Simulation(unittest.TestCase):
    def test_deterministic(self):
        a = simulate(60, 0.2, 0.1, 0.1, 5, 0.02, 40, seed=3)
        self.assertEqual(a, simulate(60, 0.2, 0.1, 0.1, 5, 0.02, 40, seed=3))

    def test_left_bloc_alone_tips_adaptive_people(self):
        r = simulate(100, 0.0, 0.5, 0.0, 5, 0.02, 200, seed=1)
        self.assertGreater(r["final_share_l"], 0.9)

    def test_small_shares_do_not_tip(self):
        r = simulate(100, 0.04, 0.02, 0.2, 5, 0.02, 200, seed=1)
        self.assertLess(r["final_share_l"], 0.2)

    def test_conflict_rate_in_unit_interval(self):
        r = simulate(60, 0.2, 0.1, 0.1, 9, 0.02, 60, seed=2)
        self.assertTrue(0 <= r["human_conflict_rate"] <= 1)


if __name__ == "__main__":
    unittest.main()
