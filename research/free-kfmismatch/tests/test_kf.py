import math
import unittest
from free_kfmismatch import (gain, steady_mse, optimal_mse, excess_ratio,
                             claimed_post_var, simulate_mse)


class T(unittest.TestCase):
    def test_gain_known_value(self):
        # q=r=1: prior var p solves p^2-p-1=0 -> golden ratio; K=p/(p+1)
        phi = (1 + math.sqrt(5)) / 2
        self.assertAlmostEqual(gain(1, 1), phi / (phi + 1), 12)

    def test_optimal_equals_claimed(self):
        for q, r in [(1, 1), (0.1, 2), (5, 0.3)]:
            self.assertAlmostEqual(optimal_mse(q, r), claimed_post_var(q, r), 10)

    def test_optimum_is_minimum(self):
        for lam in (0.01, 0.3, 0.9, 1.1, 3, 100):
            self.assertGreater(excess_ratio(lam), 1.0)
        self.assertAlmostEqual(excess_ratio(1.0), 1.0, 12)

    def test_extreme_gains(self):
        # k=1 echoes the measurement: MSE = r. k->0: MSE blows up.
        self.assertAlmostEqual(steady_mse(1.0, 2.0, 3.0), 3.0, 12)
        self.assertGreater(steady_mse(1e-4, 1, 1), 1000)

    def test_simulation_matches_formula(self):
        k = gain(0.2, 1.0)
        exact = steady_mse(k, 1.0, 1.0)
        sim = simulate_mse(k, 1.0, 1.0, n=300000, seed=3)
        self.assertLess(abs(sim - exact) / exact, 0.02)


if __name__ == "__main__":
    unittest.main()
