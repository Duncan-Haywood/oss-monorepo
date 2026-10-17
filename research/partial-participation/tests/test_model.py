import math, unittest
from partial_participation import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_inv_mean_full_participation_and_single_worker(self):
        self.assertAlmostEqual(inv_mean(7, 1.0), 1 / 7, places=12)
        self.assertAlmostEqual(inv_mean(1, 0.3), 1.0, places=12)

    def test_inv_mean_exceeds_jensen_bound_and_matches_expansion(self):
        for N, p in ((10, 0.5), (50, 0.2), (200, 0.5)):
            self.assertGreater(inv_mean(N, p), 1 / (N * p))
        self.assertAlmostEqual(inv_mean(200, 0.5) / inv_mean_approx(200, 0.5), 1.0, delta=2e-4)

    def test_rule_a_reduces_to_noisy_local_sgd_at_full_participation(self):
        # alpha V (1+beta)/((1-beta) s (2(1+beta) - alpha s)) with V = Vw/N, beta = 0
        eta, sg, N, H, al = 0.3, 0.8, 6, 5, 0.7
        want = sum(0.5 * a * al * (worker_noise(eta, a, sg, H) / N) / (curvature(eta, a, H) * (2 - al * curvature(eta, a, H)))
                   for a in A)
        self.assertAlmostEqual(floor_avg(A, eta, sg, N, 1.0, H, al), want, places=12)
        self.assertAlmostEqual(floor_fixed(A, eta, sg, N, 1.0, H, al), want, places=12)

    def test_rule_a_penalty_is_alpha_free(self):
        full = floor_avg(A, 0.4, 1.0, 12, 1.0, 4, 0.5)
        for al in (0.2, 0.9, 1.5):
            f1 = floor_avg(A, 0.4, 1.0, 12, 1.0, 4, al)
            fp = floor_avg(A, 0.4, 1.0, 12, 0.4, 4, al)
            self.assertAlmostEqual(fp / f1, penalty_avg(12, 0.4), places=10)
        self.assertGreater(full, 0)

    def test_rule_b_stability_limit(self):
        s, N, p = 0.6, 4, 0.25
        am = alpha_max_fixed(s, N, p)
        self.assertLess(am, 2 / s)
        self.assertTrue(math.isinf(_f := floor_fixed([1.0], 1.0, 1.0, N, p, 1, 2.0)) or _f > 0)
        self.assertTrue(math.isfinite(floor_fixed(A, 0.4, 1.0, N, p, 3, 0.99 * min(alpha_max_fixed(curvature(0.4, a, 3), N, p) for a in A))))
        self.assertTrue(math.isinf(floor_fixed(A, 0.4, 1.0, N, p, 3, 1.01 * min(alpha_max_fixed(curvature(0.4, a, 3), N, p) for a in A))))

    def test_rule_b_penalty_formula(self):
        eta, sg, N, p, H, al = 0.4, 1.0, 10, 0.5, 3, 0.6
        s = curvature(eta, 1.0, H)
        got = floor_fixed([1.0], eta, sg, N, p, H, al) / floor_fixed([1.0], eta, sg, N, 1.0, H, al)
        self.assertAlmostEqual(got, penalty_fixed(N, p, al * s), places=10)

    def test_small_step_matched_speed_ratio_is_E_K_times_E_invK(self):
        # matched per-round rate at small step: alpha_A = alpha_B/(1-p0); floor ratio A/B -> E[K|K>=1] E[1/K|K>=1] >= 1
        N, p, x = 8, 0.25, 1e-6
        p0 = (1 - p) ** N
        fa = x / (1 - p0) * inv_mean(N, p) / 2
        fb = x / (N * p) / 2
        want = (N * p / (1 - p0)) * inv_mean(N, p)
        self.assertAlmostEqual(fa / fb, want, places=9)
        self.assertGreater(want, 1.0)

    def test_rule_b_cannot_contract_faster_than_one_minus_inverse_c_but_rule_a_can(self):
        N, p = 8, 0.25
        best_b = min(contraction_fixed(x / 1000, N, p) for x in range(1, 2000))
        self.assertAlmostEqual(best_b, 1 - 1 / c_factor(N, p), places=5)
        self.assertLess(contraction_avg(1.0, N, p), best_b)
        self.assertAlmostEqual(contraction_avg(1.0, N, p), (1 - p) ** N, places=12)

    def test_contraction_endpoints(self):
        self.assertAlmostEqual(contraction_fixed(0.3, 5, 1.0), 0.49, places=12)
        self.assertAlmostEqual(contraction_avg(0.3, 5, 1.0), 0.49, places=12)
        # fastest Rule B contraction is 1 - 1/c at alpha s = 1/c
        c = c_factor(4, 0.25)
        self.assertAlmostEqual(contraction_fixed(1 / c, 4, 0.25), 1 - 1 / c, places=12)

    def test_variance_matches_simulation(self):
        s, Vw, N, p = 0.5, 1.0, 6, 0.4
        for rule, th in (("A", floor_avg([2.0], 0.5, 1.0, N, p, 1, 0.8)), ("B", floor_fixed([2.0], 0.5, 1.0, N, p, 1, 0.8))):
            # a=2, eta=0.5, H=1 => s=1, Vw = eta^2 sigma^2 = 0.25; loss = a/2 Var = Var
            emp = simulate_var(rule, 1.0, 0.25, 0.8, N, p, 200000, 1000, seed=5)
            self.assertAlmostEqual(emp / th, 1.0, delta=0.05)

    def test_participation_bias_and_ipw_fix(self):
        c, w, p = [0.0, 1.0, 2.0], [0.5, 0.5, 0.5], [0.9, 0.5, 0.1]
        plain, ipw = fixed_point(c, w, p), fixed_point(c, w, p, ipw=True)
        self.assertAlmostEqual(ipw, 1.0, places=12)
        self.assertLess(plain, 0.6)
        self.assertAlmostEqual(simulate_bias(c, w, p, 0.5, 60000, 500, seed=2), plain, delta=0.03)
        self.assertAlmostEqual(simulate_bias(c, w, p, 0.05, 200000, 2000, ipw=True, seed=2), ipw, delta=0.05)


if __name__ == "__main__":
    unittest.main()
