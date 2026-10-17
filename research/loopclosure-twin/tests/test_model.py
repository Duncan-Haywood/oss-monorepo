import math, unittest
from loopclosure_twin import *

S2, TAU2, A, B = 0.01, 1.0, 0.9, 2.0


class T(unittest.TestCase):
    def test_chi2_k2_closed_form(self):
        for x in (0.3, 2.0, 9.0):
            self.assertAlmostEqual(chi2_cdf(2, x), 1 - math.exp(-x / 2), 12)

    def test_chi2_k1_is_erf(self):
        for x in (0.5, 3.84):
            self.assertAlmostEqual(chi2_cdf(1, x), math.erf(math.sqrt(x / 2)), 10)

    def test_reject_power_law(self):
        # gate designed at alpha for variance s_t^2, real variance rho^2 s_t^2: rejection = alpha^(1/rho^2) (k=2)
        alpha, st2 = 0.01, 0.01
        g = -2 * st2 * math.log(alpha)
        for rho in (1.0, 1.5, 2.0):
            self.assertAlmostEqual(reject_true(g, rho ** 2 * st2), alpha ** (1 / rho ** 2), 12)

    def test_closed_form_optimum_matches_numeric(self):
        for s2 in (0.005, 0.01, 0.04, 0.09):
            g1, g2 = opt_gate_k2(s2, TAU2, A, B), opt_gate(s2, TAU2, A, B, 2)
            self.assertAlmostEqual(g1 / g2, 1.0, 5)

    def test_optimum_is_stationary_and_minimal(self):
        g = opt_gate_k2(0.04, TAU2, A, B)
        c = cost(g, 0.04, TAU2, A, B)
        for f in (0.7, 0.9, 1.1, 1.5):
            self.assertGreater(cost(f * g, 0.04, TAU2, A, B), c)

    def test_monte_carlo(self):
        for k in (2, 3):
            g = 0.15
            rt, ra = mc_rates(g, 0.04, 1.0, k, 60000, 1)
            self.assertAlmostEqual(rt, reject_true(g, 0.04, k), delta=0.006)
            self.assertAlmostEqual(ra, accept_false(g, 0.04, 1.0, k), delta=0.006)

    def test_no_regret_when_twin_right(self):
        g = opt_gate_k2(S2, TAU2, A, B)
        self.assertAlmostEqual(regret(g, S2, TAU2, A, B), 0.0, 9)

    def test_clean_twin_gate_is_too_tight(self):
        gt = opt_gate_k2(S2, TAU2, A, B)
        gr = opt_gate_k2(4 * S2, TAU2, A, B)
        self.assertLess(gt, gr)
        self.assertGreater(regret(gt, 4 * S2, TAU2, A, B), 0)

    def test_fit_regret_decreases_and_vanishes(self):
        r = [fitted_regret(n, 0.04, TAU2, A, B) for n in (3, 10, 100, 1000)]
        self.assertTrue(all(r[i] > r[i + 1] for i in range(3)))
        self.assertLess(r[-1], 1e-4)

    def test_fit_regret_matches_simulation(self):
        import random
        n, s2 = 8, 0.04
        rng = random.Random(3)
        c0 = cost(opt_gate_k2(s2, TAU2, A, B), s2, TAU2, A, B)
        tot, R = 0.0, 20000
        for _ in range(R):
            sh = sum(rng.gauss(0, math.sqrt(s2)) ** 2 for _ in range(2 * n)) / (2 * n)
            tot += cost(opt_gate_k2(sh, TAU2, A, B), s2, TAU2, A, B) - c0
        self.assertAlmostEqual(tot / R, fitted_regret(n, s2, TAU2, A, B), delta=0.0015)

    def test_inflation_one_is_twin_gate(self):
        self.assertAlmostEqual(gate_inflation_regret(1.0, S2, 4 * S2, TAU2, A, B),
                               regret(opt_gate_k2(S2, TAU2, A, B), 4 * S2, TAU2, A, B), 6)


if __name__ == "__main__":
    unittest.main()
