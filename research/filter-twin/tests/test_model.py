import math, random, unittest
from filter_twin import *


class M(unittest.TestCase):
    def test_matched_twin_has_no_regret(self):
        for a in (0.5, 0.9, 1.05):
            self.assertAlmostEqual(regret(a, 2.0, 0.5, 4.0), 0.0, places=9)

    def test_mse_at_optimal_gain_is_riccati(self):
        for a, Q, R in ((0.9, 1, 1), (0.3, 2, 0.2), (1.1, 0.1, 3)):
            self.assertAlmostEqual(mse(opt_gain(a, Q, R), a, Q, R), opt_mse(a, Q, R), places=9)

    def test_optimal_gain_minimises_mse(self):
        a, Q, R = 0.9, 1.0, 2.0
        K = opt_gain(a, Q, R)
        for d in (-0.05, 0.05):
            self.assertGreater(mse(K + d, a, Q, R), mse(K, a, Q, R))

    def test_gain_depends_only_on_ratio(self):
        self.assertAlmostEqual(opt_gain(0.9, 3.0, 6.0), opt_gain(0.9, 0.5, 1.0), places=12)

    def test_lag1_zero_iff_optimal(self):
        a, Q, R = 0.8, 1.5, 0.7
        K = opt_gain(a, Q, R)
        self.assertAlmostEqual(lag1_cov(K, a, Q, R), 0.0, places=10)
        self.assertNotAlmostEqual(lag1_cov(K + 0.1, a, Q, R), 0.0, places=3)

    def test_twin_gain_never_unstable_for_unstable_plant(self):
        a = 1.3
        for rho in (1e-12, 1e-6, 1.0, 1e6):
            self.assertTrue(math.isfinite(regret(a, 1.0, 1.0, rho)))
        self.assertGreater(opt_gain(a, 1e-12, 1.0), 1 - 1 / a)

    def test_random_walk_regret_diverges_as_twin_gets_quiet(self):
        self.assertGreater(regret(1.0, 1.0, 1.0, 1e-8), 1e3)
        self.assertLess(regret(0.5, 1.0, 1.0, 1e-8), 10)

    def test_twin_claim_optimistic_when_twin_quiet(self):
        a = 0.9
        self.assertLess(twin_claim(a, 0.1, 0.1), opt_mse(a, 1.0, 1.0) * 0.2)

    def test_mse_matches_simulation(self):
        a, Q, R, K = 0.9, 1.0, 1.0, 0.2
        nus, errs = simulate(a, Q, R, K, 200000, random.Random(1))
        self.assertAlmostEqual(sum(errs) / len(errs) / mse(K, a, Q, R), 1.0, delta=0.03)
        c0 = sum(v * v for v in nus) / len(nus)
        self.assertAlmostEqual(c0 / innovation_cov(K, a, Q, R), 1.0, delta=0.03)

    def test_mehra_recovers_gain(self):
        a, Q, R = 0.9, 1.0, 1.0
        K0 = opt_gain(a, 0.05, 1.0)
        nus, _ = simulate(a, Q, R, K0, 400000, random.Random(2))
        K1, Qh, Rh, _ = mehra_gain(nus, K0, a)
        self.assertAlmostEqual(K1, opt_gain(a, Q, R), delta=0.02)


if __name__ == "__main__":
    unittest.main()
