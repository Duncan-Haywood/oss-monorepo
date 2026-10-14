import math
import random
import unittest
from latency_twin.model import *

A, B, R, S2 = 1.1, 1.0, 1.0, 1.0


def simulate(k, d, dh, rng, T=400000):
    x = [0.0] * (max(d, dh) + 2)
    u = [0.0] * (max(d, dh) + 2)
    tot = 0.0
    for t in range(T):
        y = x[-1 - d]
        xh = A ** dh * y + sum(A ** (dh - 1 - j) * B * u[len(u) - dh + j] for j in range(dh))
        ut = -k * xh
        xn = A * x[-1] + B * ut + rng.gauss(0, 1)
        if abs(xn) > 1e6:
            return math.inf
        if t > 1000:
            tot += x[-1] ** 2 + R * ut ** 2
        x.append(xn); u.append(ut)
        x = x[-(max(d, dh) + 2):]; u = u[-(max(d, dh) + 2):]
    return tot / (T - 1001)


class T(unittest.TestCase):
    def test_smith_matches_lyapunov(self):
        k = lqr_gain(A, B, R)
        for d in range(5):
            self.assertAlmostEqual(cost(A, B, R, S2, k, d, d), smith_cost(A, B, R, S2, d), places=8)

    def test_lyapunov_matches_simulation(self):
        k = lqr_gain(A, B, R)
        s = simulate(k, 1, 1, random.Random(3))
        self.assertLess(abs(s / smith_cost(A, B, R, S2, 1) - 1), 0.03)

    def test_mismatch_cost_matches_simulation(self):
        k = lqr_gain(A, B, R)
        s = simulate(k, 1, 0, random.Random(4))
        self.assertLess(abs(s / cost(A, B, R, S2, k, 1, 0) - 1), 0.05)

    def test_stable_interval_boundary(self):
        for d in range(0, 5):
            lo, hi = static_gain_stable_range(A, B, d)
            for k, ok in ((lo + 1e-3, True), (hi - 1e-3, True), (lo - 1e-3, False), (hi + 1e-3, False)):
                f, _ = closed_loop(A, B, k, d, 0)
                self.assertEqual(spectral_radius(f) < 1, ok, (d, k))

    def test_delay_one_edge_is_one(self):
        self.assertAlmostEqual(static_gain_stable_range(A, B, 1)[1], 1.0, places=6)

    def test_margin_and_unstable_cost(self):
        k = lqr_gain(A, B, R)
        m = delay_margin(A, B, k)
        self.assertEqual(m, 1)
        self.assertEqual(cost(A, B, R, S2, k, m + 1), math.inf)

    def test_margin_matches_brute_force(self):
        for a in (1.05, 1.5, 2.0):
            k = lqr_gain(a, B, R)
            brute = -1
            for d in range(12):
                f, _ = closed_loop(a, B, k, d, 0)
                if spectral_radius(f) >= 1:
                    break
                brute = d
            self.assertEqual(delay_margin(a, B, k), brute, a)

    def test_id_formula_close_to_mc(self):
        p = id_error_mc(1.0, 40, random.Random(5), runs=6000)
        self.assertLess(abs(p - id_error_gauss(1.0, 40)), 0.015)


if __name__ == "__main__":
    unittest.main()
