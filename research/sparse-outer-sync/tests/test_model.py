import math, unittest
from sparse_outer_sync import *
from sparse_outer_sync.model import _ef_denominator

s, V = 1.0, 1.0


class T(unittest.TestCase):
    def test_full_bandwidth_recovers_uncompressed(self):
        for N, al in ((1, 0.4), (5, 1.1)):
            self.assertAlmostEqual(floor_ef(s, V, al, N, 1.0), floor_full(s, V, al, N), places=12)
            self.assertAlmostEqual(floor_unbiased(s, V, al, N, 1.0), floor_full(s, V, al, N), places=12)
            self.assertAlmostEqual(floor_ef_closed(s, V, al, N, 1.0), floor_full(s, V, al, N), places=12)

    def test_single_worker_closed_form(self):
        for p, al in ((0.5, 0.3), (0.2, 0.1), (0.8, 1.2)):
            want = al * V / (s * (2 - al * s * (2 / p - 1)))
            self.assertAlmostEqual(floor_ef(s, V, al, 1, p), want, places=10)

    def test_general_closed_form_matches_moment_solve(self):
        for N, p, al in ((2, 0.5, 0.6), (4, 0.25, 0.4), (16, 0.1, 0.3), (32, 0.5, 1.5)):
            self.assertAlmostEqual(floor_ef_closed(s, V, al, N, p) / floor_ef(s, V, al, N, p), 1.0, places=9)

    def test_scaling_in_s_and_V(self):
        # Var = (V/s^2) g(alpha s)
        g = floor_ef(1.0, 1.0, 0.2, 4, 0.3)
        self.assertAlmostEqual(floor_ef(2.0, 3.0, 0.1, 4, 0.3), 3.0 / 4.0 * g, places=10)

    def test_small_step_penalty_is_alpha_s_times_w_and_free_of_N(self):
        p = 0.2
        w = 1 / p - 1
        for N in (1, 6, 40):
            al = 1e-3
            r = floor_ef(s, V, al, N, p) / floor_full(s, V, al, N)
            self.assertAlmostEqual(r, 1 + al * s * w, delta=3e-5 * 10)

    def test_unbiased_pays_the_bandwidth_ef_does_not(self):
        p, al = 0.1, 1e-3
        self.assertAlmostEqual(floor_unbiased(s, V, al, 8, p) / floor_full(s, V, al, 8), 1 / p, delta=0.02)
        self.assertLess(floor_ef(s, V, al, 8, p) / floor_full(s, V, al, 8), 1.02)

    def test_stability_limits(self):
        for N, p in ((1, 0.5), (4, 0.25), (32, 0.1)):
            au, ae = alpha_max_unbiased(s, N, p), alpha_max_ef(s, N, p)
            self.assertTrue(math.isinf(floor_unbiased(s, V, au * 1.001, N, p)))
            self.assertTrue(math.isfinite(floor_unbiased(s, V, au * 0.999, N, p)))
            self.assertTrue(math.isinf(floor_ef(s, V, ae * 1.002, N, p)))
            self.assertTrue(math.isfinite(floor_ef(s, V, ae * 0.998, N, p)))
            self.assertLess(_ef_denominator(s, ae * 0.999, N, p) * _ef_denominator(s, ae * 1.001, N, p), 0)
        self.assertAlmostEqual(alpha_max_ef(s, 1, 0.5), 2 * 0.5 / (2 - 0.5), places=6)

    def test_mean_rate_is_sqrt_one_minus_p_in_critical_band(self):
        for p in (0.5, 0.1, 0.02):
            lo, hi = critical_alpha_s(p)
            for x in (lo * 1.001, 0.5 * (lo + hi), hi * 0.999):
                self.assertAlmostEqual(mean_rate(x, p), fastest_rate(p), places=9)
            self.assertGreater(mean_rate(lo * 0.5, p), fastest_rate(p))
            self.assertGreater(mean_rate(hi * 1.1, p), fastest_rate(p))
        self.assertAlmostEqual(mean_rate(0.05, 0.3), 1 - 0.05, delta=0.01)   # slow rate ~ 1 - alpha s to leading order

    def test_monte_carlo_matches_exact(self):
        for mode, fl in (("unbiased", floor_unbiased), ("ef", floor_ef)):
            emp = simulate(mode, s, V, 0.4, 3, 0.4, 60000, 500, seed=3)
            self.assertAlmostEqual(emp / fl(s, V, 0.4, 3, 0.4), 1.0, delta=0.05)

    def test_spectrum_is_sum_of_modes(self):
        A = [1.0, 0.3, 0.05]
        eta, sg, H, al, N, p = 0.3, 0.7, 4, 0.5, 6, 0.3
        want = sum(0.5 * a * floor_ef(curvature(eta, a, H), worker_noise(eta, a, sg, H), al, N, p) for a in A)
        self.assertAlmostEqual(loss_spectrum("ef", A, eta, sg, H, al, N, p), want, places=12)

    def test_loss_after_starts_at_x0_and_converges_to_the_floor(self):
        A = [1.0, 0.3]
        eta, sg, H, al, N, p = 0.3, 0.7, 4, 0.5, 6, 0.3
        for rule in ("ef", "unbiased"):
            self.assertAlmostEqual(loss_after(rule, A, eta, sg, H, al, N, p, 0), sum(0.5 * a for a in A), places=12)
            self.assertAlmostEqual(loss_after(rule, A, eta, sg, H, al, N, p, 3000) / loss_spectrum(rule, A, eta, sg, H, al, N, p),
                                   1.0, places=8)

    def test_recursion_fixed_point_is_the_solve(self):
        v = ef_moments(s, V, 0.5, 3, 0.4)
        w = ef_recursion(v, s, V, 0.5, 3, 0.4)
        for x, y in zip(v, w):
            self.assertAlmostEqual(x, y, places=10)


if __name__ == "__main__":
    unittest.main()
