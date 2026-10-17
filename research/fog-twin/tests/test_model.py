import math
import random
import unittest

from fog_twin.model import (lambertw, range_uniform, elasticity, alpha_from_range, range_bank, alpha_of_visibility, range_quantile,
                            lognormal_quantile_alpha, stopping_distance, safe_speed, p_unsafe, _norm_ppf)


class T(unittest.TestCase):
    def test_lambertw_definition(self):
        for x in (1e-9, 0.01, 0.5, 1.0, 2.718281828, 10, 1e3, 1e8):
            w = lambertw(x)
            self.assertAlmostEqual(w * math.exp(w) / x, 1.0, places=10)

    def test_lambertw_known(self):
        self.assertAlmostEqual(lambertw(math.e), 1.0, places=12)
        self.assertAlmostEqual(lambertw(1.0), 0.5671432904097838, places=12)

    def test_range_satisfies_equation(self):
        for a in (1e-4, 0.01, 0.05, 0.4):
            r = range_uniform(a, 100.0)
            self.assertAlmostEqual(r * math.exp(a * r), 100.0, places=8)

    def test_clear_air_and_limits(self):
        self.assertEqual(range_uniform(0.0, 100.0), 100.0)
        a = 1e-6
        self.assertAlmostEqual(range_uniform(a, 100.0) / (100.0 * (1 - a * 100.0)), 1.0, places=6)
        a, r0 = 1.0, 1e6   # strong extinction: r ~ ln(alpha r0)/alpha, up to a loglog correction
        self.assertLess(range_uniform(a, r0), math.log(a * r0) / a)

    def test_range_monotone_decreasing_in_alpha(self):
        rs = [range_uniform(a, 100.0) for a in (0.0, 0.001, 0.01, 0.1, 1.0)]
        self.assertTrue(all(x > y for x, y in zip(rs, rs[1:])))

    def test_koschmieder(self):
        self.assertAlmostEqual(alpha_of_visibility(1000.0), 0.003912)

    def test_elasticity_matches_finite_difference(self):
        for a in (0.005, 0.02, 0.1):
            h = 1e-6
            fd = -(math.log(range_uniform(a * (1 + h), 100.0)) - math.log(range_uniform(a * (1 - h), 100.0))) / (math.log(1 + h) - math.log(1 - h))
            self.assertAlmostEqual(elasticity(a, 100.0), fd, places=6)
            self.assertLess(elasticity(a, 100.0), 1.0)

    def test_alpha_from_range_roundtrip(self):
        for a in (0.003, 0.03, 0.3):
            self.assertAlmostEqual(alpha_from_range(range_uniform(a, 100.0), 100.0), a, places=10)

    def test_bank_reduces_to_uniform_and_clear(self):
        self.assertAlmostEqual(range_bank(0.02, 0.0, 100.0), range_uniform(0.02, 100.0), places=6)
        self.assertEqual(range_bank(0.5, 120.0, 100.0), 100.0)   # bank starts beyond the clear-air range

    def test_bank_range_between_uniform_and_clear(self):
        r = range_bank(0.05, 40.0, 100.0)
        self.assertLess(r, 100.0)
        self.assertGreater(r, range_uniform(0.05, 100.0))

    def test_quantile_matches_monte_carlo(self):
        rng = random.Random(1)
        med, sg, r0 = 0.02, 0.8, 100.0
        rs = sorted(range_uniform(med * math.exp(sg * rng.gauss(0, 1)), r0) for _ in range(100000))
        for q in (0.05, 0.5, 0.95):
            self.assertAlmostEqual(rs[int(q * len(rs))] / range_quantile(med, sg, r0, q), 1.0, delta=0.01)

    def test_norm_ppf(self):
        self.assertAlmostEqual(_norm_ppf(0.975), 1.959964, places=5)

    def test_safe_speed_inverts_stopping(self):
        for d in (10.0, 40.0, 90.0):
            self.assertAlmostEqual(stopping_distance(safe_speed(d, 5.0, 0.5), 5.0, 0.5), d, places=9)

    def test_p_unsafe_matches_monte_carlo(self):
        rng = random.Random(2)
        med, sg, r0 = 0.02, 0.8, 100.0
        v = safe_speed(60.0, 5.0, 0.5)
        n = 200000
        mc = sum(range_uniform(med * math.exp(sg * rng.gauss(0, 1)), r0) < 60.0 for _ in range(n)) / n
        self.assertAlmostEqual(p_unsafe(v, r0, med, sg, 5.0, 0.5), mc, delta=0.005)

    def test_p_unsafe_clear_air_speed_in_clear_world(self):
        self.assertLess(p_unsafe(safe_speed(50.0, 5.0, 0.5), 100.0, 1e-6, 0.1, 5.0, 0.5), 1e-9)


if __name__ == "__main__":
    unittest.main()
