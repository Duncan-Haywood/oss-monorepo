import math, unittest
from noisy_local_sgd import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_step_noise_matches_direct_sum(self):
        eta, a, sg, M, H = 0.3, 1.2, 0.7, 5, 6
        q = 1 - eta * a
        direct = sum((eta * q ** k) ** 2 for k in range(H)) * sg * sg / M
        self.assertAlmostEqual(step_noise(eta, a, sg, M, H), direct, places=12)

    def test_alpha_one_floor_is_independent_of_H(self):
        base = floor(A, 0.5, 1.0, 4, 1, 1.0)
        for H in (2, 7, 30, 200):
            self.assertAlmostEqual(floor(A, 0.5, 1.0, 4, H, 1.0), base, places=10)

    def test_floor_scales_inversely_with_workers_at_fixed_alpha(self):
        self.assertAlmostEqual(floor(A, 0.5, 1.0, 8, 10, 0.5) * 8, floor(A, 0.5, 1.0, 1, 10, 0.5), places=10)

    def test_small_alpha_floor_falls_with_H_by_exactly_the_mode_factor(self):
        # alpha V/(2s) = alpha eta^2 sigma^2 (1+q^H) / (2 (1-q^2) M): H shrinks it by (1+q^H)/(1+q) in (1/2, 1)
        eta, sg, M, al = 0.2, 1.0, 2, 1e-6
        for H in (1, 5, 50):
            got = floor(A, eta, sg, M, H, al) / floor(A, eta, sg, M, 1, al)
            num = sum(a * (1 + (1 - eta * a) ** H) / (1 - (1 - eta * a) ** 2) for a in A)
            den = sum(a * (1 + (1 - eta * a)) / (1 - (1 - eta * a) ** 2) for a in A)
            self.assertAlmostEqual(got, num / den, places=5)
            self.assertGreater(got, 0.5)

    def test_momentum_matches_plain_step_at_equal_effective_rate_up_to_the_curvature_term(self):
        s, V, ae, b = 0.4, 0.01, 0.8, 0.9
        hb = outer_var(s, V, ae * (1 - b), b)
        want = ae * V / (s * (2 - ae * s * (1 - b) / (1 + b)))
        self.assertAlmostEqual(hb, want, places=12)
        self.assertLess(hb, outer_var(s, V, ae))

    def test_floor_matches_literal_simulation(self):
        a_list, eta, sg, M, H = [1.0, 0.3], 0.4, 1.0, 3, 5
        for alpha, beta in ((0.8, 0.0), (0.3, 0.6)):
            th = floor(a_list, eta, sg, M, H, alpha, beta)
            emp = simulate(a_list, eta, sg, M, H, alpha, beta, 30000, 500, seed=3)
            self.assertAlmostEqual(emp / th, 1.0, delta=0.06)

    def test_alpha_for_floor_inverts_floor(self):
        al = alpha_for_floor(A, 0.5, 1.0, 4, 8, 0.01)
        self.assertAlmostEqual(floor(A, 0.5, 1.0, 4, 8, al), 0.01, places=8)

    def test_mean_sq_converges_to_variance_and_rounds_monotone_in_target(self):
        s = 0.3; V = 0.02
        self.assertAlmostEqual(mean_sq(s, V, 0.5, 10 ** 4), outer_var(s, V, 0.5), places=12)
        r1 = rounds_to(A, 0.5, 1.0, 4, 8, 0.05, 0.05)
        r2 = rounds_to(A, 0.5, 1.0, 4, 8, 0.05, 0.5)
        self.assertGreaterEqual(r1, r2)
        self.assertTrue(math.isinf(rounds_to(A, 0.5, 1.0, 4, 8, 1.0, 1e-9)))

    def test_best_H_beats_every_step_sync_and_grows_as_the_floor_target_falls(self):
        kap = 200
        a_list = [kap ** (-i / 9) for i in range(10)]
        Hs = sorted(set(int(1.5 ** k) for k in range(26)))
        best = [best_H(a_list, 1.0, 1.0, 1, 10, e, Hs) for e in (1e-1, 1e-2, 1e-3)]
        self.assertTrue(best[0][0] < best[1][0] < best[2][0])
        for (H, t, _), e in zip(best, (1e-1, 1e-2, 1e-3)):
            self.assertLess(t, wallclock(a_list, 1.0, 1.0, 1, 1, 10, e)[0])


if __name__ == "__main__":
    unittest.main()
