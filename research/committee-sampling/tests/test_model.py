import math, random, unittest
from committee_sampling import *


class T(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        self.assertAlmostEqual(sum(hyper_pmf(60, 17, 11, k) for k in range(12)), 1.0, 12)

    def test_full_pool_deterministic(self):
        self.assertEqual(hyper_tail(50, 20, 50, 26), 0.0)
        self.assertEqual(hyper_tail(50, 26, 50, 26), 1.0)

    def test_hyper_below_binomial(self):
        for m in (5, 11, 21):
            self.assertLess(hyper_tail(60, 18, m, m // 2 + 1), binom_tail(m, 0.3, m // 2 + 1))

    def test_hoeffding_bound(self):
        for m in (9, 21, 51):
            self.assertLessEqual(binom_tail(m, 0.3, m // 2 + 1), hoeffding(m, 0.3))

    def test_monte_carlo(self):
        rng = random.Random(3)
        pool = [1] * 12 + [0] * 28
        n = 40000
        hit = sum(sum(rng.sample(pool, 9)) >= 5 for _ in range(n)) / n
        self.assertAlmostEqual(hit, hyper_tail(40, 12, 9, 5), delta=0.006)

    def test_min_committee_monotone_in_beta(self):
        ms = [min_committee(1000, int(1000 * b), 1e-6) for b in (0.1, 0.2, 0.3, 0.4)]
        self.assertEqual(ms, sorted(ms))
        self.assertTrue(all(m % 2 == 1 for m in ms))

    def test_chernoff_order(self):
        m = min_committee(10 ** 6, 200000, 1e-9, replace=True)
        c = chernoff_size(0.2, 1e-9)
        self.assertLess(m, c)          # polynomial prefactor makes the exact size smaller than ln(1/eps)/KL
        self.assertGreater(m, 0.7 * c)

    def test_safety_liveness_tradeoff(self):
        s1, l1 = safety_liveness(200, 40, 21, 11)
        s2, l2 = safety_liveness(200, 40, 21, 16)
        self.assertGreater(s1, s2)
        self.assertLess(l1, l2)

    def test_stake_share_split_invariant(self):
        self.assertAlmostEqual(stake_share(20, 80, 1), 0.2)
        self.assertGreater(stake_share(20, 80, 5), 0.5)

    def test_adaptive_linear(self):
        self.assertEqual(adaptive_cost(21, 3.0), 33.0)

    def test_optimal_size_grows_with_loss(self):
        self.assertLess(optimal_size(0.2, 1, 1e3)[0], optimal_size(0.2, 1, 1e6)[0])


if __name__ == "__main__":
    unittest.main()
