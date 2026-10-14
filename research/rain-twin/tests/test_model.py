import math
import random
import unittest

from rain_twin.model import (lambert_w, uniform_rain_range, moment_ratio, cell_moment, mean_atten_per_km, var_atten, draw_rates,
                             make_atten, r_det, margin_db, sample_r_det, detect_prob)

K, G, RFS, ELL, P, M = 0.012, 1.2, 20.0, 1.0, 0.2, 10.0


class T(unittest.TestCase):
    def test_lambert(self):
        for x in (0.0, 1e-6, 0.5, 1.0, 10.0, 1e4):
            w = lambert_w(x)
            self.assertAlmostEqual(w * math.exp(w), x, delta=1e-9 * max(1, x))
        self.assertAlmostEqual(lambert_w(math.e), 1.0, places=12)

    def test_uniform_range_solves_equation(self):
        for rate in (1.0, 5.0, 30.0, 100.0):
            r = uniform_rain_range(RFS, K, G, rate)
            self.assertAlmostEqual(margin_db(r, RFS), 2 * K * rate ** G * r, places=9)
        self.assertEqual(uniform_rain_range(RFS, K, G, 0.0), RFS)

    def test_uniform_field_matches_closed_form(self):
        rate = 12.0
        self.assertAlmostEqual(r_det([rate] * 20, ELL, K, G, RFS), uniform_rain_range(RFS, K, G, rate), places=6)

    def test_dry_field_is_clear_air(self):
        self.assertAlmostEqual(r_det([0.0] * 20, ELL, K, G, RFS), RFS, places=6)

    def test_atten_monotone_piecewise_linear(self):
        rng = random.Random(3)
        A = make_atten(draw_rates(20, P, M, rng), ELL, K, G)
        vals = [A(0.37 * i) for i in range(54)]
        self.assertTrue(all(b >= a for a, b in zip(vals, vals[1:])))
        self.assertAlmostEqual(A(0.0), 0.0)

    def test_detection_set_is_interval(self):
        rng = random.Random(5)
        rates = draw_rates(20, P, M, rng)
        A = make_atten(rates, ELL, K, G)
        rd = r_det(rates, ELL, K, G, RFS)
        for r in (0.5 * rd, 0.99 * rd):
            self.assertGreaterEqual(margin_db(r, RFS), A(r))
        for r in (1.01 * rd, 0.5 * (rd + RFS)):
            self.assertLess(margin_db(r, RFS), A(r))

    def test_jensen_ratio(self):
        self.assertAlmostEqual(moment_ratio(1.0, 0.2), 1.0)
        self.assertAlmostEqual(moment_ratio(G, P), cell_moment(G, P, M) / (P * M) ** G, places=12)
        self.assertGreater(moment_ratio(G, P), 1.0)
        self.assertAlmostEqual(moment_ratio(G, 1.0), math.gamma(1 + G))   # fully wet exponential: Gamma(1+g)

    def test_mean_and_variance_of_attenuation(self):
        rng = random.Random(11)
        n, tot, tot2 = 40000, 0.0, 0.0
        for _ in range(n):
            a = make_atten(draw_rates(20, P, M, rng), ELL, K, G)(20.0)
            tot += a
            tot2 += a * a
        mean = tot / n
        self.assertAlmostEqual(mean / (20.0 * mean_atten_per_km(K, G, P, M)), 1.0, delta=0.03)
        var = tot2 / n - mean ** 2
        self.assertAlmostEqual(var / var_atten(20.0, ELL, K, G, P, M), 1.0, delta=0.12)

    def test_detect_prob_bounds(self):
        s = sample_r_det(300, ELL, K, G, RFS, P, M)
        self.assertEqual(detect_prob(s, 1e-3), 1.0)
        self.assertEqual(detect_prob(s, RFS + 1), 0.0)


if __name__ == "__main__":
    unittest.main()
