import math, random, unittest
from saturation_twin import *

A, B, U = 1.2, 1.0, 1.0
L = limit(A, U)


class M(unittest.TestCase):
    def test_lqr_gain_is_riccati_fixed_point(self):
        a, b, q, r = 0.9, 1.0, 1.0, 0.1
        K = lqr_gain(a, b, q, r)
        # verify by minimising the closed-loop cost over K
        def J(k):
            m = a - b * k
            return (q + r * k * k) / (1 - m * m)
        self.assertLess(J(K), J(K + 0.02)); self.assertLess(J(K), J(K - 0.02))

    def test_limit_is_fixed_point_of_full_thrust(self):
        self.assertAlmostEqual(A * L - U, L, places=12)

    def test_no_saturation_when_limit_huge(self):
        K = lqr_gain(A, B, 1, 0.1)
        a = mean_exit_time(A, B, K, None, 1.0, L, N=120, U_model=None)
        b = mean_exit_time(A, B, K, 1e9, 1.0, L, N=120, U_model=1e9)
        self.assertAlmostEqual(a, b, delta=1e-9 * a)

    def test_saturation_shortens_life(self):
        K = lqr_gain(A, B, 1, 0.1)
        self.assertLess(mean_exit_time(A, B, K, U, 1.0, L, N=120, U_model=U),
                        mean_exit_time(A, B, K, None, 1.0, L, N=120, U_model=None))

    def test_larger_noise_shortens_life(self):
        K = lqr_gain(A, B, 1, 0.1)
        t = [mean_exit_time(A, B, K, U, s, L, N=120, U_model=U) for s in (0.8, 1.2, 2.0)]
        self.assertGreater(t[0], t[1]); self.assertGreater(t[1], t[2])

    def test_grid_converges(self):
        K = lqr_gain(A, B, 1, 0.1)
        t1 = mean_exit_time(A, B, K, U, 1.0, L, N=240, U_model=U)
        t2 = mean_exit_time(A, B, K, U, 1.0, L, N=480, U_model=U)
        self.assertAlmostEqual(t1 / t2, 1.0, delta=0.005)

    def test_exact_matches_simulation(self):
        K = lqr_gain(A, B, 1, 0.1)
        rng = random.Random(3)
        n = 1500
        m = sum(simulate_exit(A, B, K, U, 2.0, L, rng) for _ in range(n)) / n
        self.assertAlmostEqual(m / mean_exit_time(A, B, K, U, 2.0, L, N=240, U_model=U), 1.0, delta=0.08)

    def test_twin_saturation_rate_decreases_with_limit(self):
        K = lqr_gain(A, B, 1, 0.1)
        self.assertGreater(twin_sat_rate(A, B, K, 1.0, 0.5), twin_sat_rate(A, B, K, 1.0, 2.0))
