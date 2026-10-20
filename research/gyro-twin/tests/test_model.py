import math
import random
import unittest

from gyro_twin.model import (var_heading, var_heading_discrete, var_cross_track, allan_var, t_cross, n_fit,
                             solve_interval, simulate, rate_record, overlapping_allan)

N, K = 0.005, 1e-4


class T(unittest.TestCase):
    def test_discrete_variance_converges_to_continuous(self):
        t = 200.0
        self.assertAlmostEqual(var_heading_discrete(int(t / 0.01), 0.01, N, K) / var_heading(t, N, K), 1.0, places=3)

    def test_discrete_variance_small_cases(self):
        # n=1: theta_1 = N sqrt(dt) xi only (b_0 = 0); n=2: adds b_1 dt = K dt^1.5 eta_0
        self.assertAlmostEqual(var_heading_discrete(1, 0.5, N, K), N * N * 0.5)
        self.assertAlmostEqual(var_heading_discrete(2, 0.5, N, K), N * N * 1.0 + K * K * 0.5 ** 3)

    def test_white_twin_matches_when_K_zero(self):
        self.assertEqual(var_heading(10.0, N, 0.0), N * N * 10.0)

    def test_crossover(self):
        t = t_cross(N, K)
        self.assertAlmostEqual(K * K * t ** 3 / 3, N * N * t)
        self.assertAlmostEqual(allan_var(t * 1.001, N, K) > allan_var(t, N, K), True)
        self.assertAlmostEqual(allan_var(t * 0.999, N, K) > allan_var(t, N, K), True)

    def test_n_fit_matches_allan_at_tau0(self):
        nf = n_fit(N, K, 5.0)
        self.assertAlmostEqual(allan_var(5.0, nf, 0.0), allan_var(5.0, N, K))
        self.assertGreater(nf, N)

    def test_interval_solver(self):
        t = solve_interval(1.0, N, K, z=2.0)
        self.assertAlmostEqual(4 * var_heading(t, N, K), 1.0, places=9)
        self.assertAlmostEqual(solve_interval(1.0, N, 0.0, z=2.0), 1.0 / (4 * N * N), places=6)

    def test_monte_carlo_heading_and_cross_track(self):
        rng = random.Random(3)
        n, dt, v = 400, 0.25, 1.0
        th, ys = [], []
        for _ in range(3000):
            o = simulate(n, dt, N, K, rng, v=v)[n]
            th.append(o[0]); ys.append(o[1])
        t = n * dt
        self.assertAlmostEqual(sum(x * x for x in th) / len(th) / var_heading_discrete(n, dt, N, K), 1.0, delta=0.08)
        self.assertAlmostEqual(sum(x * x for x in ys) / len(ys) / var_cross_track(t, N, K), 1.0, delta=0.1)

    def test_allan_from_simulated_record(self):
        rng = random.Random(5)
        dt = 0.1
        r = rate_record(60000, dt, N, K, rng)
        for m in (10, 100):
            a = overlapping_allan(r, dt, [m])[0]
            self.assertAlmostEqual(a / allan_var(m * dt, N, K), 1.0, delta=0.3)


if __name__ == "__main__":
    unittest.main()
