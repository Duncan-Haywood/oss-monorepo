import math, random, unittest
from variance_elicitation import *


class T(unittest.TestCase):
    def test_pair_unbiased_gaussian(self):
        rng = random.Random(1)
        n = 200000
        ds = [pair_stat(rng.gauss(3, 2), rng.gauss(3, 2)) for _ in range(n)]
        m = sum(ds) / n
        self.assertAlmostEqual(m / 4.0, 1.0, delta=0.02)
        v = sum((d - m) ** 2 for d in ds) / n
        self.assertAlmostEqual(v / (16 * var_pair(3.0)), 1.0, delta=0.05)

    def test_var_pair_uniform(self):
        rng = random.Random(2)
        ds = [pair_stat(rng.random(), rng.random()) for _ in range(200000)]
        m = sum(ds) / len(ds)
        v = sum((d - m) ** 2 for d in ds) / len(ds)
        s2 = 1 / 12
        self.assertAlmostEqual(v / var_pair(1.8, s2), 1.0, delta=0.05)

    def test_excess_scores(self):
        self.assertAlmostEqual(excess_is(1.0), 0.0, 14)
        self.assertGreater(excess_is(0.5), excess_is(2.0))  # underreport costs more
        self.assertAlmostEqual(excess_is(2.0), 0.5 + math.log(2) - 1, 14)
        self.assertAlmostEqual(excess_brier(3.0, 1.0), 4.0, 14)

    def test_is_excess_matches_expectation(self):
        rng = random.Random(3)
        n = 200000
        ds = [pair_stat(rng.gauss(0, 1), rng.gauss(0, 1)) for _ in range(n)]
        lam = 1.5
        gap = sum(is_score(lam, d) - is_score(1.0, d) for d in ds) / n
        self.assertAlmostEqual(gap, excess_is(lam), delta=0.01)

    def test_sample_variance_var_gaussian(self):
        self.assertAlmostEqual(var_sample_variance(10, 3.0), 2 / 9, 12)
        self.assertAlmostEqual(var_sample_variance(2, 3.0), var_pair(3.0), 12)

    def test_pairs_efficiency_gaussian(self):
        self.assertAlmostEqual(pairs_efficiency(10, 3.0), 4 / 10 / (2 / 9), 12)
        self.assertAlmostEqual(pairs_efficiency(2, 3.0), 1.0, 12)

    def test_tasks_needed_first_order_close(self):
        r = tasks_needed(1.02, 3.0) / tasks_needed_first_order(1.02, 3.0)
        self.assertAlmostEqual(r, 1.0, delta=0.03)

    def test_nonconvex_level_set(self):
        # N(0,1) and N(2,1) both have variance 1, their 50/50 mixture has variance 2
        self.assertAlmostEqual(mixture_variance(1, 0, 1, 2), 2.0, 12)

    def test_sample_variance_helper(self):
        self.assertAlmostEqual(sample_variance([1, 2, 3, 4]), 5 / 3, 12)

    def test_known_mean_bias(self):
        self.assertEqual(known_mean_bias(1.0, 0.5), 0.25)


if __name__ == "__main__":
    unittest.main()
