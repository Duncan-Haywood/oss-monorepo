import math, random, unittest
from straggler_backup import *


class T(unittest.TestCase):
    def test_exp_mean_matches_independent_integral(self):
        for n, k, s, mu in [(5, 2, 0.5, 1.0), (8, 8, 0.0, 2.0), (12, 7, 1.0, 0.5)]:
            self.assertAlmostEqual(exp_order_mean(n, k, s, mu), exp_order_mean_numeric(n, k, s, mu, steps=60000), places=3)

    def test_exp_var_and_mean_by_simulation(self):
        rng = random.Random(1)
        n, k, mu = 10, 6, 1.5
        xs = simulate_round(n, k, 0.0, mu, rng, 40000)
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
        self.assertAlmostEqual(m, exp_order_mean(n, k, 0.0, mu), delta=0.01)
        self.assertAlmostEqual(v, exp_order_var(n, k, mu), delta=0.008)

    def test_pareto_closed_form_matches_integral(self):
        for n, k, alpha in [(6, 3, 2.5), (10, 10, 3.0), (8, 5, 1.5)]:
            self.assertAlmostEqual(pareto_order_mean(n, k, 1.0, alpha), pareto_order_mean_numeric(n, k, 1.0, alpha),
                                   delta=2e-3 * pareto_order_mean(n, k, 1.0, alpha))

    def test_pareto_infinite_mean_when_waiting_for_all(self):
        self.assertEqual(pareto_order_mean(20, 20, 1.0, 0.8), math.inf)      # max of infinite-mean tails
        self.assertTrue(math.isfinite(pareto_order_mean(20, 18, 1.0, 0.8)))  # n-k+1 = 3 > 1/alpha = 1.25
        self.assertEqual(pareto_order_mean(20, 19, 1.0, 0.4), math.inf)      # n-k+1 = 2 <= 1/alpha = 2.5

    def test_sgd_mse_formula_by_simulation(self):
        rng = random.Random(2)
        k, a, eta, sig2, x0 = 4, 1.0, 0.2, 2.0, 1.5
        t, acc, R = 12, 0.0, 30000
        for _ in range(R):
            x = x0
            for _ in range(t):
                xi = sum(rng.gauss(0, math.sqrt(sig2)) for _ in range(k)) / k
                x = x - eta * (a * x + xi)
            acc += x * x
        self.assertAlmostEqual(acc / R, sgd_mse(t, k, a, eta, sig2, x0 ** 2), delta=0.01)

    def test_rounds_are_first_time_below_target_and_pole(self):
        a, eta, s2, x0, eps = 1.0, 0.2, 2.0, 1.0, 0.05
        kmin = min_k(a, eta, s2, eps)
        for k in range(1, 30):
            t = sgd_rounds(k, a, eta, s2, x0, eps)
            if k <= kmin:
                self.assertEqual(t, math.inf)
            else:
                self.assertLessEqual(sgd_mse(t, k, a, eta, s2, x0), eps + 1e-12)
                self.assertGreater(sgd_mse(t - 1, k, a, eta, s2, x0), eps)
        self.assertEqual(sgd_rounds(1, a, eta, s2, x0, eps), math.inf)

    def test_best_k_properties(self):
        base = dict(n=40, mu=1.0, a=1.0, eta=0.2, sigma2=2.0, x0sq=1.0, eps=0.05)
        ks = [best_k(s=s, **base)[0] for s in (0.0, 0.5, 2.0, 8.0, 100.0)]
        self.assertTrue(all(x <= y for x, y in zip(ks, ks[1:])))              # bigger fixed cost -> wait for more
        # negligible tail: k* is the smallest k that still attains the round count of waiting for all (integer rounds)
        r_all = sgd_rounds(40, 1.0, 0.2, 2.0, 1.0, 0.05)
        self.assertEqual(sgd_rounds(ks[-1], 1.0, 0.2, 2.0, 1.0, 0.05), r_all)
        self.assertGreater(ks[-1], 30)
        self.assertLess(ks[0], 40)

    def test_inclusion_probabilities(self):
        self.assertAlmostEqual(inclusion_probs([1.0, 3.0], 1)[0], 0.25, places=4)   # mu1/(mu1+mu2)
        mus = [0.5, 1.0, 2.0, 4.0, 1.5]
        for k in (1, 3, 5):
            p = inclusion_probs(mus, k, steps=1500)
            self.assertAlmostEqual(sum(p), k, places=3)
        self.assertTrue(all(abs(x - 0.4) < 1e-9 for x in inclusion_probs([1.0] * 5, 2, steps=200)))

    def test_inclusion_probabilities_by_simulation(self):
        rng = random.Random(3)
        mus = [0.4, 1.0, 2.5, 1.2]
        cnt = [0] * 4
        R = 40000
        for _ in range(R):
            for i in sample_fastest(mus, 2, rng)[0]:
                cnt[i] += 1
        p = inclusion_probs(mus, 2, steps=2000)
        for i in range(4):
            self.assertAlmostEqual(cnt[i] / R, p[i], delta=0.01)

    def test_ht_unbiased_plain_biased(self):
        rng = random.Random(4)
        mus = [0.3, 0.6, 1.0, 2.0, 3.0]
        theta = [2.0, 1.0, 0.0, -1.0, -2.0]      # slow workers hold the large local optima
        n, k = 5, 2
        pis = inclusion_probs(mus, k, steps=2000)
        R, sums = 40000, [0.0, 0.0, 0.0]
        for _ in range(R):
            S = sample_fastest(mus, k, rng)[0]
            for c, e in enumerate(estimators(theta, pis, S, [0.0] * n)):
                sums[c] += e
        truth = sum(theta) / n
        bias_plain = sum(pis[i] * theta[i] for i in range(n)) / k - truth
        self.assertLess(bias_plain, -0.3)
        self.assertAlmostEqual(sums[0] / R - truth, bias_plain, delta=0.02)      # exact bias formula
        self.assertAlmostEqual(sums[1] / R, truth, delta=0.03)                   # HT unbiased


if __name__ == "__main__":
    unittest.main()
