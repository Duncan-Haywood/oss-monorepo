import math, random, unittest
from twin_control_variate import *

a, b, q, r = 0.9, 1.0, 1.0, 0.1
k = 0.4
c = q + r * k * k
T = 12


def brute(alpha, T, c, w):
    x, tot = 0.0, 0.0
    for t in range(T):
        x = alpha * x + w[t]
        tot += x * x
    return c * tot


class Tests(unittest.TestCase):
    def test_gram_matches_direct_quadratic_form(self):
        al = 0.55
        G = gram(al, T)
        rng = random.Random(1)
        w = [rng.gauss(0, 1) for _ in range(T)]
        qf = sum(w[i] * G[i][j] * w[j] for i in range(T) for j in range(T))
        self.assertAlmostEqual(qf, brute(al, T, 1.0, w), places=9)

    def test_moments_by_monte_carlo(self):
        al, at, lam = closed_loop(a, b, k), closed_loop(a, 0.8, k), 0.7
        rng = random.Random(2)
        n = 60000
        ys, xs = [], []
        for _ in range(n):
            w = [rng.gauss(0, 1) for _ in range(T)]
            z = [math.sqrt(lam) * x + math.sqrt(1 - lam) * rng.gauss(0, 1) for x in w]
            ys.append(rollout(al, T, c, w)); xs.append(rollout(at, T, c, z))
        my, mx = sum(ys) / n, sum(xs) / n
        vy = sum((y - my) ** 2 for y in ys) / n
        cv = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / n
        self.assertAlmostEqual(my / mean_cost(al, T, c), 1, delta=0.02)
        self.assertAlmostEqual(mx / mean_cost(at, T, c), 1, delta=0.02)
        self.assertAlmostEqual(vy / var_cost(al, T, c), 1, delta=0.06)
        self.assertAlmostEqual(cv / cov_cost(al, at, T, c, lam), 1, delta=0.08)

    def test_rho_identities(self):
        al = closed_loop(a, b, k)
        self.assertAlmostEqual(rho(al, al, T, 1.0), 1.0, places=12)
        self.assertAlmostEqual(rho(al, al, T, 0.6), 0.6, places=12)
        self.assertAlmostEqual(rho(al, closed_loop(a, 0.7, k), T, 0.0), 0.0, places=12)
        self.assertLess(rho(al, closed_loop(a, 0.7, k), T), 1.0)

    def test_rho_matches_cov_over_sd(self):
        al, at = closed_loop(a, b, k), closed_loop(a, 1.3, k)
        v = cov_cost(al, at, T, c, 0.9) / math.sqrt(var_cost(al, T, c) * var_cost(at, T, c))
        self.assertAlmostEqual(v, rho(al, at, T, 0.9), places=12)

    def test_optimal_allocation_is_minimal(self):
        for rr, w in ((0.9, 0.01), (0.6, 0.001), (0.95, 0.1)):
            B = 1000.0
            best = best_variance(1.0, B, rr, w)
            for m in (1.0, 1.5, 2, 5, 10, 30, 100, 300, 1000):
                n = B / (1 + m * w)
                if m * n < n:
                    continue
                self.assertGreaterEqual(cv_variance(1.0, n, m * n, rr) + 1e-15, best)
            m = best_ratio(rr, w)
            n = B / (1 + m * w)
            self.assertAlmostEqual(cv_variance(1.0, n, m * n, rr), best, places=12)

    def test_speedup_limits(self):
        self.assertAlmostEqual(speedup(0.9, 1e-12), 1 / (1 - 0.81), places=4)
        self.assertEqual(speedup(0.1, 0.5), 1.0)
        self.assertEqual(speedup(0.0, 0.01), 1.0)

    def test_cv_estimator_unbiased_and_variance(self):
        al, at, lam = closed_loop(a, b, k), closed_loop(a, 0.8, k), 0.9
        mu = mean_cost(al, T, c)
        rr = rho(al, at, T, lam)
        n, N = 12, 60
        rng = random.Random(3)
        R = 4000
        ests = []
        for _ in range(R):
            _, _, e, _, _, _ = coverage_trial(rng, al, at, T, c, 1.0, lam, n, N, beta=rr * math.sqrt(var_cost(al, T, c) / var_cost(at, T, c)))
            ests.append(e)
        m = sum(ests) / R
        v = sum((e - m) ** 2 for e in ests) / R
        pred = cv_variance(var_cost(al, T, c), n, N, rr)
        self.assertAlmostEqual(m / mu, 1, delta=0.01)
        self.assertAlmostEqual(v / pred, 1, delta=0.08)

    def test_crossover(self):
        self.assertAlmostEqual(twin_only_crossover(4.0, 2.0), 1.0)
        self.assertLess(twin_only_crossover(4.0, 2.0, 1.0, 10), 1.0)

    def test_perfect_twin_variance_is_var_over_N(self):
        al = closed_loop(a, b, k)
        self.assertAlmostEqual(cv_variance(2.0, 10, 40, 1.0), 2.0 / 40)
        self.assertAlmostEqual(speedup(1.0, 0.01), 100.0, places=9)
        rng = random.Random(5)
        _, _, e, se, _, _ = coverage_trial(rng, al, al, T, c, 1.0, 1.0, 10, 40)
        self.assertAlmostEqual(se / math.sqrt(var_cost(al, T, c) / 40), 1, delta=0.5)


if __name__ == "__main__":
    unittest.main()
