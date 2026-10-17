import math, random, unittest
from stop_twin import *


class M(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        self.assertAlmostEqual(sum(nb_pmf(n, 4, 0.2) for n in range(4, 600)), 1.0, places=12)

    def test_haldane_unbiased_exactly(self):
        for m, p in ((3, 0.3), (10, 0.02), (40, 0.001)):
            self.assertAlmostEqual(expected_haldane(m, p) / p, 1.0, places=8)

    def test_naive_biased_up(self):
        self.assertAlmostEqual(expected_naive(30, 0.001) / 0.001, 30 / 29.0, delta=1e-3)
        self.assertGreater(expected_naive(5, 0.05), 0.05 * 1.2)

    def test_variance_law(self):
        self.assertAlmostEqual(var_haldane(100, 0.001) ** 0.5 / 0.001, 98 ** -0.5, delta=2e-4)

    def test_binom_identity(self):
        # P(N <= n) = P(Bin(n,p) >= m)
        m, p, n = 3, 0.1, 25
        lhs = sum(nb_pmf(j, m, p) for j in range(m, n + 1))
        self.assertAlmostEqual(lhs, 1.0 - binom_cdf_lt(m, n, p), places=12)

    def test_exact_ci_brackets_and_coverage(self):
        lo, hi = exact_ci(30, 30000)
        self.assertLess(lo, 0.001)
        self.assertGreater(hi, 0.001)
        rng = random.Random(1)
        p, m = 0.01, 12
        c = sum(exact_ci(m, n)[0] <= p <= exact_ci(m, n)[1] for n in (inverse_sample(p, m, rng) for _ in range(400)))
        self.assertGreaterEqual(c / 400, 0.92)

    def test_sequential_wald_stops_on_zero_failures(self):
        rng = random.Random(2)
        stops = [sequential_wald(1e-4, 2e-5, 100, 100, rng) for _ in range(200)]
        self.assertGreater(sum(k == 0 for _, k, _ in stops) / 200, 0.9)

    def test_planning_helpers(self):
        self.assertEqual(m_for_rel_sd(0.1), 102)
        self.assertAlmostEqual(fixed_rel_halfwidth(1e-3, 95940), 0.2, delta=1e-3)
        self.assertAlmostEqual(haldane(11, 101), 0.1)


if __name__ == "__main__":
    unittest.main()
