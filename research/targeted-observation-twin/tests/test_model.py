import math, unittest
from targeted_observation_twin import *

n, r = 40, 0.05
V = list(range(24, 32))
SITES = list(range(0, 20))


class T(unittest.TestCase):
    def test_matched_twin_claims_what_it_delivers(self):
        P = exp_cov(n, 0.2)
        o = plan_and_score(P, P, V, SITES, r, 3)
        for a, b in zip(o["claimed"], o["real"]):
            self.assertAlmostEqual(a, b, places=9)
        self.assertLess(o["real"][-1], o["real"][0])

    def test_single_observation_matches_scalar_kalman_formula(self):
        P = exp_cov(n, 0.2)
        P2, _, _ = update(P, P, 19, r)
        i = 25
        self.assertAlmostEqual(P2[i][i], P[i][i] - P[i][19] ** 2 / (P[19][19] + r), places=12)

    def test_monte_carlo_matches_joseph_form(self):
        Pr, Pt = exp_cov(n, 0.2), exp_cov(n, 0.3)
        o = plan_and_score(Pt, Pr, V, SITES, r, 2)
        mc, se = sample_errors(Pt, Pr, V, o["picks"], r, 6000, 3)
        self.assertLess(abs(mc - o["real"][-1]), 4 * se)

    def test_benefit_sign_flips_where_gain_ratio_crosses_two(self):
        Pr, Pt = exp_cov(n, 0.2, nugget=0.0), exp_cov(n, 0.4, nugget=0.0)
        for i in range(1, n):
            g, b = gain_ratio(Pt, Pr, 0, i, r), cell_benefit(Pt, Pr, 0, i, r)
            if abs(g - 2) > 1e-6:
                self.assertEqual(b > 0, g < 2)

    def test_harm_radius_brackets_the_scan(self):
        Pr, Pt = exp_cov(n, 0.2, nugget=0.0), exp_cov(n, 0.3, nugget=0.0)
        d = harm_radius(0.3, 0.2)
        inside = [i for i in range(1, n) if gain_ratio(Pt, Pr, 0, i, r) < 2]
        self.assertLess(max(inside) / n, d + 0.05)
        self.assertGreater(max(inside) / n, d - 0.05)
        self.assertEqual(harm_radius(0.1, 0.2), math.inf)

    def test_over_correlated_twin_harms_under_correlated_does_not(self):
        Pr = exp_cov(n, 0.2)
        base = vtrace(Pr, V)
        self.assertGreater(plan_and_score(exp_cov(n, 0.4), Pr, V, SITES, r, 3)["real"][-1], base)
        self.assertLess(plan_and_score(exp_cov(n, 0.1), Pr, V, SITES, r, 3)["real"][-1], base)

    def test_one_observation_amplitude_error_never_harms(self):
        Pr = exp_cov(n, 0.2)
        for c in (0.1, 10.0, 1000.0):
            Pt = [[c * v for v in row] for row in Pr]
            self.assertLess(plan_and_score(Pt, Pr, V, SITES, r, 1)["real"][-1], vtrace(Pr, V))

    def test_estimate_twin_recovers_length_scale(self):
        import random
        L = cholesky(exp_cov(n, 0.2))
        rng = random.Random(5)
        eh, s2 = estimate_twin([draw(L, rng) for _ in range(400)])
        self.assertAlmostEqual(eh, 0.2, delta=0.02)
        self.assertAlmostEqual(s2, 1.0, delta=0.15)


if __name__ == "__main__":
    unittest.main()
