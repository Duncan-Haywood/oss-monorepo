import math, unittest
from twin_screen import *


class M(unittest.TestCase):
    def test_expected_max_known_values(self):
        self.assertAlmostEqual(expected_max_normal(2), 1 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(expected_max_normal(3), 1.5 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(expected_max_normal(1), 0.0)

    def test_top1_matches_simulation(self):
        for K, rho in ((10, 0.5), (20, 0.8)):
            mc, se = screen_value_mc(K, 1, rho, 10, 40000, 3)
            self.assertAlmostEqual(mc, twin_only_value(rho, K), delta=4 * se + 1e-3)

    def test_m_equals_K_is_real_only_and_noiseless_budget_reaches_oracle(self):
        mc, se = screen_value_mc(10, 10, 0.3, 1e9, 20000, 4)      # huge budget: measurement exact, any rho
        self.assertAlmostEqual(mc, oracle_value(10), delta=4 * se + 1e-3)

    def test_perfect_twin_needs_no_verification_and_useless_twin_is_real_only(self):
        mc1, _ = screen_value_mc(10, 1, 1.0, 5, 5000, 5)
        self.assertAlmostEqual(mc1, oracle_value(10), delta=0.05)
        a, sa = screen_value_mc(10, 1, 0.0, 5, 20000, 6)           # rho=0 and m=1: a random pick, value 0
        self.assertAlmostEqual(a, 0.0, delta=4 * sa + 1e-3)

    def test_better_twin_never_hurts_at_fixed_m(self):
        lo, _ = screen_value_mc(20, 3, 0.2, 10, 30000, 7)
        hi, _ = screen_value_mc(20, 3, 0.9, 10, 30000, 7)
        self.assertGreater(hi, lo)

    def test_best_m_shrinks_as_twin_improves(self):
        m_bad, _ = best_m(30, 0.2, 20, (1, 2, 4, 8, 16, 30), 6000, 1)
        m_good, _ = best_m(30, 0.95, 20, (1, 2, 4, 8, 16, 30), 6000, 1)
        self.assertGreaterEqual(m_bad, m_good)


if __name__ == "__main__":
    unittest.main()
