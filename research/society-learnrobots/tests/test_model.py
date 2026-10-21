import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_learnrobots import deviation_gain, qre_fleet, simulate_learning, threshold_k  # noqa: E402


class Model(unittest.TestCase):
    def test_qre_is_a_fixed_point(self):
        import math
        for r, bk, k in ((0.3, 16.0, 1.5), (0.5, 4.0, 3.0), (0.1, 32.0, 6.0)):
            g = qre_fleet(r, bk, k)
            sig = 1 / (1 + math.exp(-bk * deviation_gain(r, g, k)))
            self.assertAlmostEqual(g, sig, places=6)

    def test_sharp_robots_approach_the_stability_threshold(self):
        # with very sharp response, the fleet is mostly yielding above k* and mostly going below
        ks = threshold_k(0.3, 1.0)
        self.assertLess(qre_fleet(0.3, 200.0, ks + 1.0), 0.05)
        self.assertGreater(qre_fleet(0.3, 200.0, 1.0), 0.9)

    def test_fleet_go_share_falls_with_collision_cost(self):
        g = [qre_fleet(0.3, 16.0, k) for k in (0.5, 1.5, 3.0, 6.0)]
        self.assertTrue(all(a > b for a, b in zip(g, g[1:])))

    def test_blunt_robots_stay_near_half(self):
        self.assertAlmostEqual(qre_fleet(0.3, 0.0, 3.0), 0.5, places=6)

    def test_simulation_is_deterministic_and_bounded(self):
        a = simulate_learning(0.3, 1.5, n=60, rounds=300, burn=100, seed=3)
        b = simulate_learning(0.3, 1.5, n=60, rounds=300, burn=100, seed=3)
        self.assertEqual(a, b)
        self.assertTrue(0 <= a["g"] <= 1 and 0 <= a["p_h"] <= 1)

    def test_simulation_goes_where_the_collision_is_cheap(self):
        lo = simulate_learning(0.3, 0.5, n=100, rounds=1200, burn=600, seed=1)["g"]
        hi = simulate_learning(0.3, 8.0, n=100, rounds=1200, burn=600, seed=1)["g"]
        self.assertGreater(lo, hi + 0.3)


if __name__ == "__main__":
    unittest.main()
