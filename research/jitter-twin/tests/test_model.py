import math
import unittest

from jitter_twin.model import (as_critical_gain, const_critical_gain, effective_delay, lyapunov, ms_critical_gain,
                               ms_rho, sticky, stationary_var)

HALF = [0.5, 0.5]


class T(unittest.TestCase):
    def test_constant_delay_threshold_formula(self):
        for d in range(4):
            kc = ms_critical_gain([d], [1.0], iters=1500, steps=26)
            self.assertAlmostEqual(kc, const_critical_gain(d), places=3)

    def test_sticky_chain_keeps_marginal(self):
        pr = [0.2, 0.3, 0.5]
        P = sticky(pr, 0.7)
        for row in P:
            self.assertAlmostEqual(sum(row), 1.0)
        for j in range(3):
            self.assertAlmostEqual(sum(pr[i] * P[i][j] for i in range(3)), pr[j])

    def test_iid_symmetric_jitter_matches_twin_threshold_and_variance(self):
        self.assertAlmostEqual(ms_critical_gain([0, 2], HALF, steps=26), 1.0, places=5)
        for k in (0.3, 0.5, 0.9):
            self.assertAlmostEqual(stationary_var(k, [0, 2], HALF), stationary_var(k, [1], [1.0]), places=6)

    def test_two_point_threshold_fit(self):
        for p in (0.3, 0.8):
            kc = ms_critical_gain([0, 2], [1 - p, p], steps=26)
            self.assertAlmostEqual(kc * (kc + 1), 1.0 / p, places=4)

    def test_persistence_lowers_threshold_toward_worst_case(self):
        ks = [ms_critical_gain([0, 2], HALF, rho, steps=22) for rho in (0.0, 0.5, 0.9)]
        self.assertGreater(ks[0], ks[1])
        self.assertGreater(ks[1], ks[2])
        self.assertGreater(ks[2], const_critical_gain(2))

    def test_variance_finite_below_threshold_and_infinite_above(self):
        kc = ms_critical_gain([0, 2], HALF, 0.9, steps=26)
        self.assertLess(stationary_var(0.95 * kc, [0, 2], HALF, 0.9), float("inf"))
        self.assertEqual(stationary_var(1.05 * kc, [0, 2], HALF, 0.9), float("inf"))

    def test_almost_sure_stable_but_not_mean_square(self):
        k = 1.3
        self.assertGreater(ms_rho(k, [0, 2], HALF), 1.0)
        self.assertLess(lyapunov(k, [0, 2], HALF, n=40000), 0.0)

    def test_effective_delay_inverts_threshold(self):
        for d in (1, 2, 3):
            self.assertAlmostEqual(effective_delay(const_critical_gain(d)), d, places=9)


if __name__ == "__main__":
    unittest.main()
