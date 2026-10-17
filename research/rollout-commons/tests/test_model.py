import random, unittest
from rollout_commons import *


class T(unittest.TestCase):
    def test_symmetric_nash_closed_form_independent_of_N(self):
        for N in (2, 5, 20):
            x = nash([3.0] * N, [1.0] * N, 0.6)
            k = 1 + 0.6 * (N - 1)
            self.assertAlmostEqual(x[0], 2.0 / k, 9)
            y = x[0] * k
            self.assertAlmostEqual(y, 2.0, 9)  # a lone agent's private level, whatever N

    def test_nash_no_profitable_deviation(self):
        rng = random.Random(1)
        for _ in range(20):
            N = rng.randint(2, 6)
            a = [rng.uniform(1, 4) for _ in range(N)]
            c = [rng.uniform(0.5, 2) for _ in range(N)]
            th = rng.uniform(0.1, 1)
            x = nash(a, c, th)
            u = payoffs(x, a, c, th)
            for i in range(N):
                for d in (0.0, x[i] * 0.5, x[i] * 1.5 + 0.1, x[i] + 1.0):
                    z = list(x); z[i] = d
                    self.assertLessEqual(payoffs(z, a, c, th)[i], u[i] + 1e-9)

    def test_efficient_symmetric_closed_form_and_optimality(self):
        N, a, c, th = 6, 3.0, 1.0, 0.5
        x = efficient([a] * N, [c] * N, th)
        self.assertAlmostEqual(x[0], sym_efficient(N, a, c, th), 8)
        w = welfare(x, [a] * N, [c] * N, th)
        rng = random.Random(2)
        for _ in range(200):
            z = [max(0, xi + rng.gauss(0, 0.3)) for xi in x]
            self.assertLessEqual(welfare(z, [a] * N, [c] * N, th), w + 1e-9)
        self.assertAlmostEqual(w, sym_welfare(N, a, c, th, sym_efficient(N, a, c, th)), 8)

    def test_theta_one_only_best_ratio_agent_contributes(self):
        a = [3.0, 4.0, 2.0, 5.0]
        c = [1.0, 1.0, 1.0, 1.5]
        x = nash(a, c, 1.0)
        self.assertEqual([i for i, v in enumerate(x) if v > 1e-9], [1])
        self.assertAlmostEqual(sum(x), 3.0, 9)

    def test_pigouvian_subsidy_implements_efficiency(self):
        rng = random.Random(3)
        for _ in range(10):
            N = rng.randint(2, 7)
            a = [rng.uniform(2, 4) for _ in range(N)]
            c = [rng.uniform(0.5, 1.5) for _ in range(N)]
            th = rng.uniform(0.2, 1)
            xe = efficient(a, c, th)
            xs, tau = nash_with_subsidy(a, c, th)
            for u, v in zip(xe, xs):
                self.assertAlmostEqual(u, v, 6)
            self.assertTrue(all(t < ci + 1e-9 for t, ci in zip(tau, c)))

    def test_symmetric_subsidy_fraction(self):
        N, a, c, th = 8, 3.0, 1.0, 0.7
        _, tau = nash_with_subsidy([a] * N, [c] * N, th)
        k = 1 + th * (N - 1)
        self.assertAlmostEqual(tau[0] / c, th * (N - 1) / k, 6)

    def test_fraud_threshold_and_mc(self):
        c, eps, tau, F = 1.0, 0.1, 0.8, 2.0
        p = min_audit_rate(c, eps, tau, F)
        self.assertAlmostEqual(p, 0.9 / 2.8)
        h, j = fraud_payoff_mc(c, eps, tau, F, p)
        self.assertAlmostEqual(j, h, delta=0.02)  # indifferent at the threshold
        h, j = fraud_payoff_mc(c, eps, tau, F, p * 0.5)
        self.assertGreater(j, h)


if __name__ == "__main__":
    unittest.main()
