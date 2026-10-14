import math
import unittest

from friction_twin.model import (real_stop_distance, real_stop_time, twin_stop_distance, twin_time_to_speed,
                                 simulate_coast, fit_k, fit_k_closed, fit_affine, crossover_speed, max_rel_error,
                                 minimax_k)

M, B, C = 1.0, 1.0, 0.5


class T(unittest.TestCase):
    def test_closed_form_matches_rk4(self):
        for v0 in (0.3, 2.0, 20.0):
            d, t = simulate_coast(v0, M, B, C, dt=1e-3)
            self.assertAlmostEqual(d / real_stop_distance(v0, M, B, C), 1, places=6)
            self.assertAlmostEqual(t / real_stop_time(v0, M, B, C), 1, places=6)

    def test_limits(self):
        self.assertAlmostEqual(real_stop_distance(1e-4, M, B, C) / (M * 1e-8 / (2 * C)), 1, places=3)  # Coulomb: v^2/2c
        self.assertAlmostEqual(real_stop_distance(1e6, M, B, C) / (M * 1e6 / B), 1, places=4)          # viscous: m v/b
        self.assertAlmostEqual(real_stop_distance(1.0, M, B, 1e-9), M * 1.0 / B, places=6)             # c -> 0

    def test_twin_never_stops(self):
        self.assertGreater(twin_time_to_speed(3, 1e-9, M, 1.2), twin_time_to_speed(3, 1e-3, M, 1.2))
        self.assertLess(real_stop_time(3, M, B, C), 2.0)

    def test_fit_closed_form_matches_sample_ls(self):
        vs = [1 + 2 * (i + 0.5) / 4000 for i in range(4000)]
        acc = [(B * v + C) / M for v in vs]
        self.assertAlmostEqual(fit_k(vs, acc, M), fit_k_closed(1, 3, M, B, C), places=5)

    def test_affine_fit_recovers_parameters(self):
        vs = [0.5 + i * 0.01 for i in range(300)]
        b, c = fit_affine(vs, [(B * v + C) / M for v in vs], M)
        self.assertAlmostEqual(b, B, places=9)
        self.assertAlmostEqual(c, C, places=9)

    def test_crossover(self):
        k = fit_k_closed(1, 3, M, B, C)
        v = crossover_speed(M, B, C, k)
        self.assertAlmostEqual(twin_stop_distance(v, M, k), real_stop_distance(v, M, B, C), places=9)
        self.assertLess(twin_stop_distance(0.1, M, k), 1e9)
        self.assertGreater(twin_stop_distance(v / 2, M, k), real_stop_distance(v / 2, M, B, C))
        self.assertLess(twin_stop_distance(2 * v, M, k), real_stop_distance(2 * v, M, B, C))

    def test_minimax_beats_least_squares(self):
        kl = fit_k_closed(0.2, 10, M, B, C)
        km, em = minimax_k(M, B, C, 0.2, 10)
        self.assertLess(em, max_rel_error(kl, M, B, C, 0.2, 10))
        self.assertAlmostEqual(em, max_rel_error(km, M, B, C, 0.2, 10), places=9)

    def test_scale_invariance(self):
        r = []
        for s in (1, 50):
            k = fit_k_closed(s, 3 * s, 1.0, 1.0, 0.5 * s)
            r.append(twin_stop_distance(2 * s, 1.0, k) / real_stop_distance(2 * s, 1.0, 1.0, 0.5 * s))
        self.assertAlmostEqual(r[0], r[1], places=10)


if __name__ == "__main__":
    unittest.main()
