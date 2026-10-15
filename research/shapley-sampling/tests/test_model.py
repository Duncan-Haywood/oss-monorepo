import random
import unittest
from shapley_sampling import *


W = [0.2, 0.5, 0.9, 1.4, 0.05, 0.7]


class T(unittest.TestCase):
    def test_efficiency_exact(self):
        self.assertAlmostEqual(sum(exact_shapley(W)), value(W, range(len(W))), 12)

    def test_symmetry(self):
        p = exact_shapley([0.6, 0.6, 0.3])
        self.assertAlmostEqual(p[0], p[1], 12)

    def test_permutation_sampling_is_efficient_every_run(self):
        e = sample_perm(W, 7, random.Random(1))
        self.assertAlmostEqual(sum(e), value(W, range(len(W))), 12)

    def test_unbiased(self):
        phi = exact_shapley(W)
        e = sample_perm(W, 60000, random.Random(2))
        self.assertLess(max(abs(a - b) for a, b in zip(e, phi)), 0.004)

    def test_variance_prediction(self):
        phi = exact_shapley(W)
        m, R = 40, 1500
        rng = random.Random(3)
        i = 2
        xs = [sample_perm(W, m, rng)[i] for _ in range(R)]
        var = sum((x - phi[i]) ** 2 for x in xs) / R
        self.assertAlmostEqual(var / (perm_var(W, i, phi[i]) / m), 1, delta=0.12)

    def test_strat_variance_prediction(self):
        phi = exact_shapley(W)
        m, R = 60, 800
        rng = random.Random(4)
        i = 3
        xs = [sample_strat(W, m, rng)[i] for _ in range(R)]
        var = sum((x - phi[i]) ** 2 for x in xs) / R
        self.assertAlmostEqual(var / strat_var(W, i, m), 1, delta=0.15)

    def test_hoeffding_conservative(self):
        self.assertGreater(hoeffding_samples(6, 0.01, 0.05), 20000)

    def test_stratification_helps_when_marginals_vary_with_size(self):
        self.assertLess(strat_var(W, 2, 600), perm_var(W, 2) / 600)

    def test_equal_weights_stratified_exact(self):
        self.assertAlmostEqual(strat_var([0.4] * 6, 0, 60), 0, 20)


if __name__ == "__main__":
    unittest.main()
