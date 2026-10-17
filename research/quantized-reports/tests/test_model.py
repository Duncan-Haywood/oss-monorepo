import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from quantized_reports import *
from quantized_reports.model import optimal_density

QS = prior_quantiles("uniform", 20000)


class T(unittest.TestCase):
    def test_brier_uniform_is_1_over_12N2(self):
        for N in (16, 64):
            self.assertAlmostEqual(mean_regret(uniform_grid(N), brier_div, QS) * N * N, 1 / 12, places=4)

    def test_log_uniform_grid_loses_log_factor(self):
        r = [mean_regret(uniform_grid(N), log_div, QS) * N * N for N in (64, 256, 1024)]
        for a, b in zip(r, r[1:]):   # increments -> ln(4)/12
            self.assertAlmostEqual(b - a, 0.11552, delta=0.01)

    def test_optimal_compander_matches_prediction(self):
        N = 128
        g = compander_grid(N, optimal_density("log", "uniform"), 100000)
        got = mean_regret(g, log_div, QS)
        self.assertAlmostEqual(got / predicted_regret(N, "log", "uniform", 50000), 1.0, delta=0.03)

    def test_optimal_beats_uniform_under_log(self):
        N = 64
        g = compander_grid(N, optimal_density("log", "uniform"), 100000)
        self.assertLess(mean_regret(g, log_div, QS), 0.8 * mean_regret(uniform_grid(N), log_div, QS))

    def test_symmetrising_minifloat_helps(self):
        g = minifloat_grid(4, 3)
        self.assertIn(0.0, g); self.assertIn(1.0, g)
        self.assertLess(mean_regret(symmetrized(g), log_div, QS), mean_regret(g, log_div, QS) / 5)

    def test_best_report_not_nearest_under_log(self):
        g = uniform_grid(8)
        diff = sum(min(g, key=lambda r: abs(r - q)) != min(g, key=lambda r: log_div(q, r))
                   for q in (i / 1000 for i in range(1, 1000)))
        self.assertGreater(diff, 0)

    def test_grid_without_endpoints_has_finite_regret_but_zero_report_is_fatal(self):
        self.assertEqual(log_div(0.3, 0.0), float("inf"))
        self.assertLess(mean_regret(uniform_grid(8), log_div, QS), 1)


if __name__ == "__main__":
    unittest.main()
