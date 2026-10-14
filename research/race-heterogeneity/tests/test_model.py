import math, random, unittest
from race_heterogeneity import *


class T(unittest.TestCase):
    def test_symmetric_win_prob(self):
        for n, k in [(5, 2), (8, 3)]:
            self.assertAlmostEqual(win_prob(1.0, [1.0] * (n - 1), k), k / n, places=3)

    def test_tullock_k1_heterogeneous(self):
        self.assertAlmostEqual(win_prob(2.0, [1.0, 3.0], 1), 2 / 6, places=3)

    def test_win_probs_sum_to_k(self):
        rates = [0.5, 1.0, 2.0, 3.0, 0.7]
        for k in (1, 2, 4):
            tot = sum(win_prob(rates[i], rates[:i] + rates[i + 1:], k) for i in range(5))
            self.assertAlmostEqual(tot, k, places=2)

    def test_elasticity_symmetric_closed_form(self):
        for n, k in [(6, 2), (8, 5)]:
            self.assertAlmostEqual(elasticity(1.0, [1.0] * (n - 1), k), e_sym(n, k), places=3)

    def test_solver_recovers_speed_race_symmetric(self):
        n, k, R, c = 8, 3, 2.0, 1.0
        m = solve([n], [c], k, R=R)
        self.assertAlmostEqual(m[0], sym_speed(n, k, R, c), delta=2e-3)

    def test_convex_cost_symmetric(self):
        n, k, R, c, p = 6, 2, 3.0, 0.5, 2.0
        m = solve([n], [c], k, R=R, p=p)
        self.assertAlmostEqual(m[0], sym_speed(n, k, R, c, p), delta=2e-3)

    def test_slower_type_runs_slower_and_wins_less(self):
        counts, costs, k = [3, 3], [1.0, 2.0], 2
        m = solve(counts, costs, k)
        self.assertGreater(m[0], m[1])
        self.assertGreater(win_prob(m[0], _o(counts, m, 0), k), win_prob(m[1], _o(counts, m, 1), k))

    def test_equilibrium_no_profitable_deviation(self):
        counts, costs, k = [3, 3], [1.0, 2.0], 2
        m = solve(counts, costs, k)
        for t in (0, 1):
            self.assertLess(best_response_gain(counts, costs, m, k, t), 2e-3)

    def test_expected_kth_symmetric(self):
        n, k, x = 7, 3, 1.3
        self.assertAlmostEqual(expected_kth([x] * n, k), (harmonic(n) - harmonic(n - k)) / x, delta=2e-2)

    def test_simulation_matches_win_prob(self):
        rng = random.Random(1)
        rates = [2.0, 1.0, 1.0, 0.5]
        paid, _ = simulate(rates, 2, rng, 40000)
        self.assertAlmostEqual(paid[0], win_prob(2.0, rates[1:], 2), delta=0.01)

    def test_exit_ratio_values(self):
        self.assertAlmostEqual(exit_ratio(4, 1), 4 / 3)
        self.assertAlmostEqual(exit_ratio(4, 2), 2.0)
        self.assertEqual(exit_ratio(4, 4), math.inf)

    def test_entry_pays_below_threshold_and_not_above(self):
        for k in (1, 2, 3):
            th = exit_ratio(4, k)
            xs = [0.001 * i for i in range(1, 300)]
            below = max(entry_payoff(x, 4, k, 1.0, 0.9 * th) for x in xs)
            above = max(entry_payoff(x, 4, k, 1.0, 1.1 * th) for x in xs)
            self.assertGreater(below, 1e-3)
            self.assertLess(above, 0.0)

    def test_mean_cost_time_matches_when_all_active(self):
        counts, costs, k = [4, 4], [1.0, 2.0], 4
        m = solve(counts, costs, k, steps=1500, iters=400, damp=0.7, tol=1e-11)
        T = expected_kth([m[0]] * 4 + [m[1]] * 4, k, 6000)
        self.assertAlmostEqual(T, mean_cost_time(8, k, 1.0, [1.0] * 4 + [2.0] * 4), delta=2e-3)


def _o(counts, m, t):
    from race_heterogeneity.model import _others
    return _others(counts, m, t)


if __name__ == "__main__":
    unittest.main()
