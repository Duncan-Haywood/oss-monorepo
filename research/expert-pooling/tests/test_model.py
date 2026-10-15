import os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from expert_pooling import *


class T(unittest.TestCase):
    def test_closed_form_matches_numerical_argmin(self):
        for n, rho, s2 in [(2, 0.0, 2.0), (5, 0.3, 3.0), (8, 0.7, 1.5), (4, 1.0, 2.0)]:
            self.assertAlmostEqual(best_exponent(n, rho, s2), a_star(n, rho), delta=2e-3)

    def test_limits(self):
        self.assertAlmostEqual(a_star(6, 0.0), 6.0)
        self.assertAlmostEqual(a_star(6, 1.0), 1.0)
        self.assertLess(a_star(100, 0.1), 10.0)          # saturates below 1/rho

    def test_bayes_loss_is_minimum_and_beats_single_expert(self):
        n, rho, s2 = 6, 0.3, 2.0
        b = bayes_logloss(n, rho, s2)
        for a in (0.5, 1.0, 3.0, 6.0):
            self.assertLessEqual(b, expected_logloss(a, n, rho, s2) + 1e-9)
        self.assertLess(b, expected_logloss(1.0, 1, 0.0, s2))

    def test_monte_carlo_agrees_with_quadrature(self):
        n, rho, s2 = 4, 0.4, 2.0
        data = sample_logits(n, rho, s2, 40000, random.Random(1))
        a = 2.0
        mc = empirical_pool_loss(data, lambda ls: sigmoid(a * sum(ls) / n))
        self.assertAlmostEqual(mc, expected_logloss(a, n, rho, s2), delta=0.01)

    def test_rho_estimator(self):
        for rho in (0.0, 0.5):
            data = sample_logits(5, rho, 2.0, 30000, random.Random(2))
            self.assertAlmostEqual(estimate_rho(data), rho, delta=0.03)

    def test_ogd_converges_to_a_star(self):
        n, rho, s2 = 5, 0.4, 2.0
        data = sample_logits(n, rho, s2, 60000, random.Random(3))
        path, _ = ogd_exponent(data, n)
        tail = path[-10000:]
        self.assertAlmostEqual(sum(tail) / len(tail), a_star(n, rho), delta=0.25)


if __name__ == "__main__":
    unittest.main()
