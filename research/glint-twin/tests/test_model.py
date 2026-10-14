import math
import random
import unittest

from glint_twin.model import (glint, centroid, mean_y, var_y, tail_prob, outside_span_prob, quantile, gaussian_twin_tail,
                              median_density, median_var_per_look, mean_bias, sample, median, y_min, y_max, rms_error,
                              mean_est, real_rms_mean_to_centroid, twin_rms_mean, mean_beats_median_var)

N = 200000


def phi_grid(n=N):
    return [2 * math.pi * (i + 0.5) / n for i in range(n)]


class T(unittest.TestCase):
    def test_estimate_formula_matches_complex_ratio(self):
        for r in (0.2, 0.7):
            for phi in (0.3, 1.7, 3.0, 5.5):
                z = r * complex(math.cos(phi), math.sin(phi))
                self.assertAlmostEqual(glint(r, phi), ((1 - z) / (1 + z)).real, places=12)

    def test_mean_is_strong_scatterer(self):
        for r in (0.1, 0.5, 0.9):
            m = sum(glint(r, p) for p in phi_grid()) / N
            self.assertAlmostEqual(m, 1.0, places=3)
            self.assertEqual(mean_y(r), 1.0)

    def test_variance(self):
        for r in (0.1, 0.5, 0.8):
            ys = [glint(r, p) for p in phi_grid()]
            v = sum((y - 1) ** 2 for y in ys) / N
            self.assertAlmostEqual(v, var_y(r), delta=2e-3 * max(1.0, var_y(r)))

    def test_median_is_centroid(self):
        for r in (0.1, 0.5, 0.9):
            self.assertAlmostEqual(glint(r, math.pi / 2), centroid(r), places=12)
            ys = sorted(glint(r, p) for p in phi_grid(20001))
            self.assertAlmostEqual(ys[10000], centroid(r), places=3)

    def test_range(self):
        for r in (0.3, 0.9):
            ys = [glint(r, p) for p in phi_grid(20001)]
            self.assertAlmostEqual(min(ys), y_min(r), places=4)
            self.assertAlmostEqual(max(ys), y_max(r), delta=1e-3 * y_max(r))

    def test_tail_matches_grid(self):
        for r in (0.3, 0.6, 0.9):
            for y in (0.5, 1.0, 2.0, 5.0):
                g = sum(glint(r, p) > y for p in phi_grid()) / N
                self.assertAlmostEqual(tail_prob(y, r), g, places=3)

    def test_outside_span(self):
        for r in (0.0001, 0.5, 0.9, 0.999):
            self.assertAlmostEqual(outside_span_prob(r), tail_prob(1.0, r), places=9)
        self.assertAlmostEqual(outside_span_prob(0.5), 1 / 3, places=12)

    def test_tail_limits(self):
        self.assertEqual(tail_prob(y_max(0.5) + 1, 0.5), 0.0)
        self.assertEqual(tail_prob(y_min(0.5) / 2, 0.5), 1.0)

    def test_quantile_inverts_tail(self):
        for r in (0.3, 0.8):
            for p in (0.1, 0.5, 0.9, 0.99):
                self.assertAlmostEqual(tail_prob(quantile(p, r), r), 1 - p, places=9)

    def test_bias(self):
        self.assertAlmostEqual(mean_bias(0.5), 2 * 0.25 / 1.25, places=12)

    def test_median_density_and_variance(self):
        r = 0.6
        m = centroid(r)
        h = 0.02
        a = tail_prob(m - h, r) - tail_prob(m + h, r)
        self.assertAlmostEqual(a / (2 * h), median_density(r), delta=0.01 * median_density(r))
        self.assertAlmostEqual(median_var_per_look(r), 1 / (4 * median_density(r) ** 2), places=12)

    def test_sample_median_variance_matches_asymptotic(self):
        r, n = 0.5, 99
        e = rms_error(r, n, median, centroid(r), trials=4000, seed=5) ** 2
        self.assertAlmostEqual(e * n, median_var_per_look(r), delta=0.08 * median_var_per_look(r))

    def test_mean_rms_to_centroid(self):
        r, n = 0.5, 25
        e = rms_error(r, n, mean_est, centroid(r), trials=20000, seed=2)
        self.assertAlmostEqual(e, real_rms_mean_to_centroid(r, n), delta=0.03)

    def test_twin_overpromises_mean(self):
        self.assertLess(twin_rms_mean(0.5, 10000), real_rms_mean_to_centroid(0.5, 10000))
        self.assertAlmostEqual(real_rms_mean_to_centroid(0.5, 10 ** 12), abs(mean_bias(0.5)), places=5)

    def test_gaussian_twin_tail_matches_moments(self):
        self.assertAlmostEqual(gaussian_twin_tail(centroid(0.5), 0.5), 0.5, places=12)

    def test_mean_vs_median_crossover(self):
        self.assertFalse(mean_beats_median_var(0.5))
        self.assertTrue(mean_beats_median_var(0.1))

    def test_sample_range(self):
        ys = sample(0.5, 1000, random.Random(1))
        self.assertGreaterEqual(min(ys), y_min(0.5) - 1e-12)
        self.assertLessEqual(max(ys), y_max(0.5) + 1e-12)


if __name__ == "__main__":
    unittest.main()
