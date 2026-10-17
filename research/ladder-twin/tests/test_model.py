import math, random, unittest
from ladder_twin import *
from ladder_twin.model import _simpson, _var_f

LC = 1.1
SM, IN = SmoothQoI(), IndicatorQoI(math.exp(-LC))


class M(unittest.TestCase):
    def test_level_mean_matches_quadrature(self):
        for l in (0, 3, 6):
            self.assertAlmostEqual(mean_f(l), _simpson(lambda x: f(x, l), A, B) / (B - A), places=9)

    def test_truth_and_bias_shrink(self):
        self.assertAlmostEqual(SM.truth(), (math.exp(-1) - math.exp(-3)) / 2, places=12)
        self.assertAlmostEqual(IN.truth(), (LC - A) / (B - A), places=12)
        for q in (SM, IN):
            self.assertLess(abs(q.bias(9)), abs(q.bias(5)) / 10)

    def test_rates(self):
        self.assertAlmostEqual(fit_rate([abs(SM.bias(l)) for l in (9, 10)]), 1.0, places=2)
        self.assertAlmostEqual(fit_rate([SM.level_var(l) for l in (9, 10)]), 2.0, places=2)
        self.assertAlmostEqual(fit_rate([abs(IN.bias(l)) for l in (9, 10)]), 1.0, places=2)
        self.assertAlmostEqual(fit_rate([IN.level_var(l) for l in (9, 10)]), 1.0, places=2)

    def test_indicator_variance_matches_simulation(self):
        rng = random.Random(5)
        for l in (3, 5):
            v = [IN.sample(l, rng) for _ in range(200000)]
            m = sum(v) / len(v)
            var = sum((x - m) ** 2 for x in v) / (len(v) - 1)
            self.assertLess(abs(var / IN.level_var(l) - 1), 0.03)
            self.assertLess(abs(m - (IN.level_mean(l) - IN.level_mean(l - 1))), 0.002)

    def test_smooth_variance_matches_simulation(self):
        rng = random.Random(6)
        v = [SM.sample(3, rng) for _ in range(200000)]
        m = sum(v) / len(v)
        var = sum((x - m) ** 2 for x in v) / (len(v) - 1)
        self.assertLess(abs(var / SM.level_var(3) - 1), 0.03)

    def test_allocation_meets_variance_target(self):
        for q in (SM, IN):
            L, N, tot = mlmc_cost(q, 1e-3)
            var = sum(q.level_var(l) / n for l, n in enumerate(N))
            self.assertLessEqual(var, 0.5e-6 * 1.0001)
            self.assertLessEqual(abs(q.bias(L)), 1e-3 / math.sqrt(2))
            self.assertGreater(abs(q.bias(L - 1)), 1e-3 / math.sqrt(2))

    def test_optimal_beats_equal_allocation(self):
        L, N, tot = mlmc_cost(SM, 1e-3)
        n = math.ceil(sum(SM.level_var(l) for l in range(L + 1)) * 2.0 / 1e-6)
        self.assertGreater(n * sum(cost(l) for l in range(L + 1)), 10 * tot)

    def test_smooth_saving_grows_failure_saving_small(self):
        s = lambda q, e: single_level_cost(q, e)[2] / mlmc_cost(q, e)[2]
        self.assertGreater(s(SM, 1e-4), 100)
        self.assertGreater(s(SM, 1e-4), 10 * s(SM, 1e-2))
        self.assertLess(s(IN, 1e-2), 1.0)          # MLMC loses at a loose target
        self.assertLess(s(IN, 1e-4), s(SM, 1e-4) / 10)

    def test_mlmc_simulation_error_within_target(self):
        rng = random.Random(7)
        L, N, _ = mlmc_cost(SM, 1e-2)
        errs = [run_mlmc(SM, L, N, rng) - SM.truth() for _ in range(150)]
        rmse = math.sqrt(sum(e * e for e in errs) / len(errs))
        self.assertLess(rmse, 1.1e-2)

    def test_single_level_variance(self):
        rng = random.Random(8)
        vals = [f(rng.uniform(A, B), 4) for _ in range(100000)]
        m = sum(vals) / len(vals)
        self.assertLess(abs(sum((x - m) ** 2 for x in vals) / len(vals) / _var_f(4) - 1), 0.03)


if __name__ == "__main__":
    unittest.main()
