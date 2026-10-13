import math, unittest
from twin_transfer import *

a, b, q, r, s2 = 0.9, 1.0, 1.0, 0.1, 1.0


class T(unittest.TestCase):
    def test_riccati_gain_minimises_cost(self):
        ks = optimal_gain(a, b, q, r)
        for d in (-0.05, 0.05, 0.3):
            self.assertGreater(cost(a, b, ks + d), cost(a, b, ks))
        p = riccati_p(a, b, q, r)
        self.assertAlmostEqual(p, q + a * a * p - (a * b * p) ** 2 / (r + b * b * p), places=10)
        self.assertAlmostEqual(cost(a, b, ks), s2 * p, places=9)

    def test_cost_formula_matches_simulation(self):
        for k in (0.4, optimal_gain(a, b, q, r), 1.6):
            self.assertAlmostEqual(simulate_cost(a, b, k, q, r, s2, 400000, 1000, 3) / cost(a, b, k), 1.0, delta=0.02)

    def test_cost_infinite_beyond_cliff(self):
        ks = optimal_gain(a, b, q, r)
        m = stability_cliff(a, b, ks)
        self.assertTrue(math.isfinite(cost(a, m * 0.99 * b, ks)))
        self.assertTrue(math.isinf(cost(a, m * 1.01 * b, ks)))

    def test_local_regret_matches_exact_for_small_error(self):
        for e in (0.02, -0.02):
            ex, lo = twin_regret(a, b, a, b + e, q, r), local_regret(a, b, b + e, q, r)
            self.assertAlmostEqual(ex / lo, 1.0, delta=0.03)

    def test_regret_is_asymmetric_and_cliff_bites_on_overestimated_twin_gain(self):
        # twin thinks input is weak -> high gain -> deployment overshoots
        self.assertGreater(twin_regret(a, b, a, 0.3 * b), twin_regret(a, b, a, 3 * b))
        self.assertTrue(math.isinf(twin_regret(a, b, a, 0.2 * b)))

    def test_score_gap_is_zero_for_perfect_twin_and_blind_to_b_without_excitation(self):
        self.assertEqual(score_gap(a, b, a, b, 0.3, 0.5), 0.0)
        self.assertEqual(score_gap(a, b, a, 1.4 * b, 0.0, 0.0), 0.0)                  # passive, no probing: db invisible
        self.assertGreater(score_gap(a, b, a, 1.4 * b, 0.0, 0.5), 0.0)

    def test_score_gap_matches_simulation(self):
        rng = random.Random(7)
        ah, bh, kb, v = 0.8, 1.3, 0.5, 0.4
        x, tot, T = 0.0, 0.0, 400000
        for _ in range(T):
            u = -kb * x + rng.gauss(0, math.sqrt(v))
            tot += ((ah - a) * x + (bh - b) * u) ** 2 / (2 * s2)
            x = a * x + b * u + rng.gauss(0, 1)
        self.assertAlmostEqual(tot / T / score_gap(a, b, ah, bh, kb, v), 1.0, delta=0.03)

    def test_closed_loop_blind_twin_has_zero_gap_but_positive_regret(self):
        k = optimal_gain(a, b, q, r)
        ah = 0.8
        bh = blind_direction(a, b, ah, k)
        self.assertAlmostEqual(score_gap_closed_loop(a, b, ah, bh, k), 0.0, places=14)
        self.assertGreater(twin_regret(a, b, ah, bh, q, r), 1e-4)
        self.assertGreater(score_gap(a, b, ah, bh, k, 0.2), 0.0)                      # probing exposes it

    def test_shrinkage_endpoints_and_optimum(self):
        d, sg, S = 0.3, 1.0, 50.0
        self.assertAlmostEqual(shrink_mse(d, sg, S, 0.0), sg / S, places=14)
        ks = kappa_star(d, sg)
        self.assertAlmostEqual(shrink_mse(d, sg, S, ks), sg / (S + ks), places=14)
        for m in (0.5, 0.9, 1.1, 2.0):
            self.assertGreater(shrink_mse(d, sg, S, m * ks), shrink_mse(d, sg, S, ks))
        self.assertLess(shrink_mse(d, sg, S, ks), min(sg / S, d * d))

    def test_twin_worth_is_the_sample_saving_at_any_target(self):
        d, sg, v = 0.3, 1.0, 0.5
        for tgt in (0.02, 0.005, 0.001):
            self.assertAlmostEqual(samples_needed(d, sg, v, tgt, kappa=0.0) - samples_needed(d, sg, v, tgt), n_eff(d, sg, v), places=8)
        self.assertAlmostEqual(samples_needed(d, sg, v, 0.05, kappa=0.0) - samples_needed(d, sg, v, 0.05, kappa=2 * kappa_star(d, sg)) > 0, True)

    def test_shrinkage_monte_carlo_matches_mse(self):
        d, n, v = 0.3, 60, 0.5
        mse, _, _ = simulate_shrinkage(a, b, b + d, kappa_star(d, s2), n, v, q, r, s2, 20000, 5)
        self.assertAlmostEqual(mse / shrink_mse(d, s2, n * v, kappa_star(d, s2)), 1.0, delta=0.04)

    def test_regret_scales_with_mse_in_the_local_regime(self):
        d, n, v = 0.1, 3200, 0.5
        mse, reg, bad = simulate_shrinkage(a, b, b + d, kappa_star(d, s2), n, v, q, r, s2, 5000, 6)
        want = 0.5 * cost_curvature(a, b, q, r) * gain_sensitivity(a, b, q, r) ** 2 * mse
        self.assertEqual(bad, 0.0)
        self.assertAlmostEqual(reg / want, 1.0, delta=0.05)


import random
if __name__ == "__main__":
    unittest.main()
