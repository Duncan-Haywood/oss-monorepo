import math, random, unittest
from stopping_scores import *


class T(unittest.TestCase):
    def test_wald_and_ruin_by_simulation(self):
        rng = random.Random(1)
        a, k, N = 0.7, 4, 40000
        res = [simulate(a, k, rng) for _ in range(N)]
        self.assertAlmostEqual(sum(r[0] for r in res) / N, p_k(a, k), delta=0.006)
        self.assertAlmostEqual(sum(r[1] for r in res) / N, expected_checks(a, k), delta=0.05)

    def test_expected_checks_by_enumeration(self):
        a, k = 0.65, 3
        # exact E[tau] from the absorbing chain on -k..k
        E = {j: 0.0 for j in range(-k, k + 1)}
        for _ in range(4000):
            E = {j: (0.0 if abs(j) == k else 1 + a * E[j + 1] + (1 - a) * E[j - 1]) for j in E}
        self.assertAlmostEqual(E[0], expected_checks(a, k), 9)

    def test_dp_matches_threshold(self):
        for G in (G_brier, G_log):
            for a, c in ((0.7, 0.01), (0.6, 0.004), (0.8, 0.02)):
                k, u = best_threshold(G, a, c)
                cont = dp_policy(G, a, c, K=40)
                self.assertEqual(sorted(cont), list(range(-k + 1, k)))
                V = dp_value(G, a, c, K=40)
                self.assertAlmostEqual(V[0], u, 9)

    def test_sequential_beats_fixed(self):
        for G in (G_brier, G_log):
            for a, c in ((0.7, 0.01), (0.6, 0.004)):
                self.assertGreaterEqual(best_threshold(G, a, c)[1], best_fixed(G, a, c)[1] - 1e-12)

    def test_fixed_n_one_check(self):
        a = 0.7
        self.assertAlmostEqual(fixed_utility(G_brier, a, 0.0, 1), G_brier(a), 12)
        self.assertAlmostEqual(utility(G_brier, a, 0.0, 1), G_brier(a), 12)

    def test_participation_threshold(self):
        a, c = 0.7, 0.02
        for G in (G_brier, G_log):
            ks = participation_scale(G, a, c)
            self.assertEqual(best_threshold(lambda p: G(p, ks * 0.98), a, c)[0], 0)
            self.assertGreaterEqual(best_threshold(lambda p: G(p, ks * 1.02), a, c)[0], 1)
        self.assertAlmostEqual(participation_scale(G_brier, a, c), 4 * c / (2 * a - 1) ** 2, 12)

    def test_brier_large_scale_asymptote(self):
        a, c = 0.7, 1e-3
        lam = math.log(a / (1 - a))
        for kappa in (1e2, 1e4, 1e6):
            k = best_threshold(lambda p: G_brier(p, kappa), a, c)[0]
            pred = math.log(kappa * (2 * a - 1) ** 2 / ((1 - a) * c)) / lam
            self.assertLessEqual(abs(k - pred), 1.0)

    def test_scale_invariance(self):
        a = 0.7
        k1 = best_threshold(lambda p: G_log(p, 5.0), a, 0.05)[0]
        k2 = best_threshold(lambda p: G_log(p, 1.0), a, 0.01)[0]
        self.assertEqual(k1, k2)


if __name__ == "__main__":
    unittest.main()
