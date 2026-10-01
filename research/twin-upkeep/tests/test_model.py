import math, unittest
from twin_upkeep import *
from twin_upkeep.model import _mat_inv, _mm

a, b, q, r = 0.9, 1.0, 1.0, 0.1


class T(unittest.TestCase):
    def test_pred_var_is_riccati_fixed_point(self):
        for qd, rho, v in ((2e-4, 0.99, 0.68), (1e-3, 1.0, 0.68), (0.05, 0.9, 1.3)):
            P = 1.0
            for _ in range(200000):
                m = rho * rho * P + qd
                P = m / (1 + m * v)
            self.assertAlmostEqual(pred_var(qd, rho, 1.0, v), rho * rho * P + qd, places=10)

    def test_random_walk_closed_form(self):
        qd, s2, v = 3e-4, 1.3, 0.7
        self.assertAlmostEqual(pred_var(qd, 1.0, s2, v), qd / 2 + math.sqrt(qd * qd / 4 + qd * s2 / v), places=14)

    def test_post_var_below_pred_var(self):
        self.assertLess(post_var(1e-3, 0.99, 1.0, 0.7), pred_var(1e-3, 0.99, 1.0, 0.7))

    def test_pred_var_slope_matches_finite_difference(self):
        for qd, rho in ((2e-4, 0.99), (1e-2, 1.0)):
            h = 1e-6
            fd = (pred_var(qd, rho, 1.0, 0.7 + h) - pred_var(qd, rho, 1.0, 0.7 - h)) / (2 * h)
            self.assertAlmostEqual(pred_var_slope(qd, rho, 1.0, 0.7), fd, places=7)

    def test_regret_law_matches_exact_average(self):
        sd = 0.02
        k = optimal_gain(a, b)
        n = 4000
        tot = wt = 0.0
        for i in range(n + 1):
            e = -6 * sd + 12 * sd * i / n
            w = math.exp(-e * e / (2 * sd * sd))
            tot += w * (cost(a, b, optimal_gain(a, b + e)) - cost(a, b, k))
            wt += w
        self.assertAlmostEqual(tot / wt / regret_rate(a, b, sd * sd), 1.0, delta=0.03)

    def test_excitation_cost_is_exact(self):
        k, nu = optimal_gain(a, b), 0.4
        V, v = energy(a, b, k, nu)
        c = a - b * k
        self.assertAlmostEqual(V, (1 + b * b * nu * nu) / (1 - c * c), places=12)
        self.assertAlmostEqual((q + r * k * k) * V + r * nu * nu - (q + r * k * k) * energy(a, b, k, 0.0)[0], dither_cost(a, b, k, nu), places=12)

    def test_frozen_twin_limits(self):
        qd, rho, p0 = 2e-4, 0.99, 0.003
        self.assertAlmostEqual(stale_var(0, p0, qd, rho), p0, places=15)
        self.assertAlmostEqual(stale_var(10 ** 6, p0, qd, rho), qd / (1 - rho * rho), places=12)
        self.assertAlmostEqual(stale_var(50, p0, 1e-4, 1.0), p0 + 50 * 1e-4, places=12)

    def test_information_price_decides_excitation(self):
        a3 = 0.3
        thr = dither_threshold(a3, b, 0.99)
        self.assertAlmostEqual(info_value(a3, b, thr, 0.99) / info_price(a3, b), 1.0, delta=0.01)
        self.assertLess(info_value(a3, b, thr / 3, 0.99), info_price(a3, b))
        self.assertEqual(best_dither(a3, b, thr / 3, 0.99)[0], 0.0)
        self.assertGreater(best_dither(a3, b, thr * 1.5, 0.99)[0], 0.0)

    def test_instability_probability(self):
        self.assertAlmostEqual(instability_prob(a, b, 1e-3), 0.0, places=12)
        k = optimal_gain(a, b)
        z = ((1 + a) / k - b) / 0.5
        self.assertAlmostEqual(instability_prob(a, b, 0.5), 0.5 * math.erfc(z / math.sqrt(2)) + 0.5 * math.erfc(((1 - a) / k + b) / 0.5 / math.sqrt(2)), places=12)

    def test_simulation_matches_mean_field(self):
        qd, rho = 2e-4, 0.99
        k = optimal_gain(a, b)
        m = pred_var(qd, rho, 1.0, energy(a, b, k, 0.0)[1])
        c, e2, u = simulate(a, b, qd, rho, 0.0, 120000, seed=3)
        o, _, _ = simulate(a, b, qd, rho, 0.0, 120000, seed=3, oracle=True)
        self.assertAlmostEqual(e2 / m, 1.0, delta=0.1)
        self.assertAlmostEqual((c - o) / regret_rate(a, b, m), 1.0, delta=0.25)
        self.assertEqual(u, 0.0)

    def test_two_parameter_covariance_solves_riccati(self):
        k = optimal_gain(a, b)
        for nu, rho in ((0.05, 1.0), (0.0, 0.999), (0.3, 0.99)):
            V, _ = energy(a, b, k, nu)
            qa, qb = 1e-6, 2e-6
            P = pred_cov2(qa, qb, 1.0, V, k, nu, rho)
            M = [[V, -k * V], [-k * V, k * k * V + nu * nu]]
            I = _mat_inv(P)
            Ppost = _mat_inv([[I[0][0] + M[0][0], I[0][1] + M[0][1]], [I[1][0] + M[1][0], I[1][1] + M[1][1]]])
            res = max(abs(P[0][0] - rho * rho * Ppost[0][0] - qa), abs(P[0][1] - rho * rho * Ppost[0][1]), abs(P[1][1] - rho * rho * Ppost[1][1] - qb))
            self.assertLess(res, 1e-9 * (1 + P[1][1]))

    def test_blind_direction_needs_excitation(self):
        k = optimal_gain(a, b)
        V, _ = energy(a, b, k, 0.0)
        self.assertIsNone(pred_cov2(1e-6, 1e-6, 1.0, V, k, 0.0, 1.0))
        self.assertIsNotNone(pred_cov2(1e-6, 1e-6, 1.0, V, k, 0.0, 0.999))
        self.assertEqual(excess_rate2(a, b, 1e-6, 1e-6, 0.0), math.inf)

    def test_excitation_scaling_law(self):
        n1 = best_dither2(a, b, 1e-9, 1e-9)[0]
        n2 = best_dither2(a, b, 1e-6, 1e-6)[0]
        self.assertAlmostEqual(math.log(n2 / n1) / math.log(1000), 1 / 6, delta=0.01)


if __name__ == "__main__":
    unittest.main()
