import math, unittest
from twin_recalibration import *

a, b, ve = 0.9, 1.0, 1.0


class T(unittest.TestCase):
    def test_regret_coef_matches_exact_average(self):
        sd = 0.02
        k = optimal_gain(a, b)
        n, tot, wt = 4000, 0.0, 0.0
        for i in range(n + 1):
            e = -6 * sd + 12 * sd * i / n
            w = math.exp(-e * e / (2 * sd * sd))
            tot += w * (cost(a, b, optimal_gain(a, b + e)) - cost(a, b, k))
            wt += w
        self.assertAlmostEqual(tot / wt / (regret_coef(a, b) * sd * sd), 1.0, delta=0.03)

    def test_experiment_cost_linear_in_energy(self):
        c1, c2, c3 = (exp_step_cost(a, b, v) for v in (1.0, 2.0, 3.0))
        self.assertAlmostEqual(c3 - c2, c2 - c1, places=12)
        # exact transient cost of a long experiment approaches N * c (per-step steady state) + a constant
        big, more = exp_cycle_cost(a, b, 400, ve), exp_cycle_cost(a, b, 401, ve)
        self.assertAlmostEqual(more - big, exp_step_cost(a, b, ve), places=6)

    def test_window_estimate_variance_matches_enumeration(self):
        # error of the window-average of a random walk relative to its last value: variance qd (N-1)(2N-1)/(6N)
        N, qd = 7, 0.3
        # b_N - mean_i b_i = sum_{s=2..N} eta_s (s-1)/N
        v = qd * sum(((s - 1) / N) ** 2 for s in range(2, N + 1))
        self.assertAlmostEqual(est_var0(N, 1.0, qd, 1.0) - 1.0 / N, v, places=12)

    def test_closed_form_is_stationary_point_of_idealised_cost(self):
        qd = 1e-5
        cf = closed_form(a, b, qd, ve)
        N, T = cf['N'], cf['T']
        rho, c = cf['rho'], cf['c']
        f = lambda N, T: N * c / T + rho / (N * ve) + rho * qd * T / 2
        e = f(N, T)
        for dN, dT in ((0.01 * N, 0), (-0.01 * N, 0), (0, 0.01 * T), (0, -0.01 * T)):
            self.assertGreater(f(N + dN, T + dT), e)
        self.assertAlmostEqual(cf['excess'], e - rho * qd / 2, places=12)

    def test_equal_thirds(self):
        cf = closed_form(a, b, 1e-4, ve)
        N, T, rho, c = cf['N'], cf['T'], cf['rho'], cf['c']
        terms = (N * c / T, rho / (N * ve), rho * 1e-4 * T / 2)
        for t in terms:
            self.assertAlmostEqual(t, cf['third'], places=12)

    def test_discrete_optimum_close_to_closed_form(self):
        qd = 1e-5
        cf = closed_form(a, b, qd, ve)
        N, L, e = best_schedule(a, b, qd, ve, exact_cost=False, drift_in_window=False)
        self.assertAlmostEqual(e / cf['excess'], 1.0, delta=0.02)
        self.assertAlmostEqual((N + L) / cf['T'], 1.0, delta=0.15)

    def test_cliff_estimate_is_stability_boundary(self):
        h = cliff_estimate(a, b)
        self.assertAlmostEqual(b * optimal_gain(a, h), 1 + a, places=9)

    def test_fail_prob_monotone(self):
        self.assertLess(fail_prob(a, b, 0.01, 1e-4, 500), fail_prob(a, b, 0.05, 1e-4, 500))
        self.assertLess(fail_prob(a, b, 0.01, 1e-4, 500), fail_prob(a, b, 0.01, 1e-4, 5000))
        self.assertLess(fail_prob(a, b, 1e-4, 0.0, 1), 1e-12)

    def test_simulation_recovers_excess_when_tails_are_negligible(self):
        qd, N, L = 1e-5, 60, 3000
        m = cycle_excess(a, b, qd, N, L, ve)
        ex, fails = simulate(a, b, qd, N, L, ve, 300, seed=1)
        self.assertEqual(fails, 0.0)
        self.assertAlmostEqual(ex / m, 1.0, delta=0.25)

    def test_sim_excess_positive_for_noisy_twin(self):
        ex, _ = simulate(a, b, 1e-5, 40, 500, ve, 100, seed=2)
        self.assertGreater(ex, 0.0)


if __name__ == "__main__":
    unittest.main()
