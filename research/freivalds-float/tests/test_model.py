import math, random, unittest
from freivalds_float import *


def rank1(u, v):
    return [[a * b for b in v] for a in u]


class T(unittest.TestCase):
    def test_rank1_miss_matches_simulation(self):
        rng = random.Random(1)
        n, t = 6, 1.0
        u = [rng.gauss(0, 1) for _ in range(n)]
        v = [rng.gauss(0, 1) for _ in range(n)]
        E = rank1(u, v)
        F = norm(u) * norm(v)
        hit, N = 0, 40000
        for _ in range(N):
            r = gauss_vec(n, rng)
            Er = [sum(e * x for e, x in zip(row, r)) for row in E]
            hit += norm(Er) <= t
        self.assertAlmostEqual(hit / N, miss_rank1(t, F), delta=0.01)

    def test_rank_one_is_worst_case_for_fixed_frobenius_norm(self):
        rng = random.Random(2)
        F, t = 3.0, 1.0
        rank_one = miss_mc([F], t, 60000, rng)
        for k in (2, 4, 8):
            spread = miss_mc([F / math.sqrt(k)] * k, t, 60000, rng)
            self.assertLess(spread, rank_one)
        self.assertAlmostEqual(rank_one, miss_rank1(t, F), delta=0.01)

    def test_probe_count_and_fair_size(self):
        m = probes_needed(1.0, 3.0, 0.01)
        self.assertLessEqual(miss_rank1(1.0, 3.0, m), 0.01)
        self.assertGreater(miss_rank1(1.0, 3.0, m - 1), 0.01)
        self.assertAlmostEqual(miss_rank1(1.0, fair_probe_size(1.0)), 0.5, 9)

    def test_rademacher_two_entry_corruption_always_half(self):
        rng = random.Random(3)
        n, a, t = 5, 10.0, 1.0            # huge corruption, tiny tolerance
        E = [[a if j < 2 and i == 0 else 0.0 for j in range(n)] for i in range(n)]
        F = a * math.sqrt(2)
        hit, N = 0, 20000
        for _ in range(N):
            r = rademacher_vec(n, rng)
            hit += abs(E[0][0] * r[0] + E[0][1] * r[1]) <= t
        self.assertAlmostEqual(hit / N, miss_rademacher_two(t, F), delta=0.01)
        self.assertLess(miss_rank1(t, F), 0.06)      # Gaussian: erf(1/(sqrt2*14.1)) ~ 0.056

    def test_float32_rounds(self):
        self.assertNotEqual(f32(0.1), 0.1)
        self.assertEqual(f32(0.5), 0.5)

    def test_honest_residual_small_but_nonzero_and_fit(self):
        rng = random.Random(4)
        res = [honest_residual(8, rng) for _ in range(20)]
        self.assertTrue(all(0 < x < 1e-4 for x in res))
        self.assertAlmostEqual(fit_exponent([1, 2, 4], [3, 6, 12]), 1.0, 9)

    def test_grinding_and_cost(self):
        self.assertAlmostEqual(grind_tries(1.0, 1e9), 1 / miss_rank1(1.0, 1e9))
        self.assertGreater(grind_tries(1.0, 100.0), 100)
        self.assertAlmostEqual(verify_cost_ratio(1000, 10), 0.03)


if __name__ == "__main__":
    unittest.main()
