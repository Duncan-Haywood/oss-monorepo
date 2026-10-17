import math, random, unittest
from budget_twin import *


class M(unittest.TestCase):
    def test_a_matches_input_twin_numbers(self):
        self.assertAlmostEqual(a_coef(0.5) / 200, 0.255 ** 2, places=3)  # 0.255 relative sd at rho=0.5, n=200

    def test_exchange_rate_limit(self):
        self.assertAlmostEqual(exchange_rate(0.99999), 2.0, places=3)
        self.assertGreater(exchange_rate(0.5), 2.0)

    def test_optimal_split_is_grid_minimum(self):
        for rho, kappa in ((0.5, 0.05), (0.8, 0.5), (0.7, 0.002)):
            B = 1000.0
            n, m, f = optimal_split(rho, kappa, B)
            self.assertAlmostEqual(2 * n + kappa * m, B, places=9)
            best = min(var_total(rho, g * B / 2, (1 - g) * B / kappa) for g in [i / 2000 for i in range(1, 2000)])
            self.assertAlmostEqual(var_total(rho, n, m), min_var(rho, kappa, B), places=12)
            self.assertLessEqual(var_total(rho, n, m), best + 1e-12)
            self.assertLess(best - var_total(rho, n, m), 1e-6)

    def test_sim_mean_unbiased_for_wait(self):
        rng = random.Random(1)
        lam, mu, m, reps = 0.5, 1.0, 400, 3000
        est = sum(sim_mean(rng, lam, mu, m) for _ in range(reps)) / reps
        self.assertAlmostEqual(est, 1.0, delta=0.05)  # W = 0.5/(1*0.5) = 1

    def test_b_coef_matches_simulation(self):
        rng = random.Random(2)
        rho, m, reps = 0.5, 2000, 800
        xs = [sim_mean(rng, rho, 1.0, m) for _ in range(reps)]
        mu_ = sum(xs) / reps
        v = sum((x - mu_) ** 2 for x in xs) / reps
        W = rho / (1 - rho)
        self.assertAlmostEqual(v * m / W ** 2 / b_coef(rho), 1.0, delta=0.12)

    def test_naive_coverage_falls_with_m(self):
        c = [naive_coverage(0.5, 200, m) for m in (100, 1000, 10000, 10 ** 6)]
        self.assertTrue(all(x > y for x, y in zip(c, c[1:])))
        self.assertLess(c[-1], 0.2)
        self.assertAlmostEqual(aware_coverage(0.5, 200, 100), 0.95, places=3)


if __name__ == "__main__":
    unittest.main()
