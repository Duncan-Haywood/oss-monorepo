import unittest
from math import inf
from spot_check import *


class T(unittest.TestCase):
    def test_pmf_sums(self):
        self.assertAlmostEqual(sum(hyper_pmf(20, 7, 5).values()), 1.0)

    def test_flat_convex_all_or_nothing(self):
        p = Params(30, 1.0, F=10.0)
        for k in (1, 3, 8):
            vals = [payoff(p, j, k) for j in range(p.T + 1)]
            self.assertTrue(is_convex(vals))
            j, _ = best_response(p, k)
            self.assertIn(j, (0, p.T))

    def test_flat_threshold_is_total_gain(self):
        # one audit already detects a full-trace cheat with certainty, so F >= T*g decides
        self.assertEqual(min_samples(Params(30, 1.0, F=31.0)), 1)
        self.assertIsNone(min_samples(Params(30, 1.0, F=29.0)))

    def test_proportional_linear(self):
        p = Params(40, 1.0, f=8.0)   # need k/T >= g/f -> k >= 5
        self.assertEqual(min_samples(p), 5)

    def test_hybrid_payoff_convex_on_grid(self):
        # empirical (not proved): capped per-hit slashing keeps the all-or-nothing structure
        for T_ in (12, 25):
            for F in (3.0, 10.0, 40.0):
                for f in (0.5, 2.0, 8.0):
                    for k in range(1, T_):
                        p = Params(T_, 1.0, F, f)
                        self.assertTrue(is_convex([payoff(p, j, k) for j in range(T_ + 1)]))
                        self.assertIn(best_response(p, k)[0], (0, T_))

    def test_corner_condition(self):
        # deterrence <=> min(F, f*k) >= T*g : stake and audits are complements, not substitutes
        for F in (20.0, 60.0, 100.0):
            for f in (2.0, 5.0, 10.0):
                for k in (1, 5, 10, 20, 50):
                    p = Params(50, 1.0, F, f)
                    self.assertEqual(deters(p, k), min(F, f * k) >= p.T * p.g)

    def test_more_stake_never_needs_more_audits(self):
        ks = [k for _, k in frontier(30, 1.0, 6.0, [10, 20, 30, 40]) if k is not None]
        self.assertEqual(ks, sorted(ks, reverse=True))


if __name__ == "__main__":
    unittest.main()
